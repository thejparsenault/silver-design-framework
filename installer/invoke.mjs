import path from "node:path";

import { parse } from "yaml";

import { invokeSkill } from "../framework/runtime/invoke-skill.mjs";
import { loadDesignContexts } from "./context.mjs";
import { exists, integrity, readUtf8 } from "./lib/files.mjs";
import { checkResultPath, runContractChecks } from "./checks.mjs";
import { assertManagedSkillIntegrity } from "../framework/runtime/managed-integrity.mjs";

// Emitted by `silver invoke --scaffold` wherever the agent must supply
// judgement. `silver invoke` refuses any request that still contains it, so a
// scaffold can never be submitted unmodified.
export const SCAFFOLD_PLACEHOLDER = "silver-scaffold-placeholder";

// Kinds the runtime requires an exact design-context revision for. Kept in sync
// with contextPinnedOutputKinds in framework/runtime/invoke-skill.mjs.
const contextPinnedOutputKinds = new Set([
  "map",
  "sketch",
  "visualization",
  "prototype",
  "presentation-view",
  "implementation-handoff",
  "implementation",
]);

function compactTimestamp(date) {
  return date.toISOString().replace(/[-:.]/g, "").toLowerCase();
}

export async function loadInstalledContract(root, skillId) {
  const lock = parse(await readUtf8(path.join(root, ".silver/lock.yaml")));
  await assertManagedSkillIntegrity(root, skillId, lock);
  const skillDirectory = path.join(path.resolve(root), ".skills", skillId);
  const contractPath = path.join(skillDirectory, "skill.yaml");
  if (!(await exists(contractPath))) {
    throw new Error(
      `No installed skill named ${skillId}. Run \`silver doctor\` to list this workspace's skills.`,
    );
  }
  return { skillDirectory, contract: parse(await readUtf8(contractPath)) };
}

export async function invokeInstalledSkill({
  root,
  skillId,
  request,
  completedAt,
}) {
  const workspaceRoot = path.resolve(root);
  const { skillDirectory } = await loadInstalledContract(workspaceRoot, skillId);
  if (JSON.stringify(request).includes(SCAFFOLD_PLACEHOLDER)) {
    throw new Error(
      `This request still contains ${SCAFFOLD_PLACEHOLDER}. Replace every scaffold placeholder with real content before invoking ${skillId}.`,
    );
  }
  return invokeSkill({
    root: workspaceRoot,
    skillDirectory,
    request,
    ...(completedAt ? { completedAt } : {}),
    // The invocation runs its own required checks and writes their evidence, so
    // a result reflects checks that actually happened rather than statuses the
    // caller typed in.
    runChecks: ({ root: checkRoot, contract }) =>
      runContractChecks({ root: checkRoot, contract }),
  });
}

// Turn a contract path_pattern into a concrete path. Globs become a placeholder
// file the agent renames; concrete patterns are used as declared.
function scaffoldPath(pattern) {
  if (!pattern.includes("*")) return pattern;
  const directory = pattern.slice(0, pattern.indexOf("*")).replace(/\/+$/, "");
  return `${directory}/${SCAFFOLD_PLACEHOLDER}.md`;
}

function scaffoldFormat(outputPath) {
  return /\.(json|yaml|yml)$/.test(outputPath) ? "json" : "text";
}

async function defaultDesignContextReference(root) {
  const active = (await loadDesignContexts(root)).filter(
    ({ status }) => status === "active",
  );
  const selected =
    active.find(({ default: isDefault }) => isDefault) ??
    (active.length === 1 ? active[0] : null);
  if (!selected) return null;
  return {
    id: selected.id,
    kind: "design-context",
    revision: selected.revision,
    path: selected.path,
  };
}

export async function scaffoldInvocation({ root, skillId, now = new Date() }) {
  const workspaceRoot = path.resolve(root);
  const { contract } = await loadInstalledContract(workspaceRoot, skillId);
  const recordedAt = (now instanceof Date ? now : new Date(now)).toISOString();

  const outputs = [];
  for (const output of contract.outputs) {
    const relativePath = scaffoldPath(output.path_pattern);
    const format = scaffoldFormat(relativePath);
    const absolute = path.join(workspaceRoot, relativePath);
    outputs.push({
      reference: {
        id: SCAFFOLD_PLACEHOLDER,
        kind: output.kind,
        revision: "r1",
        path: relativePath,
      },
      content: {
        format,
        value:
          format === "text"
            ? `${SCAFFOLD_PLACEHOLDER}: replace with the full file content.`
            : { note: `${SCAFFOLD_PLACEHOLDER}: replace with the artifact body.` },
      },
      ...((await exists(absolute))
        ? { expected_integrity: integrity(await readUtf8(absolute)) }
        : {}),
    });
  }

  const needsContext =
    contract.id === "design-check" ||
    contract.outputs.some(({ kind }) => contextPinnedOutputKinds.has(kind));
  const designContext = needsContext
    ? await defaultDesignContextReference(workspaceRoot)
    : null;

  return {
    schema: "silver/skill-invocation/v2",
    invocation_id: `${contract.id}-${compactTimestamp(new Date(recordedAt))}`,
    skill: { id: contract.id, version: contract.version },
    started_at: recordedAt,
    ...(outputs.length > 0
      ? {
          provenance: {
            schema: "silver/provenance/v1",
            origin: "agent-assisted",
            recorded_at: recordedAt,
            contributors: [
              {
                kind: "agent",
                id: `${SCAFFOLD_PLACEHOLDER}: identify the agent or host creating this work.`,
              },
            ],
            guidance: [],
            design_contexts: designContext ? [designContext] : [],
            change: {
              reason: `${SCAFFOLD_PLACEHOLDER}: state why this change is being made.`,
            },
            external_bindings: [],
          },
        }
      : {}),
    sources: [],
    outputs,
    available_providers: [],
    approvals: [],
    relaxations: [],
    // Left empty on purpose. The invocation runs these itself and records the
    // real outcome; the agent no longer has to run a script, split its output,
    // and copy statuses back in — the step that was skipped often enough to
    // produce results claiming passes with no evidence behind them.
    checks: [],
    unresolved_questions: [],
    acceptance: contract.completion.review.required
      ? { status: "awaiting-review" }
      : { status: "not-required" },
  };
}
