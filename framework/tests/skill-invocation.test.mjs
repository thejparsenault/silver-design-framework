import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { invokeSkill } from "../runtime/invoke-skill.mjs";

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
    skill: { id: "synthesize", version: "0.2.0" },
    started_at: startedAt,
    inputs: [
      reference(
        "seed-feedback",
        "evidence",
        "r1",
        "design/evidence/seed-feedback.json",
      ),
    ],
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
});

test("canonical writes stop at an unresolved ask boundary", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-canonical-"),
  );
  const request = {
    schema: "silver/skill-invocation/v2",
    invocation_id: "brand-test-1",
    skill: { id: "brand", version: "0.2.0" },
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
  assert.equal(result.execution.status, "blocked");
  assert.match(result.execution.summary, /Approval required/);
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(workspace, ".silver/results/skills/brand-test-1.json"),
        "utf8",
      ),
    ),
    result,
  );
  await assert.rejects(
    readFile(path.join(workspace, "design/brand.md")),
    /ENOENT/,
  );
});

test("existing outputs require matching integrity and remain unchanged on stale writes", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-stale-"),
  );
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

test("missing required production capability is not-run and writes nothing", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-not-run-"),
  );
  const request = {
    schema: "silver/skill-invocation/v2",
    invocation_id: "implement-test-1",
    skill: { id: "implement", version: "0.2.0" },
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
  assert.equal(result.execution.status, "not-run");
  assert.ok(
    result.degraded_capabilities.some(
      ({ capability, coverage }) =>
        capability === "production-source" && coverage === "not-run",
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
        id: "permission-bounded",
        profile: "prototype-suspended",
        reason: "Attempted permission bypass.",
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
