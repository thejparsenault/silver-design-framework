import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkStructure } from "../skills/structure/scripts/check-structure.mjs";

const fixedTime = "2026-08-12T12:00:00.000Z";

async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-structure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function reference(id, kind, artifactPath, revision = "r1") {
  return { id, kind, revision, path: artifactPath };
}

function provenance(context) {
  return {
    schema: "silver/provenance/v1",
    origin: "agent-assisted",
    recorded_at: fixedTime,
    contributors: [{ kind: "agent", id: "test-agent" }],
    practice: { id: "my-practice", revision: "r1", methods: [] },
    guidance: [],
    design_contexts: [context],
    change: { reason: "Created from a reviewed model." },
    acceptance: "accepted",
    external_bindings: [],
  };
}

function structureFixture() {
  const context = reference(
    "default-design-context",
    "design-context",
    "design/contexts/default.yaml",
  );
  return {
    schema: "silver/structure/v1",
    id: "account-hierarchy",
    kind: "structure",
    revision: "r1",
    title: "Account hierarchy",
    structure_type: "object-model",
    question: "How do organizations, teams, and members relate?",
    entities: [
      { id: "organization", title: "Organization", attributes: ["name", "plan"] },
      { id: "team", title: "Team", attributes: ["name"], parent: "organization" },
      { id: "member", title: "Member", attributes: ["email"], parent: "team" },
    ],
    relationships: [
      { from: "organization", to: "team", relationship: "has many", cardinality: "one-to-many" },
      { from: "team", to: "member", relationship: "has many", cardinality: "one-to-many" },
    ],
    rules: ["A member belongs to exactly one team at a time."],
    design_contexts: [context],
    primary_context: context.id,
    provenance: provenance(context),
  };
}

test("a valid structure document passes", async (t) => {
  const root = await workspace(t);
  const artifactPath = path.join(root, "design", "structures", "account-hierarchy.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(structureFixture(), null, 2)}\n`);

  const result = await checkStructure({
    root,
    structure: "design/structures/account-hierarchy.json",
  });
  assert.equal(result.status, "pass", JSON.stringify(result, null, 2));
});

test("duplicate entity ids, dangling relationship targets, and parent cycles each produce a finding", async (t) => {
  const root = await workspace(t);
  const artifact = structureFixture();
  artifact.entities.push({ id: "team", title: "Duplicate team", parent: "organization" });
  artifact.relationships.push({ from: "member", to: "missing-entity", relationship: "reports to" });
  artifact.entities.find(({ id }) => id === "organization").parent = "member";

  const artifactPath = path.join(root, "design", "structures", "account-hierarchy.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

  const result = await checkStructure({
    root,
    structure: "design/structures/account-hierarchy.json",
  });
  assert.equal(result.status, "fail");
  const findings = result.findings.join(" ");
  assert.match(findings, /duplicated/);
  assert.match(findings, /missing-entity/);
  assert.match(findings, /cycle/);
});

test("structure check refuses paths outside the workspace", async (t) => {
  const root = await workspace(t);
  await assert.rejects(
    checkStructure({ root, structure: "../outside.json" }),
    /escapes workspace/,
  );
});
