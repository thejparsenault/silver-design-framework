import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { loadActivityCatalog } from "./activities.mjs";
import { assertV2 } from "./contracts.mjs";
import { createWorkspaceMutator } from "./workspace-mutations.mjs";
import { payloadPath } from "../../installer/payload.mjs";
import {
  checkpointAcceptedOutputs,
  checkpointPreflight,
} from "./checkpoints.mjs";
import { resolveGuardrails } from "./guardrails.mjs";
import { syncManifestStatus } from "./manifest-sync.mjs";
import { discoverProviders } from "./providers.mjs";
import { resolveReferenceCitations } from "./references.mjs";
import {
  matchesPathPattern,
  resolveCapabilities,
} from "./permissions.mjs";

const sourceRegistryPath = payloadPath("framework/guardrails/registry.yaml", import.meta.url);

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

// A missing or unreadable catalog must not stop a workspace working. Without one
// the resolver falls back to per-capability selection, which is what pre-0.8
// workspaces did — degraded naming, not degraded correctness.
async function loadActivityCatalogSafely(root) {
  try {
    return await loadActivityCatalog({ root });
  } catch {
    return null;
  }
}

// Ordering sources, most local first. Personal preferences (`My Practice`) are
// carried in by the installer rather than read here, because the runtime must
// not reach outside the workspace on its own.
async function loadTransportPreferences(root) {
  const sources = [];
  const manifestPath = path.join(root, "design", "manifest.yaml");
  if (await exists(manifestPath)) {
    try {
      const manifest = parse(await readFile(manifestPath, "utf8"));
      if (manifest?.tool_preferences) {
        sources.push({ source: "project", preferences: manifest.tool_preferences });
      }
    } catch {
      // A malformed manifest is reported by `doctor`; it does not get to decide
      // transports by accident.
    }
  }
  return sources;
}

function transportQuestionSummary(pending) {
  const first = pending[0];
  if (first.decision === "stop" && first.would_select) {
    return `${first.title}: ${first.chain[0]} is unavailable and nothing may be substituted without you.`;
  }
  return `${first.title}: ${first.chain[0]} is unavailable. Choose a transport before this runs.`;
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

const contextPinnedOutputKinds = new Set([
  "map",
  "sketch",
  "visualization",
  "prototype",
  "presentation-view",
  "implementation-handoff",
  "implementation",
]);

function effectForOutput(rule, action, outputPath) {
  const capability =
    rule.authority === "canonical-with-approval"
      ? "canonical-artifact"
      : rule.kind === "implementation"
        ? "production-source"
        : "repository";
  return { capability, action, path: outputPath };
}

// Two contract blocks can legitimately describe the same capability, action, and
// path scope, and several outputs under one path scope produce the same observed
// effect. Persisting those duplicates makes an audit harder to read without
// making it more accurate.
function deduplicateEffects(effects) {
  const seen = new Map();
  for (const effect of effects) {
    const key = JSON.stringify([
      effect.capability,
      effect.action,
      effect.path ?? null,
      effect.paths ?? null,
      effect.reference ?? null,
    ]);
    if (!seen.has(key)) seen.set(key, effect);
  }
  return [...seen.values()];
}

// Every invocation persists its own normalized result. That is a real write, and
// leaving it out of the audit is what let a skill describe itself as read-only
// while dirtying the working tree. It belongs to the runtime rather than to any
// one skill, so it is declared here instead of in every skill's own contract.
const RESULT_RECORD_PATHS = ".silver/results/skills/**";

// Activating a canonical artifact also updates the manifest that indexes it and
// the files generated from that manifest. Those are runtime effects for the same
// reason the result record is: they belong to the framework's bookkeeping rather
// than to any one skill's contract.
const RUNTIME_EFFECTS = [
  {
    capability: "repository",
    action: "write",
    paths: [RESULT_RECORD_PATHS],
  },
  ...["create", "write", "update"].map((action) => ({
    capability: "repository",
    action,
    paths: [
      ".silver/results/**",
      "design/manifest.yaml",
      "design/INDEX.md",
      ".silver/lock.yaml",
    ],
  })),
];

function resultRecordEffect(invocationId) {
  return {
    capability: "repository",
    action: "write",
    path: `.silver/results/skills/${invocationId}.json`,
  };
}

function declaredEffects(contract) {
  return deduplicateEffects([
    ...(contract.effects ?? contract.permissions ?? []).flatMap((effect) =>
      effect.actions.map((action) => ({
        capability: effect.capability,
        action,
        ...(effect.paths ? { paths: effect.paths } : {}),
      })),
    ),
    ...RUNTIME_EFFECTS,
  ]);
}

function effectIsDeclared(declared, observed) {
  return declared.some(
    (effect) =>
      effect.capability === observed.capability &&
      effect.action === observed.action &&
      (!observed.path ||
        !effect.paths ||
        effect.paths.length === 0 ||
        effect.paths.some((pattern) =>
          matchesPathPattern(pattern, observed.path),
        )),
  );
}

function effectAudit(contract, observed) {
  const declared = declaredEffects(contract);
  const uniqueObserved = deduplicateEffects(observed);
  return {
    declared: deduplicateEffects(
      declared.map(({ paths, ...effect }) => ({
        ...effect,
        ...(paths?.length === 1 ? { path: paths[0] } : {}),
      })),
    ),
    observed: uniqueObserved,
    findings: uniqueObserved
      .filter((effect) => !effectIsDeclared(declared, effect))
      .map(
        (effect) =>
          `Observed undeclared effect ${effect.capability}:${effect.action}${effect.path ? `:${effect.path}` : ""}.`,
      ),
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

async function atomicWrite(root, filePath, content) {
  const mutator = await createWorkspaceMutator(root);
  const relative = mutator.relative(filePath);
  await mutator.write(relative, content);
}

// Write a request that can be submitted as-is to retry an invocation that failed
// after its outputs landed.
//
// Without this, recovery meant recomputing an `expected_integrity` hash for every
// file the failed attempt created, because the guard against blind overwrites
// cannot tell a half-applied invocation from a stale one. The retry is now a
// single command, and the hashes describe what is actually on disk.
async function writeResumeRequest({ root, request, prepared, reason }) {
  const written = new Map(
    prepared.map(({ reference, content }) => [
      reference.path,
      integrity(content),
    ]),
  );
  const resume = {
    ...request,
    outputs: request.outputs.map((output) =>
      written.has(output.reference.path)
        ? {
            ...output,
            expected_integrity: written.get(output.reference.path),
          }
        : output,
    ),
  };
  const resumePath = inside(
    root,
    `.silver/results/resume/${request.invocation_id}.json`,
  );
  await atomicWrite(root, resumePath, `${JSON.stringify(resume, null, 2)}\n`);
  return {
    path: `.silver/results/resume/${request.invocation_id}.json`,
    reason,
  };
}

// Reconcile what a request claims about its checks against what is on disk.
//
// A caller could previously assert `pass` for a check whose `result_path` did
// not exist — the reported prototype recorded six such claims while
// `.silver/results/checks/` was absent, including a browser interaction check
// that provably never ran. A status is only believed when its evidence resolves
// and agrees; otherwise it degrades to `not-run` with the reason recorded.
async function verifyChecks({ root, declared = [], ran }) {
  const byId = new Map();
  for (const check of declared) byId.set(check.id, check);
  // Statuses this invocation produced itself outrank anything the caller claimed.
  for (const check of ran ?? []) byId.set(check.id, check);

  const verified = [];
  for (const check of byId.values()) {
    if (check.status !== "pass") {
      verified.push(check);
      continue;
    }
    const evidencePath = check.result_path
      ? inside(root, check.result_path)
      : null;
    if (!evidencePath || !(await exists(evidencePath))) {
      verified.push({
        ...check,
        status: "not-run",
        reason: `Reported pass without evidence at ${check.result_path ?? "an unspecified path"}.`,
      });
      continue;
    }
    let evidence;
    try {
      evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    } catch (error) {
      verified.push({
        ...check,
        status: "not-run",
        reason: `Check evidence at ${check.result_path} could not be read: ${error.message}`,
      });
      continue;
    }
    if (evidence.status !== "pass") {
      verified.push({
        ...check,
        status: ["fail", "error"].includes(evidence.status) ? evidence.status : "not-run",
        reason: `Check evidence at ${check.result_path} records ${evidence.status}, not pass.`,
      });
      continue;
    }
    verified.push(check);
  }
  return verified;
}

async function recordResult(workspaceRoot, result) {
  await assertV2("skill-result.schema.json", result);
  const resultPath = inside(
    workspaceRoot,
    `.silver/results/skills/${result.invocation_id}.json`,
  );
  await atomicWrite(workspaceRoot, resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

async function blockedResult({
  root,
  request,
  contract,
  completedAt,
  summary,
  providers,
  degradedCapabilities,
  guardrails,
  outputs = [],
}) {
  const checks = await verifyChecks({ root, declared: request.checks });
  const observed = [
    ...(request.observed_effects ?? []),
    resultRecordEffect(request.invocation_id),
  ];
  const audit = effectAudit(contract, observed);
  const provenance = request.provenance ?? {
    schema: "silver/provenance/v1",
    origin: "generated",
    recorded_at: completedAt,
    sources: request.inputs,
    guidance: [],
    design_contexts: [],
    references: await resolveReferenceCitations(root, request.references ?? []),
    change: { reason: `Recorded blocked ${contract.id} invocation: ${summary}` },
    acceptance: "not-required",
    external_bindings: [],
  };
  return {
    schema: "silver/skill-result/v2",
    invocation_id: request.invocation_id,
    skill: { id: contract.id, version: contract.version },
    provenance,
    declared_effects: audit.declared,
    observed_effects: observed,
    effect_findings: audit.findings,
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
    // Blocked or not, an unbacked `pass` is still a claim about work that did
    // not demonstrably happen, so it is degraded here too rather than echoed
    // back into the persisted record.
    checks,
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
    ["visual-renderer", "prototype-renderer", "presentation-renderer"].includes(
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

function recommendedNextActions(contract, request) {
  if (!request.recommended_next_actions) {
    return contract.recommend_after.map((action) => ({
      action,
      reason: `Consider ${action} when its declared inputs and operating conditions are ready.`,
      automatic: false,
    }));
  }
  const allowed = new Set(contract.recommend_after);
  for (const recommendation of request.recommended_next_actions) {
    if (!allowed.has(recommendation.action)) {
      throw new Error(
        `Skill ${contract.id} cannot recommend undeclared action ${recommendation.action}.`,
      );
    }
  }
  return request.recommended_next_actions;
}

export async function invokeSkill({
  root,
  skillDirectory,
  request,
  completedAt = new Date().toISOString(),
  registryPath,
  // Runs this skill's required checks and persists their evidence. Supplied by
  // the CLI, which can reach the design-check scripts; the runtime deliberately
  // does not depend on them, so a caller without it still gets verification of
  // whatever evidence already exists.
  runChecks,
}) {
  const workspaceRoot = (await createWorkspaceMutator(root)).root;
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
    const result = await blockedResult({
      root: workspaceRoot,
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
    catalog: await loadActivityCatalogSafely(workspaceRoot),
    sources: await loadTransportPreferences(workspaceRoot),
    interactive: request.interactive ?? false,
  });
  if (
    capabilityResolution.degradedCapabilities.some(
      ({ coverage }) => coverage === "not-run",
    )
  ) {
    // A transport question is not the same failure as a missing tool. One is
    // waiting for the designer; the other is an absence. Reporting them
    // identically is how a choice gets made on someone's behalf.
    const pending = capabilityResolution.questions;
    const summary =
      pending.length > 0
        ? transportQuestionSummary(pending)
        : "A required capability is unavailable; the skill was not run.";
    const result = {
      ...(await blockedResult({
        root: workspaceRoot,
        request,
        contract,
        completedAt,
        summary,
        providers: capabilityResolution.providers,
        degradedCapabilities: capabilityResolution.degradedCapabilities,
        guardrails,
      })),
      outputs: [],
      execution: { status: "not-run", summary },
      ...(capabilityResolution.activities.length > 0
        ? { transports: capabilityResolution.activities }
        : {}),
      readiness: [
        {
          name: "downstream",
          status: "not-ready",
          reasons: [
            pending.length > 0
              ? "A transport choice is unresolved."
              : "Required capability coverage is not-run.",
          ],
        },
      ],
    };
    return recordResult(workspaceRoot, result);
  }

  const prepared = [];
  let recommendations;
  try {
    recommendations = recommendedNextActions(contract, request);
    for (const input of contract.inputs.filter(({ required }) => required)) {
      if (!request.inputs.some(({ kind }) => kind === input.kind)) {
        throw new Error(`Missing required ${input.kind} input.`);
      }
    }
    if (request.outputs.length > 0 && !request.provenance) {
      throw new Error(
        `Skill ${contract.id} cannot create durable output without a provenance envelope.`,
      );
    }
    if (
      request.outputs.length > 0 &&
      (contract.id === "design-check" ||
        request.outputs.some(({ reference }) =>
          contextPinnedOutputKinds.has(reference.kind),
        )) &&
      (request.provenance?.design_contexts?.length ?? 0) === 0
    ) {
      throw new Error(
        `Skill ${contract.id} cannot create visual or QA output without an exact design-context revision.`,
      );
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
      const effect = effectForOutput(
        { ...rule, kind: output.reference.kind },
        action,
        output.reference.path,
      );
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
        effect,
      });
    }
  } catch (error) {
    const result = await blockedResult({
      root: workspaceRoot,
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

  // Acceptance checkpoints the outputs into Git. Confirm Git can actually take
  // the commit *before* touching canonical files, so a checkpoint failure can no
  // longer leave written-but-uncommitted output that the next identical request
  // refuses to overwrite.
  const wantsCheckpoint =
    (request.acceptance?.status ?? null) === "accepted" && prepared.length > 0;
  if (wantsCheckpoint) {
    const preflight = await checkpointPreflight({
      root: workspaceRoot,
      // Activation can also touch these, so they are part of the same commit and
      // therefore part of what has to be clean beforehand.
      outputs: [
        ...prepared.map(({ reference }) => reference),
        ...["design/manifest.yaml", "design/INDEX.md", ".silver/lock.yaml"].map(
          (syncPath) => ({ path: syncPath }),
        ),
      ],
    });
    if (preflight.status === "blocked") {
      const result = await blockedResult({
        root: workspaceRoot,
        request,
        contract,
        completedAt,
        summary: `${preflight.message} No files were written; nothing needs to be undone.`,
        providers: capabilityResolution.providers,
        degradedCapabilities: capabilityResolution.degradedCapabilities,
        guardrails,
      });
      return recordResult(workspaceRoot, result);
    }
  }

  for (const output of prepared) {
    await atomicWrite(workspaceRoot, output.absolute, output.content);
  }

  // An artifact that now declares itself active makes the manifest that still
  // calls it draft wrong. Reconcile both, plus everything generated from them,
  // as part of this invocation rather than leaving a hand-edit and a repair run
  // as the user's problem.
  //
  // This runs before the checks, not after: contract-integrity compares
  // frontmatter against the manifest, so checking first would fail on a
  // disagreement this invocation is about to resolve.
  const manifestSync = await syncManifestStatus({
    root: workspaceRoot,
    only: prepared.map(({ reference }) => reference.path),
    write: (absolute, content) => atomicWrite(workspaceRoot, absolute, content),
  });

  // Past this point the workspace has changed. Any failure must leave a way back
  // in rather than an integrity mismatch the caller has to rebuild by hand.
  let checkRun = null;
  try {
    if (runChecks && contract.checks.length > 0) {
      checkRun = await runChecks({
        root: workspaceRoot,
        contract,
        invocationId: request.invocation_id,
      });
    }
  } catch (error) {
    await writeResumeRequest({
      root: workspaceRoot,
      request,
      prepared,
      reason: `Checks could not run: ${error.message}`,
    });
    checkRun = null;
  }

  const observedEffects = deduplicateEffects([
    ...(request.observed_effects ?? []),
    ...prepared.map(({ effect }) => effect),
    ...manifestSync.paths.map((syncPath) => ({
      capability: "repository",
      action: "update",
      path: syncPath,
    })),
    resultRecordEffect(request.invocation_id),
  ]);
  const audit = effectAudit(contract, observedEffects);
  const requiredCheckIds = contract.checks
    .filter(({ required }) => required)
    .map(({ id }) => id);
  // A check status is a claim about work that happened. Verify the evidence
  // exists and agrees before believing it, so a result can never report a
  // passing check whose result file was never written.
  const checks = await verifyChecks({
    root: workspaceRoot,
    declared: request.checks,
    ran: checkRun?.checks,
  });
  const checkById = new Map(checks.map((check) => [check.id, check]));
  const checkBlocked = requiredCheckIds.some(
    (id) => !checkById.has(id) || checkById.get(id).status !== "pass",
  );
  // A check that could not start, a checker mechanism that errored, and a
  // completed check with findings are three different outcomes. Only the last
  // says the work itself is wrong.
  const checkFailed = requiredCheckIds.some(
    (id) => checkById.get(id)?.status === "fail",
  );
  const checkErrored = requiredCheckIds.some(
    (id) => checkById.get(id)?.status === "error",
  );
  const checkUnverified = requiredCheckIds.some(
    (id) => !checkById.has(id) || checkById.get(id).status === "not-run",
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
  const gitCheckpoint =
    acceptance.status === "accepted" && prepared.length > 0
      ? await checkpointAcceptedOutputs({
          root: workspaceRoot,
          invocationId: request.invocation_id,
          // The manifest, index, and lock changed because these outputs did, so
          // they belong in the same commit. Splitting them is what left the
          // workspace inconsistent between an accepted skill and its repair.
          outputs: [
            ...prepared.map(({ reference }) => reference),
            ...manifestSync.paths.map((syncPath) => ({
              id: syncPath,
              kind: "generated",
              revision: "r1",
              path: syncPath,
            })),
          ],
          now: completedAt,
        })
      : null;
  const checkpointFindings =
    gitCheckpoint?.status === "blocked"
      ? [gitCheckpoint.message]
      : [];
  // Preflight makes this rare, but a checkpoint can still fail on a race. The
  // outputs are already written, so leave a resumable request rather than a
  // state the caller has to reconstruct.
  const resume =
    gitCheckpoint?.status === "blocked"
      ? await writeResumeRequest({
          root: workspaceRoot,
          request,
          prepared,
          reason: gitCheckpoint.message,
        })
      : null;

  // What else this skill can still produce. Contract outputs describe what a
  // skill *may* write, not what it must, so this never blocks readiness — it
  // gives the agent something concrete to offer next instead of guessing.
  const producedKinds = new Set(prepared.map(({ reference }) => reference.kind));
  const pendingOutputs = contract.outputs
    .filter(({ kind }) => !producedKinds.has(kind))
    .map(({ kind, path_pattern: pathPattern }) => ({
      kind,
      path_pattern: pathPattern,
    }));

  const effectFindings = [...audit.findings, ...checkpointFindings];
  const ready =
    !checkBlocked &&
    !questionBlocked &&
    bindingBlockers.length === 0 &&
    checkpointFindings.length === 0 &&
    accepted;
  const result = {
    schema: "silver/skill-result/v2",
    invocation_id: request.invocation_id,
    skill: { id: contract.id, version: contract.version },
    provenance:
      request.provenance ?? {
        schema: "silver/provenance/v1",
        origin: "generated",
        recorded_at: completedAt,
        sources: request.inputs,
        guidance: [],
        design_contexts: [],
        references: await resolveReferenceCitations(workspaceRoot, request.references ?? []),
        change: {
          reason: `Recorded read-only ${contract.id} invocation.`,
        },
        acceptance: "not-required",
        external_bindings: [],
      },
    declared_effects: audit.declared,
    observed_effects: observedEffects,
    effect_findings: effectFindings,
    ...(gitCheckpoint ? { git_checkpoint: gitCheckpoint } : {}),
    started_at: request.started_at,
    completed_at: completedAt,
    inputs: request.inputs,
    outputs: prepared.map(({ reference }) => reference),
    providers: capabilityResolution.providers.map((provider) => ({
      capability: provider.capability,
      ...(provider.activity ? { activity: provider.activity } : {}),
      provider: provider.provider ?? "unavailable",
      status:
        provider.status === "selected"
          ? "used"
          : provider.status === "local-fallback"
            ? "fallback"
            : "unavailable",
    })),
    // What was chosen for each named activity, and what was removed from the
    // running before it. A fallback that does not say what it replaced, or a
    // veto that does not say who set it, is a silently narrowed option.
    ...(capabilityResolution.activities.length > 0
      ? { transports: capabilityResolution.activities }
      : {}),
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
    ...(pendingOutputs.length > 0 ? { pending_outputs: pendingOutputs } : {}),
    ...(resume ? { resume_request: resume } : {}),
    execution: {
      // "Files were generated" and "the work was verified" are different claims.
      // A required check that could not run leaves the second one open, and
      // saying so is the difference between an honest result and a reassuring
      // one.
      status:
        (checkUnverified || checkErrored) && !checkFailed && effectFindings.length === 0
          ? "complete-awaiting-verification"
          : checkBlocked || questionBlocked || effectFindings.length > 0
            ? "complete-with-findings"
            : "complete",
      summary: [
        `Completed ${contract.id} with ${prepared.length} durable output(s)`,
        checkErrored
          ? "; one or more required checker mechanisms errored"
          : checkUnverified
          ? "; one or more required checks could not be verified"
          : "",
        ".",
      ].join(""),
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
              ...(checkFailed ? ["One or more required checks failed."] : []),
              ...(checkErrored
                ? ["One or more required checker mechanisms errored before completing verification."]
                : []),
              ...(checkUnverified
                ? [
                    "One or more required checks could not be run or verified, so this work is unverified rather than wrong.",
                  ]
                : []),
              ...(questionBlocked ? ["Unresolved questions block this handoff."] : []),
              ...(bindingBlockers.length
                ? ["Externally authoritative input freshness is unresolved."]
                : []),
              ...(checkpointFindings.length
                ? ["The accepted local Git checkpoint is blocked."]
                : []),
            ],
          })),
    checks,
    guardrails,
    unresolved_questions: request.unresolved_questions,
    recommended_next_actions: recommendations,
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
    // A direct skill shim must use the same integrated path as `silver invoke`.
    // Calling the low-level runtime alone skips the check runner and previously
    // left every required check absent even though the shim exited as if the
    // skill had executed normally.
    let integrated;
    try {
      ({ invokeInstalledSkill: integrated } = await import("../../installer/invoke.mjs"));
    } catch {
      // A copied runtime with no package installation can still execute skills
      // that declare no checks; checked skills remain explicitly unverified.
    }
    const result = integrated
      ? await integrated({
          root,
          skillId: path.basename(fileURLToPath(skillDirectory)),
          request,
        })
      : await invokeSkill({ root, skillDirectory, request });
    console.log(JSON.stringify(result, null, 2));
    return ["complete", "complete-awaiting-verification", "complete-with-findings"].includes(
      result.execution.status,
    )
      ? 0
      : 1;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return 2;
  }
}
