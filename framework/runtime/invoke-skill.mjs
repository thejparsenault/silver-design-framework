import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { assertV2 } from "./contracts.mjs";
import { resolveGuardrails } from "./guardrails.mjs";
import { discoverProviders } from "./providers.mjs";
import {
  matchesPathPattern,
  resolveCapabilities,
  resolvePermissions,
} from "./permissions.mjs";

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRegistryPath = path.resolve(
  runtimeRoot,
  "../guardrails/registry.yaml",
);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function integrity(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function inside(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (
    resolved === resolvedRoot ||
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Output path escapes workspace: ${relativePath}`);
  }
  return resolved;
}

function outputRule(contract, reference) {
  return contract.outputs.find(
    (output) =>
      output.kind === reference.kind &&
      matchesPathPattern(output.path_pattern, reference.path),
  );
}

function permissionRequest(rule, action, outputPath) {
  const capability =
    rule.authority === "canonical-with-approval"
      ? "canonical-artifact"
      : rule.kind === "implementation"
        ? "production-source"
        : "repository";
  return { capability, action, path: outputPath };
}

function hasApproval(approvals, request) {
  return approvals.some(
    (approval) =>
      approval.capability === request.capability &&
      approval.action === request.action &&
      approval.path === request.path,
  );
}

function skillLayer(contract) {
  return {
    schema: "silver/permission-policy/v2",
    id: `${contract.id}-skill-request`,
    layer: "skill-request",
    rules: contract.permissions.map((permission) => ({
      capability: permission.capability,
      actions: permission.actions,
      decision: permission.decision ?? "ask",
      ...(permission.paths ? { paths: permission.paths } : {}),
    })),
  };
}

function renderOutput(output) {
  if (output.content.format === "text") {
    return output.content.value.endsWith("\n")
      ? output.content.value
      : `${output.content.value}\n`;
  }
  return `${JSON.stringify(output.content.value, null, 2)}\n`;
}

async function atomicWrite(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.silver-${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, filePath);
}

async function recordResult(workspaceRoot, result) {
  await assertV2("skill-result.schema.json", result);
  const resultPath = inside(
    workspaceRoot,
    `.silver/results/skills/${result.invocation_id}.json`,
  );
  await atomicWrite(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

function blockedResult({
  request,
  contract,
  completedAt,
  summary,
  providers,
  degradedCapabilities,
  guardrails,
  outputs = [],
}) {
  return {
    schema: "silver/skill-result/v2",
    invocation_id: request.invocation_id,
    skill: { id: contract.id, version: contract.version },
    started_at: request.started_at,
    completed_at: completedAt,
    inputs: request.inputs,
    outputs,
    providers: providers.map((provider) => ({
      capability: provider.capability,
      ...(provider.provider ? { provider: provider.provider } : { provider: "unavailable" }),
      status:
        provider.status === "selected"
          ? "used"
          : provider.status === "local-fallback"
            ? "fallback"
            : "unavailable",
    })),
    representation_coverage: representationCoverage(providers),
    freshness_blockers: freshnessBlockers(request),
    degraded_capabilities: degradedCapabilities.map((item) => ({
      capability: item.capability,
      reason: item.reason,
      coverage: item.coverage,
    })),
    execution: { status: "blocked", summary },
    acceptance: { status: "not-required" },
    readiness: [
      {
        name: "downstream",
        status: "blocked",
        reasons: [summary],
      },
    ],
    checks: request.checks,
    guardrails,
    unresolved_questions: request.unresolved_questions,
    recommended_next_actions: [],
  };
}

function representationCoverage(providers) {
  const used = providers.filter(({ status }) =>
    ["selected", "local-fallback"].includes(status),
  );
  const portable = used.find(({ provider }) => provider === "silver-portable");
  const external = used.find(({ provider }) => provider !== "silver-portable");
  const localView = used.find(({ capability }) =>
    ["sketch-renderer", "prototype-renderer", "presentation-renderer"].includes(
      capability,
    ),
  );
  return [
    {
      role: "portable-artifact",
      status: portable ? "complete" : "unavailable",
      ...(portable
        ? { provider: portable.provider }
        : { reason: "No registered portable provider was selected." }),
    },
    {
      role: "local-view",
      status: localView ? "complete" : "unavailable",
      ...(localView
        ? { provider: localView.provider }
        : { reason: "This invocation did not declare a local visual renderer." }),
    },
    {
      role: "external-view",
      status: external ? "complete" : "unavailable",
      ...(external
        ? { provider: external.provider }
        : { reason: "No external projection provider was used." }),
    },
  ];
}

function freshnessBlockers(request) {
  return (request.binding_states ?? [])
    .filter(
      ({ authority, state, freshness_sensitive_readiness: readiness }) =>
        authority === "external" && state !== "current" && readiness.length > 0,
    )
    .map(({ binding_id: bindingId, state, freshness_sensitive_readiness: blocks }) => ({
      binding_id: bindingId,
      state,
      blocks,
    }));
}

export async function invokeSkill({
  root,
  skillDirectory,
  request,
  completedAt = new Date().toISOString(),
  registryPath,
}) {
  const workspaceRoot = path.resolve(root);
  const skillRoot =
    skillDirectory instanceof URL
      ? fileURLToPath(skillDirectory)
      : path.resolve(skillDirectory);
  const contract = parse(
    await readFile(path.join(skillRoot, "skill.yaml"), "utf8"),
  );
  await assertV2("skill.schema.json", contract);
  await assertV2("skill-invocation.schema.json", request);
  if (
    request.skill.id !== contract.id ||
    request.skill.version !== contract.version
  ) {
    throw new Error("Invocation does not match the skill contract version.");
  }

  const registry = parse(
    await readFile(
      registryPath ??
        ((await exists(path.join(workspaceRoot, ".silver/guardrails/registry.yaml")))
          ? path.join(workspaceRoot, ".silver/guardrails/registry.yaml")
          : sourceRegistryPath),
      "utf8",
    ),
  );
  await assertV2("guardrail-registry.schema.json", registry);
  let guardrails;
  try {
    guardrails = resolveGuardrails({
      registry,
      required: contract.guardrails,
      relaxations: request.relaxations,
    });
  } catch (error) {
    guardrails = contract.guardrails.map((id) => ({
      id,
      status: id === request.relaxations[0]?.id ? "fail" : "not-run",
      ...(id === request.relaxations[0]?.id
        ? { reason: error.message }
        : {}),
    }));
    const result = blockedResult({
      request,
      contract,
      completedAt,
      summary: error.message,
      providers: [],
      degradedCapabilities: [],
      guardrails,
    });
    return recordResult(workspaceRoot, result);
  }

  const registeredProviders = await discoverProviders({ root: workspaceRoot });
  const capabilityResolution = resolveCapabilities({
    contract,
    registeredProviders,
    availableProviders: request.available_providers,
  });
  if (
    capabilityResolution.degradedCapabilities.some(
      ({ coverage }) => coverage === "not-run",
    )
  ) {
    const result = {
      ...blockedResult({
        request,
        contract,
        completedAt,
        summary: "A required capability is unavailable; the skill was not run.",
        providers: capabilityResolution.providers,
        degradedCapabilities: capabilityResolution.degradedCapabilities,
        guardrails,
      }),
      outputs: [],
      execution: {
        status: "not-run",
        summary: "A required capability is unavailable; the skill was not run.",
      },
      readiness: [
        {
          name: "downstream",
          status: "not-ready",
          reasons: ["Required capability coverage is not-run."],
        },
      ],
    };
    return recordResult(workspaceRoot, result);
  }

  const prepared = [];
  try {
    for (const input of contract.inputs.filter(({ required }) => required)) {
      if (!request.inputs.some(({ kind }) => kind === input.kind)) {
        throw new Error(`Missing required ${input.kind} input.`);
      }
    }
    if (contract.outputs.length > 0 && request.outputs.length === 0) {
      throw new Error(`Skill ${contract.id} requires at least one declared output.`);
    }
    for (const output of request.outputs) {
      const rule = outputRule(contract, output.reference);
      if (!rule) {
        throw new Error(
          `Skill ${contract.id} cannot produce ${output.reference.kind} at ${output.reference.path}.`,
        );
      }
      const absolute = inside(workspaceRoot, output.reference.path);
      const present = await exists(absolute);
      const action = present ? "update" : "create";
      const permissionRequestValue = permissionRequest(
        { ...rule, kind: output.reference.kind },
        action,
        output.reference.path,
      );
      const resolution = resolvePermissions({
        layers: [...request.permission_layers, skillLayer(contract)],
        requests: [permissionRequestValue],
      }).decisions[0];
      if (resolution.decision === "deny") {
        throw new Error(
          `Permission denied for ${permissionRequestValue.capability}:${action}:${output.reference.path}.`,
        );
      }
      if (
        resolution.decision === "ask" &&
        !hasApproval(request.approvals, permissionRequestValue)
      ) {
        throw new Error(
          `Approval required for ${permissionRequestValue.capability}:${action}:${output.reference.path}.`,
        );
      }
      if (present) {
        const observed = integrity(await readFile(absolute));
        if (!output.expected_integrity) {
          throw new Error(
            `Refusing to overwrite ${output.reference.path} without expected_integrity.`,
          );
        }
        if (output.expected_integrity !== observed) {
          throw new Error(
            `Stale expected_integrity for ${output.reference.path}.`,
          );
        }
      }
      if (output.schema_name) {
        await assertV2(output.schema_name, output.content.value);
      }
      if (
        output.content.format === "json" &&
        output.content.value.id &&
        (output.content.value.id !== output.reference.id ||
          output.content.value.kind !== output.reference.kind ||
          output.content.value.revision !== output.reference.revision)
      ) {
        throw new Error(
          `Output content identity does not match ${output.reference.id}@${output.reference.revision}.`,
        );
      }
      prepared.push({
        absolute,
        content: renderOutput(output),
        reference: output.reference,
      });
    }
  } catch (error) {
    const result = blockedResult({
      request,
      contract,
      completedAt,
      summary: error.message,
      providers: capabilityResolution.providers,
      degradedCapabilities: capabilityResolution.degradedCapabilities,
      guardrails,
    });
    return recordResult(workspaceRoot, result);
  }

  for (const output of prepared) {
    await atomicWrite(output.absolute, output.content);
  }
  const requiredCheckIds = contract.checks
    .filter(({ required }) => required)
    .map(({ id }) => id);
  const checkById = new Map(request.checks.map((check) => [check.id, check]));
  const checkBlocked = requiredCheckIds.some(
    (id) => !checkById.has(id) || checkById.get(id).status !== "pass",
  );
  const questionBlocked =
    contract.completion.unresolved_questions.startsWith("block") &&
    request.unresolved_questions.length > 0;
  const bindingBlockers = freshnessBlockers(request);
  const acceptance =
    contract.completion.review.required
      ? request.acceptance ?? { status: "awaiting-review" }
      : { status: "not-required" };
  const accepted = ["accepted", "not-required"].includes(acceptance.status);
  const ready =
    !checkBlocked && !questionBlocked && bindingBlockers.length === 0 && accepted;
  const result = {
    schema: "silver/skill-result/v2",
    invocation_id: request.invocation_id,
    skill: { id: contract.id, version: contract.version },
    started_at: request.started_at,
    completed_at: completedAt,
    inputs: request.inputs,
    outputs: prepared.map(({ reference }) => reference),
    providers: capabilityResolution.providers.map((provider) => ({
      capability: provider.capability,
      provider: provider.provider ?? "unavailable",
      status:
        provider.status === "selected"
          ? "used"
          : provider.status === "local-fallback"
            ? "fallback"
            : "unavailable",
    })),
    representation_coverage: representationCoverage(
      capabilityResolution.providers,
    ),
    freshness_blockers: bindingBlockers,
    degraded_capabilities: capabilityResolution.degradedCapabilities.map(
      (item) => ({
        capability: item.capability,
        reason: item.reason,
        coverage: item.coverage,
      }),
    ),
    execution: {
      status:
        checkBlocked || questionBlocked
          ? "complete-with-findings"
          : "complete",
      summary: `Completed ${contract.id} with ${prepared.length} durable output(s).`,
    },
    acceptance,
    readiness:
      contract.handoffs.length === 0
        ? [
            {
              name: "downstream",
              status: "not-applicable",
              reasons: [],
            },
          ]
        : contract.handoffs.map((handoff) => ({
            name: handoff.readiness,
            status: ready ? "ready" : "not-ready",
            reasons: [
              ...(!accepted ? ["Human acceptance is unresolved."] : []),
              ...(checkBlocked ? ["One or more required checks did not pass."] : []),
              ...(questionBlocked ? ["Unresolved questions block this handoff."] : []),
              ...(bindingBlockers.length
                ? ["Externally authoritative input freshness is unresolved."]
                : []),
            ],
          })),
    checks: request.checks,
    guardrails,
    unresolved_questions: request.unresolved_questions,
    recommended_next_actions: contract.recommend_after.map((action) => ({
      action,
      reason: `Consider ${action} when its declared inputs and permissions are ready.`,
      automatic: false,
    })),
  };
  return recordResult(workspaceRoot, result);
}

export async function runSkillCli({ skillDirectory, args }) {
  try {
    const requestPath = args.find((value) => !value.startsWith("--"));
    const rootIndex = args.indexOf("--root");
    const root =
      rootIndex >= 0 ? path.resolve(args[rootIndex + 1]) : process.cwd();
    if (!requestPath) {
      throw new Error("Usage: invoke.mjs <request.json> [--root <workspace>]");
    }
    const request = JSON.parse(
      await readFile(path.resolve(requestPath), "utf8"),
    );
    const result = await invokeSkill({
      root,
      skillDirectory,
      request,
    });
    console.log(JSON.stringify(result, null, 2));
    return ["complete", "complete-with-findings"].includes(
      result.execution.status,
    )
      ? 0
      : 1;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return 2;
  }
}
