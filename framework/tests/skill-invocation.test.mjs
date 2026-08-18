import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { invokeSkill } from "../runtime/invoke-skill.mjs";

const run = promisify(execFile);

// A claimed `pass` is only believed when its evidence file exists and agrees, so
// a fixture that wants a check to count has to leave real evidence behind.
async function seedCheckEvidence(workspace, checkers, status = "pass") {
  await mkdir(path.join(workspace, ".silver/results/checks"), {
    recursive: true,
  });
  for (const checker of checkers) {
    await writeFile(
      path.join(workspace, `.silver/results/checks/${checker}.json`),
      `${JSON.stringify(
        {
          schema: "silver/check-result/v1",
          checker,
          status,
          requested: [checker],
          completed: [checker],
          findings: [],
        },
        null,
        2,
      )}\n`,
    );
  }
}

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const startedAt = "2026-07-24T21:00:00Z";
const completedAt = "2026-07-24T21:00:01Z";

function reference(id, kind, revision, artifactPath) {
  return { id, kind, revision, path: artifactPath };
}

function permissionLayers(capability, actions, paths) {
  return [
    ["framework", "framework-default"],
    ["user", "user-ceiling"],
    ["workspace", "workspace-restriction"],
    ["profile", "artifact-profile"],
    ["invocation", "invocation-constraint"],
  ].map(([id, layer]) => ({
    schema: "silver/permission-policy/v2",
    id,
    layer,
    rules: [
      {
        capability,
        actions,
        paths,
        decision: "allow",
      },
    ],
  }));
}

function provenance(sources = []) {
  return {
    schema: "silver/provenance/v1",
    origin: "agent-assisted",
    recorded_at: startedAt,
    contributors: [{ kind: "agent", id: "fixture-agent" }],
    sources,
    practice: {
      id: "my-practice",
      revision: "r1",
      methods: [],
    },
    guidance: [],
    design_contexts: [],
    change: { reason: "Created by a guarded invocation fixture." },
    acceptance: "accepted",
    external_bindings: [],
  };
}

function findingOutput() {
  const outputReference = reference(
    "campaign-finding",
    "finding",
    "r1",
    "design/work/findings/campaign-finding.json",
  );
  return {
    reference: outputReference,
    schema_name: "working-artifact.schema.json",
    content: {
      format: "json",
      value: {
        schema: "silver/working-artifact/v2",
        id: outputReference.id,
        kind: outputReference.kind,
        revision: outputReference.revision,
        scope: "product",
        status: "draft",
        title: "People cannot confidently review targeting",
        created: startedAt,
        updated: startedAt,
        sources: [
          reference(
            "seed-feedback",
            "evidence",
            "r1",
            "design/evidence/seed-feedback.json",
          ),
        ],
        payload: {
          statement: "Targeting lacks a clear review moment.",
          evidence_refs: ["seed-feedback@r1"],
          confidence: "medium",
        },
      },
    },
  };
}

function synthesizeRequest(overrides = {}) {
  return {
    schema: "silver/skill-invocation/v2",
    invocation_id: "synthesize-test-1",
    skill: { id: "synthesize", version: "0.9.0" },
    started_at: startedAt,
    inputs: [
      reference(
        "seed-feedback",
        "evidence",
        "r1",
        "design/evidence/seed-feedback.json",
      ),
    ],
    provenance: provenance([
      reference(
        "seed-feedback",
        "evidence",
        "r1",
        "design/evidence/seed-feedback.json",
      ),
    ]),
    outputs: [findingOutput()],
    permission_layers: permissionLayers(
      "repository",
      ["read", "inspect", "create", "write", "update"],
      ["design/**"],
    ),
    available_providers: [],
    approvals: [],
    relaxations: [],
    checks: [
      {
        id: "contract-integrity",
        status: "pass",
        result_path: ".silver/results/checks/contract-integrity.json",
      },
      {
        id: "evidence-provenance",
        status: "pass",
        result_path: ".silver/results/checks/evidence-provenance.json",
      },
    ],
    unresolved_questions: [],
    acceptance: {
      status: "accepted",
      reviewer: "fixture-reviewer",
      recorded_at: completedAt,
    },
    ...overrides,
  };
}

test("guarded invocation writes a valid artifact and normalized accepted result", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-positive-"),
  );
  await seedCheckEvidence(workspace, [
    "contract-integrity",
    "evidence-provenance",
  ]);
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request: synthesizeRequest(),
    completedAt,
  });
  assert.equal(result.execution.status, "complete");
  assert.ok(result.readiness.every(({ status }) => status === "ready"));
  assert.ok(
    result.recommended_next_actions.every(
      ({ automatic }) => automatic === false,
    ),
  );
  const artifact = JSON.parse(
    await readFile(
      path.join(
        workspace,
        "design/work/findings/campaign-finding.json",
      ),
      "utf8",
    ),
  );
  assert.equal(artifact.id, "campaign-finding");
  const recorded = JSON.parse(
    await readFile(
      path.join(
        workspace,
        ".silver/results/skills/synthesize-test-1.json",
      ),
      "utf8",
    ),
  );
  assert.deepEqual(recorded, result);
  assert.equal(result.degraded_capabilities[0].coverage, "degraded");
  assert.equal(result.git_checkpoint.status, "not-a-repository");
});

test("accepted outputs create a local Git checkpoint without pushing", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-git-"),
  );
  await run("git", ["-C", workspace, "init"]);
  await run("git", ["-C", workspace, "config", "commit.gpgSign", "true"]);
  await seedCheckEvidence(workspace, [
    "contract-integrity",
    "evidence-provenance",
  ]);
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request: synthesizeRequest({ invocation_id: "synthesize-git-1" }),
    completedAt,
  });
  assert.equal(result.git_checkpoint.status, "committed");
  assert.deepEqual(result.git_checkpoint.pushes, []);
  assert.deepEqual(result.git_checkpoint.pull_requests, []);
  assert.deepEqual(result.git_checkpoint.merges, []);
  assert.deepEqual(result.git_checkpoint.paths, [
    "design/work/findings/campaign-finding.json",
  ]);
  assert.equal(
    (
      await run("git", [
        "-C",
        workspace,
        "show",
        "--pretty=format:",
        "--name-only",
        "HEAD",
      ])
    ).stdout.trim(),
    "design/work/findings/campaign-finding.json",
  );
});

test("legacy Silver ask rules no longer deny repository writes", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-canonical-"),
  );
  const request = {
    schema: "silver/skill-invocation/v2",
    invocation_id: "brand-test-1",
    skill: { id: "brand", version: "0.9.0" },
    started_at: startedAt,
    inputs: [],
    outputs: [
      {
        reference: reference(
          "brand",
          "brand",
          "r1",
          "design/brand.md",
        ),
        content: {
          format: "text",
          value: "---\\nschema: silver/artifact/v1\\nid: brand\\n---\\n# Brand",
        },
      },
    ],
    provenance: provenance(),
    permission_layers: permissionLayers(
      "canonical-artifact",
      ["create", "write", "update"],
      ["design/brand.md"],
    ),
    available_providers: [],
    approvals: [],
    relaxations: [],
    checks: [],
    unresolved_questions: [],
  };
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/brand"),
    request,
    completedAt,
  });
  // The write succeeded and nothing is wrong with it, but this skill's required
  // checks never ran, so the output is unverified rather than confirmed. Saying
  // "complete" here is what let a result look more trustworthy than it was.
  assert.equal(result.execution.status, "complete-awaiting-verification");
  assert.ok(
    result.readiness.every(({ status }) => status === "not-ready"),
    "unverified work cannot be downstream-ready",
  );
  assert.equal(result.observed_effects[0].path, "design/brand.md");
  // Persisting the result is itself a write. Declaring it is what stops a skill
  // from calling itself read-only while dirtying the working tree.
  assert.ok(
    result.observed_effects.some(
      ({ path: effectPath }) =>
        effectPath === ".silver/results/skills/brand-test-1.json",
    ),
    "the result record write must appear in observed effects",
  );
  assert.deepEqual(result.effect_findings, []);
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(workspace, ".silver/results/skills/brand-test-1.json"),
        "utf8",
      ),
    ),
    result,
  );
  assert.equal(
    await readFile(path.join(workspace, "design/brand.md"), "utf8"),
    "---\\nschema: silver/artifact/v1\\nid: brand\\n---\\n# Brand\n",
  );
});

test("durable output without provenance is blocked before writing", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-no-provenance-"),
  );
  const request = synthesizeRequest();
  delete request.provenance;
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request,
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.match(result.execution.summary, /provenance envelope/);
  assert.equal(result.provenance.origin, "generated");
  await assert.rejects(
    readFile(
      path.join(workspace, "design/work/findings/campaign-finding.json"),
      "utf8",
    ),
    /ENOENT/,
  );
});

test("an invocation with no references block cites none, even when a collection exists", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-no-references-"),
  );
  await mkdir(path.join(workspace, "design/references"), { recursive: true });
  await writeFile(
    path.join(workspace, "design/references/onboarding-patterns.json"),
    JSON.stringify({
      schema: "silver/reference-collection/v1",
      id: "onboarding-patterns",
      revision: "r1",
      updated: startedAt,
      references: [],
    }),
  );
  const request = synthesizeRequest();
  delete request.provenance;
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request,
    completedAt,
  });
  assert.deepEqual(result.provenance.references, []);
});

test("an invocation citing a collection records exactly those ids, pinned by its revision", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-references-"),
  );
  await mkdir(path.join(workspace, "design/references"), { recursive: true });
  await writeFile(
    path.join(workspace, "design/references/onboarding-patterns.json"),
    JSON.stringify({
      schema: "silver/reference-collection/v1",
      id: "onboarding-patterns",
      revision: "r3",
      updated: startedAt,
      references: [
        { id: "ref-a", revision: "r1", description: "A.", rights: { usage: "inspiration-only" }, path: "design/references/assets/a.png", media_type: "image/png", integrity: "sha256:0000000000000000000000000000000000000000000000000000000000000000" },
        { id: "ref-b", revision: "r1", description: "B.", rights: { usage: "internal" }, path: "design/references/assets/b.png", media_type: "image/png", integrity: "sha256:0000000000000000000000000000000000000000000000000000000000000000" },
      ],
    }),
  );
  const request = synthesizeRequest({
    references: [{ collection: "onboarding-patterns", ids: ["ref-a"] }],
  });
  delete request.provenance;
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request,
    completedAt,
  });
  assert.deepEqual(result.provenance.references, [
    { collection: "onboarding-patterns", revision: "r3", ids: ["ref-a"] },
  ]);
});

test("citing a reference id that does not exist in the collection is refused", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-bad-reference-"),
  );
  await mkdir(path.join(workspace, "design/references"), { recursive: true });
  await writeFile(
    path.join(workspace, "design/references/onboarding-patterns.json"),
    JSON.stringify({
      schema: "silver/reference-collection/v1",
      id: "onboarding-patterns",
      revision: "r1",
      updated: startedAt,
      references: [],
    }),
  );
  const request = synthesizeRequest({
    references: [{ collection: "onboarding-patterns", ids: ["not-a-real-id"] }],
  });
  delete request.provenance;
  await assert.rejects(
    () =>
      invokeSkill({
        root: workspace,
        skillDirectory: path.join(root, "framework/skills/synthesize"),
        request,
        completedAt,
      }),
    /no entry named not-a-real-id/,
  );
});

test("visual durable output without a design-context pin is blocked", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-no-context-"),
  );
  const visualization = reference(
    "contextless-visualization",
    "visualization",
    "r1",
    "design/work/visualizations/contextless.json",
  );
  const request = {
    schema: "silver/skill-invocation/v2",
    invocation_id: "visualize-no-context",
    skill: { id: "visualize", version: "0.9.0" },
    started_at: startedAt,
    inputs: [],
    outputs: [
      {
        reference: visualization,
        content: {
          format: "json",
          value: {
            id: visualization.id,
            kind: visualization.kind,
            revision: visualization.revision,
          },
        },
      },
    ],
    provenance: provenance(),
    permission_layers: permissionLayers(
      "repository",
      ["read", "inspect", "create", "write", "update"],
      ["design/**"],
    ),
    available_providers: [],
    approvals: [],
    relaxations: [],
    checks: [],
    unresolved_questions: [],
  };
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/visualize"),
    request,
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.match(result.execution.summary, /design-context revision/);
  await assert.rejects(
    readFile(
      path.join(workspace, "design/work/visualizations/contextless.json"),
      "utf8",
    ),
    /ENOENT/,
  );
});

test("existing outputs require matching integrity and remain unchanged on stale writes", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-stale-"),
  );
  await seedCheckEvidence(workspace, [
    "contract-integrity",
    "evidence-provenance",
  ]);
  const first = synthesizeRequest();
  await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request: first,
    completedAt,
  });
  const artifactPath = path.join(
    workspace,
    "design/work/findings/campaign-finding.json",
  );
  const before = await readFile(artifactPath, "utf8");
  const second = synthesizeRequest({
    invocation_id: "synthesize-test-2",
  });
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request: second,
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.match(result.execution.summary, /expected_integrity/);
  assert.equal(await readFile(artifactPath, "utf8"), before);
});

test("registered portable production capability is selected but empty output still writes nothing", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-not-run-"),
  );
  const request = {
    schema: "silver/skill-invocation/v2",
    invocation_id: "implement-test-1",
    skill: { id: "implement", version: "0.9.0" },
    started_at: startedAt,
    inputs: [
      reference(
        "accepted-spec",
        "design-specification",
        "r1",
        "design/work/specifications/accepted-spec.json",
      ),
    ],
    outputs: [],
    permission_layers: permissionLayers(
      "production-source",
      ["create", "write", "update"],
      ["production/**"],
    ),
    available_providers: [],
    approvals: [],
    relaxations: [],
    checks: [],
    unresolved_questions: [],
  };
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/implement"),
    request,
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.ok(
    result.providers.some(
      ({ capability, provider, status }) =>
        capability === "production-source" &&
        provider === "silver-portable" &&
        status === "used",
    ),
  );
  assert.deepEqual(result.outputs, []);
});

test("non-relaxable guardrails block before writes", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-guardrail-"),
  );
  const request = synthesizeRequest({
    relaxations: [
      {
        id: "effects-declared",
        profile: "prototype-suspended",
        reason: "Attempted to suppress an observed effect.",
        decision_reference: reference(
          "bad-relaxation",
          "decision",
          "r1",
          "design/decisions/bad-relaxation.json",
        ),
      },
    ],
  });
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request,
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.match(result.execution.summary, /non-relaxable/);
});

test("undeclared recommendations block before durable outputs are written", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-recommendation-"),
  );
  const request = synthesizeRequest({
    invocation_id: "synthesize-bad-recommendation",
    recommended_next_actions: [
      {
        action: "delete-workspace",
        reason: "This action is outside the synthesize contract.",
        automatic: false,
      },
    ],
  });
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request,
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.deepEqual(result.outputs, []);
  assert.deepEqual(result.recommended_next_actions, []);
  await assert.rejects(
    readFile(
      path.join(
        workspace,
        "design/work/findings/campaign-finding.json",
      ),
    ),
    /ENOENT/,
  );
});
