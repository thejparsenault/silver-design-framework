import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { invokeSkill } from "../framework/runtime/invoke-skill.mjs";
import { inspectWorkspace } from "../framework/skills/what-now/scripts/analyze-workspace.mjs";

function invocationId(prefix, date) {
  const timestamp = date
    .toISOString()
    .replace(/[-:.]/g, "")
    .toLowerCase();
  return `${prefix}-${timestamp}`;
}

// Asking what to do next should not change anything.
//
// `what-now` described itself as read-only and its boundaries said "do not edit
// workspace files", yet every invocation persisted a result record — declaring
// only read and inspect effects while the no-silent-mutation guardrail reported
// a pass. Analysis is now genuinely read-only, and recording is an explicit
// choice. Setup still records one, because a workspace's first orientation is
// worth keeping in its provenance.
export async function runWhatNow({
  root,
  now = new Date(),
  invocationPrefix = "what-now",
  record = false,
} = {}) {
  const workspaceRoot = path.resolve(root);
  const skillDirectory = path.join(workspaceRoot, ".skills", "what-now");
  const contractSource = await readFile(
    path.join(skillDirectory, "skill.yaml"),
    "utf8",
  );
  const contract = parse(contractSource);
  const observedAt = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(observedAt.valueOf())) {
    throw new Error("what-now requires a valid analysis time.");
  }
  const analysis = await inspectWorkspace(workspaceRoot, observedAt);
  const timestamp = observedAt.toISOString();
  if (!record) {
    return { analysis, result: null, recorded: false };
  }
  const result = await invokeSkill({
    root: workspaceRoot,
    skillDirectory,
    completedAt: timestamp,
    request: {
      schema: "silver/skill-invocation/v2",
      invocation_id: invocationId(invocationPrefix, observedAt),
      skill: { id: contract.id, version: contract.version },
      started_at: timestamp,
      inputs: [],
      outputs: [],
      available_providers: [],
      approvals: [],
      relaxations: [],
      checks: [],
      unresolved_questions: [],
      observed_effects: [
        {
          capability: "repository",
          action: "inspect",
          reference: "current workspace state",
        },
      ],
      recommended_next_actions: analysis.invocation_recommendations,
    },
  });
  if (
    !["complete", "complete-awaiting-verification", "complete-with-findings"].includes(
      result.execution.status,
    )
  ) {
    throw new Error(`what-now did not complete: ${result.execution.summary}`);
  }
  return { analysis, result, recorded: true };
}
