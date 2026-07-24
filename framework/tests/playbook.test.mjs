import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { assertV2 } from "../runtime/contracts.mjs";
import {
  assertPlaybookGraph,
  createPlaybookState,
  recordNodeResult,
  resolveCheckpoint,
  resumePlaybook,
} from "../runtime/playbooks.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const time = {
  start: "2026-07-24T20:00:00Z",
  synth: "2026-07-24T20:00:01Z",
  ideate: "2026-07-24T20:00:02Z",
  selection: "2026-07-24T20:00:03Z",
  specify: "2026-07-24T20:00:04Z",
  resume: "2026-07-24T20:00:05Z",
};

async function loadPlaybook() {
  return parse(
    await readFile(
      path.join(root, "framework/playbooks/default-design-loop.yaml"),
      "utf8",
    ),
  );
}

function ref(id, kind, revision, artifactPath) {
  return { id, kind, revision, path: artifactPath };
}

function result({ id, skill, inputs = [], outputs = [] }) {
  return {
    schema: "silver/skill-result/v2",
    invocation_id: id,
    skill: { id: skill, version: "0.2.0" },
    started_at: time.start,
    completed_at: time.start,
    inputs,
    outputs,
    providers: [
      {
        capability: "repository",
        provider: "silver-local",
        status: "used",
      },
    ],
    degraded_capabilities: [],
    execution: { status: "complete", summary: `${skill} completed.` },
    acceptance: { status: "accepted" },
    readiness: [
      { name: "next-step", status: "ready", reasons: [] },
    ],
    checks: [],
    guardrails: [],
    unresolved_questions: [],
    recommended_next_actions: [],
  };
}

test("default playbook is a valid graph of pinned leaf skills with bounded autonomy", async () => {
  const playbook = await loadPlaybook();
  await assertV2("playbook.schema.json", playbook);
  assertPlaybookGraph(playbook);
  assert.ok(
    playbook.nodes.every(({ skill }) => skill.version === "0.2.0"),
  );
  assert.deepEqual(playbook.autonomy.forbidden_effects, [
    "canonical-write",
    "external-write",
    "production-write",
    "destructive-operation",
    "version-control",
    "publish",
    "present",
    "send",
  ]);
});

test("playbook pauses for selection and resumes from serialized state", async () => {
  const playbook = await loadPlaybook();
  const evidence = ref(
    "seed-feedback",
    "evidence",
    "r1",
    "design/evidence/seed-feedback.json",
  );
  let state = createPlaybookState({
    playbook,
    runId: "campaign-loop-1",
    inputs: [evidence],
    options: {
      "include-flow": false,
      "include-sketch": false,
      "include-prototype": false,
      "include-pitch": false,
      "include-implementation": false,
    },
    now: time.start,
  });
  await assertV2("playbook-state.schema.json", state);
  assert.deepEqual(state.current_nodes, ["synthesize"]);

  const finding = ref(
    "campaign-finding",
    "finding",
    "r1",
    "design/work/findings/campaign-finding.json",
  );
  state = recordNodeResult({
    playbook,
    state,
    nodeId: "synthesize",
    result: result({
      id: "synthesize-run-1",
      skill: "synthesize",
      inputs: [evidence],
      outputs: [finding],
    }),
    now: time.synth,
  });
  assert.deepEqual(state.current_nodes, ["ideate"]);

  const concept = ref(
    "guided-review",
    "concept",
    "r1",
    "design/work/concepts/guided-review.json",
  );
  state = recordNodeResult({
    playbook,
    state,
    nodeId: "ideate",
    result: result({
      id: "ideate-run-1",
      skill: "ideate",
      inputs: [finding],
      outputs: [concept],
    }),
    now: time.ideate,
  });
  await assertV2("playbook-state.schema.json", state);
  assert.equal(state.status, "paused");
  assert.equal(state.checkpoints.at(-1).id, "select-direction");
  assert.deepEqual(state.current_nodes, []);

  state = JSON.parse(JSON.stringify(state));
  state = resolveCheckpoint({
    playbook,
    state,
    checkpointId: "select-direction",
    accepted: true,
    resolution: "Selected guided review for specification.",
    now: time.selection,
  });
  assert.equal(state.status, "running");
  assert.deepEqual(state.current_nodes, ["specify"]);
});

test("upstream revision changes preserve old references and visibly stale downstream work", async () => {
  const playbook = await loadPlaybook();
  const evidence = ref(
    "seed-feedback",
    "evidence",
    "r1",
    "design/evidence/seed-feedback.json",
  );
  const finding = ref(
    "campaign-finding",
    "finding",
    "r1",
    "design/work/findings/campaign-finding.json",
  );
  const concept = ref(
    "guided-review",
    "concept",
    "r1",
    "design/work/concepts/guided-review.json",
  );
  const specification = ref(
    "guided-review-spec",
    "design-specification",
    "r1",
    "design/work/specifications/guided-review-spec.json",
  );
  let state = createPlaybookState({
    playbook,
    runId: "campaign-loop-2",
    inputs: [evidence],
    options: {
      "include-flow": false,
      "include-sketch": false,
      "include-prototype": false,
      "include-pitch": false,
      "include-implementation": false,
    },
    now: time.start,
  });
  state = recordNodeResult({
    playbook,
    state,
    nodeId: "synthesize",
    result: result({
      id: "synthesize-run-2",
      skill: "synthesize",
      inputs: [evidence],
      outputs: [finding],
    }),
    now: time.synth,
  });
  state = recordNodeResult({
    playbook,
    state,
    nodeId: "ideate",
    result: result({
      id: "ideate-run-2",
      skill: "ideate",
      inputs: [finding],
      outputs: [concept],
    }),
    now: time.ideate,
  });
  state = resolveCheckpoint({
    playbook,
    state,
    checkpointId: "select-direction",
    accepted: true,
    resolution: "Selected guided review.",
    now: time.selection,
  });
  state = recordNodeResult({
    playbook,
    state,
    nodeId: "specify",
    result: result({
      id: "specify-run-1",
      skill: "specify",
      inputs: [concept],
      outputs: [specification],
    }),
    now: time.specify,
  });
  assert.deepEqual(state.current_nodes, ["evaluate"]);

  const resumed = resumePlaybook({
    playbook,
    state: JSON.parse(JSON.stringify(state)),
    currentArtifacts: [
      evidence,
      { ...finding, revision: "r2" },
      concept,
      specification,
    ],
    now: time.resume,
  });
  await assertV2("playbook-state.schema.json", resumed);
  assert.equal(resumed.status, "paused");
  assert.equal(resumed.invalidations.length, 1);
  assert.deepEqual(
    {
      recorded: resumed.invalidations[0].recorded_revision,
      observed: resumed.invalidations[0].observed_revision,
    },
    { recorded: "r1", observed: "r2" },
  );
  assert.ok(
    resumed.invalidations[0].affected_nodes.includes("specify"),
  );
  assert.equal(
    resumed.node_states.find(({ node }) => node === "specify").status,
    "stale",
  );
  assert.equal(
    resumed.node_states
      .find(({ node }) => node === "synthesize")
      .outputs[0].revision,
    "r1",
  );
  assert.match(
    resumed.checkpoints.at(-1).prompt,
    /downstream artifacts were not rewritten/,
  );
});
