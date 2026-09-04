import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkArtifacts } from "../skills/design-check/scripts/check-artifacts.mjs";
import { checkPrototypes } from "../skills/design-check/scripts/check-prototypes.mjs";
import { checkSemanticStyles } from "../skills/design-check/scripts/check-semantic-styles.mjs";
import { runFastSuite } from "../skills/design-check/scripts/run-fast.mjs";
import { checkRepresentationRule } from "../skills/design-check/scripts/check-representation-lib.mjs";
import { checkAuditTrailIntegrity } from "../skills/design-check/scripts/check-audit-trail-integrity.mjs";
import { checkManagedIntegrity } from "../skills/design-check/scripts/check-managed-integrity.mjs";
import { contentIntegrity } from "../runtime/representations.mjs";
import { initFlow } from "../skills/flow/scripts/init-flow.mjs";
import { initPrototype } from "../skills/prototype/scripts/init-prototype.mjs";
import { validateSchema } from "../../installer/lib/schemas.mjs";
import { setupWorkspace } from "../../installer/setup.mjs";

async function temporaryWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "design-check-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await setupWorkspace({
    root,
    name: "Check Fixture",
    id: "check-fixture",
    date: "2026-07-23",
  });
  return root;
}

test("bundled fast checks pass on a fresh blank workspace", async (t) => {
  const root = await temporaryWorkspace(t);
  const result = await runFastSuite({ root });

  assert.equal(result.status, "pass");
  assert.deepEqual(
    result.results.map(({ checker }) => checker),
    [
      "contract-integrity",
      "audit-trail-integrity",
      "flow-structure",
      "map-structure",
      "structure-integrity",
      "semantic-styles",
      "prototype-policy",
      "evidence-provenance",
      "presentation-integrity",
      "production-readiness",
      "asset-integrity",
      "reference-integrity",
      "accessibility",
      "responsive-behavior",
      "critical-interactions",
      "managed-integrity",
      "binding-integrity",
      "provider-revision-pins",
      "render-provenance",
      "synchronization-status",
      "semantic-mapping",
      "stale-proposals",
      "authority",
      "secret-free-configuration",
    ],
  );
  for (const checkerResult of result.results) {
    assert.equal(
      (await validateSchema("check-result.schema.json", checkerResult)).valid,
      true,
    );
  }
});

test("audit-trail integrity reports malformed result records instead of silently skipping them", async (t) => {
  const root = await temporaryWorkspace(t);
  await mkdir(path.join(root, ".silver/results/skills"), { recursive: true });
  await writeFile(path.join(root, ".silver/results/skills/broken.json"), "{not-json\n");
  const result = await checkAuditTrailIntegrity({ root });
  assert.equal(result.status, "fail");
  assert.ok(result.findings.some(({ rule }) => rule === "audit-trail.result-invalid"));
});

test("managed-integrity uses the same stale-package diagnostic as doctor", async (t) => {
  const root = await temporaryWorkspace(t);
  const skillPath = path.join(root, ".skills/brand/SKILL.md");
  await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\nTampered.\n`);
  const result = await checkManagedIntegrity({ root });
  assert.equal(result.status, "fail");
  assert.ok(
    result.findings.some(
      ({ rule, file }) =>
        rule === "managed-integrity.managed-package-stale" && file === ".skills/brand",
    ),
  );
});

test("a selected fast check runs alone and unknown ids are refused", async (t) => {
  const root = await temporaryWorkspace(t);
  const selected = await runFastSuite({ root, only: ["semantic-styles"] });
  assert.deepEqual(
    selected.results.map(({ checker }) => checker),
    ["semantic-styles"],
  );
  await assert.rejects(
    runFastSuite({ root, only: ["not-a-check"] }),
    /Unknown fast check: not-a-check/,
  );
});

test("artifact checker rejects malformed canonical metadata", async (t) => {
  const root = await temporaryWorkspace(t);
  const brandPath = path.join(root, "design", "brand.md");
  await writeFile(
    brandPath,
    (await readFile(brandPath, "utf8")).replace(
      "status: draft",
      "status: active",
    ),
  );

  const result = await checkArtifacts({ root });
  assert.equal(result.status, "fail");
  assert.ok(
    result.findings.some(
      ({ rule }) => rule === "artifact.frontmatter-mismatch",
    ),
  );
});

test("historical source drift is ignored and preserves immutable artifact provenance", async (t) => {
  const root = await temporaryWorkspace(t);
  const timestamp = "2026-07-24T20:00:00Z";
  const specificationPath = "design/work/specifications/history.json";
  const visualizationPath = "design/work/visualizations/history/visualization.json";
  const viewPath = "design/work/visualizations/history/index.html";
  await mkdir(path.join(root, "design/work/specifications"), { recursive: true });
  await mkdir(path.join(root, "design/work/visualizations/history"), { recursive: true });
  const specification = {
    schema: "silver/working-artifact/v2",
    id: "historical-spec",
    kind: "design-specification",
    revision: "r1",
    scope: "product",
    status: "accepted",
    title: "Historical specification",
    created: timestamp,
    updated: timestamp,
    sources: [],
    payload: {
      outcomes: ["Understand history"],
      hypothesis: "Pinned provenance remains accurate.",
      scope: ["History"],
      non_goals: [],
      requirements: ["Preserve pins"],
      content_and_data: [],
      states: ["ready"],
      edge_cases: [],
      accessibility: [],
      success_criteria: ["No false failure"],
      decisions: [],
      open_questions: [],
    },
  };
  await writeFile(path.join(root, specificationPath), `${JSON.stringify(specification, null, 2)}\n`);
  await writeFile(
    path.join(root, visualizationPath),
    `${JSON.stringify({
      schema: "silver/working-artifact/v2",
      id: "historical-visualization",
      kind: "visualization",
      revision: "r1",
      scope: "product",
      status: "accepted",
      title: "Historical visualization",
      created: timestamp,
      updated: timestamp,
      sources: [{ id: specification.id, kind: specification.kind, revision: "r1", path: specificationPath }],
      payload: {
        fidelity: "high",
        constraint_profile: "constrained",
        question: "What was reviewed?",
        view_path: viewPath,
      },
    }, null, 2)}\n`,
  );
  await writeFile(path.join(root, viewPath), "<!doctype html><main><h1>Historical view</h1></main>\n");
  await writeFile(
    path.join(root, specificationPath),
    `${JSON.stringify({ ...specification, revision: "r2", updated: "2026-07-25T20:00:00Z" }, null, 2)}\n`,
  );

  const result = await checkArtifacts({ root });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.findings, []);
  assert.equal(result.extensions, undefined);
  const recorded = JSON.parse(await readFile(path.join(root, visualizationPath), "utf8"));
  assert.equal(recorded.sources[0].revision, "r1");
});

test("semantic checker rejects raw visual values in prototype code", async (t) => {
  const root = await temporaryWorkspace(t);
  const prototypeRoot = path.join(root, "prototypes", "raw-values");
  await mkdir(prototypeRoot, { recursive: true });
  await writeFile(
    path.join(prototypeRoot, "prototype.css"),
    ".example { color: #123456; margin: 13px; }\n",
  );

  const result = await checkSemanticStyles({ root });
  assert.equal(result.status, "fail");
  assert.ok(
    result.findings.some(({ rule }) => rule === "semantic-style.raw-color"),
  );
  assert.ok(
    result.findings.some(
      ({ rule }) => rule === "semantic-style.raw-dimension",
    ),
  );
});

test("semantic checker flags a var() reference to a token that no longer exists", async (t) => {
  const root = await temporaryWorkspace(t);
  const prototypeRoot = path.join(root, "prototypes", "broken-token");
  await mkdir(prototypeRoot, { recursive: true });
  await writeFile(
    path.join(prototypeRoot, "prototype.css"),
    ".example { height: var(--ds-does-not-exist); }\n",
  );

  const result = await checkSemanticStyles({ root });
  assert.equal(result.status, "fail");
  const found = result.findings.find(
    ({ rule }) => rule === "semantic-style.unresolved-token",
  );
  assert.ok(found);
  assert.equal(found.observed_value, "--ds-does-not-exist");
  assert.match(found.suggested_correction, /silver invoke prototype/);
});

test("semantic checker does not flag a var() reference to a real, currently-declared token", async (t) => {
  const root = await temporaryWorkspace(t);
  const prototypeRoot = path.join(root, "prototypes", "real-token");
  await mkdir(prototypeRoot, { recursive: true });
  await writeFile(
    path.join(prototypeRoot, "prototype.css"),
    ".example { height: var(--ds-button-height-sm); }\n",
  );

  const result = await checkSemanticStyles({ root });
  assert.ok(
    !result.findings.some(
      ({ rule }) => rule === "semantic-style.unresolved-token",
    ),
  );
});

test("semantic checker suggests re-invoking the owning skill only for artifacts a skill owns", async (t) => {
  const root = await temporaryWorkspace(t);
  const prototypeRoot = path.join(root, "prototypes", "raw-values");
  await mkdir(prototypeRoot, { recursive: true });
  await writeFile(
    path.join(prototypeRoot, "prototype.css"),
    ".example { color: #123456; }\n",
  );
  await writeFile(
    path.join(root, "design", "system", "raw-values.css"),
    ".example { color: #123456; }\n",
  );

  const result = await checkSemanticStyles({ root });
  const prototypeFinding = result.findings.find(
    ({ rule, file }) => rule === "semantic-style.raw-color" && file.startsWith("prototypes/"),
  );
  const systemFinding = result.findings.find(
    ({ rule, file }) => rule === "semantic-style.raw-color" && file.startsWith("design/system/"),
  );
  assert.ok(prototypeFinding);
  assert.ok(systemFinding);
  assert.match(prototypeFinding.suggested_correction, /silver invoke prototype/);
  assert.doesNotMatch(systemFinding.suggested_correction, /silver invoke/);
});

test("semantic checker downgrades findings to informational under the adoption policy profile", async (t) => {
  const root = await temporaryWorkspace(t);
  const prototypeRoot = path.join(root, "prototypes", "raw-values");
  await mkdir(prototypeRoot, { recursive: true });
  await writeFile(
    path.join(prototypeRoot, "prototype.css"),
    ".example { color: #123456; margin: 13px; }\n",
  );
  const manifestPath = path.join(root, "design", "manifest.yaml");
  await writeFile(
    manifestPath,
    (await readFile(manifestPath, "utf8")).replace(
      "policy_profile: prototype",
      "policy_profile: adoption",
    ),
  );

  const result = await checkSemanticStyles({ root });
  assert.equal(result.policy_profile, "adoption");
  assert.notEqual(result.status, "pass");
  assert.ok(result.findings.length > 0);
  for (const item of result.findings) {
    assert.equal(item.severity, "info");
    assert.equal(item.policy_profile, "adoption");
    assert.match(item.message, /adoption/);
  }
});

test("semantic checker reports not-run when adopted work has no token index yet", async (t) => {
  const root = await temporaryWorkspace(t);
  const manifestPath = path.join(root, "design", "manifest.yaml");
  await writeFile(
    manifestPath,
    (await readFile(manifestPath, "utf8")).replace(
      "policy_profile: prototype",
      "policy_profile: adoption",
    ),
  );
  await rm(path.join(root, "design", "system", "tokens.json"), { force: true });

  const result = await checkSemanticStyles({ root });
  assert.equal(result.status, "not-run");
  assert.equal(result.policy_profile, "adoption");
  assert.ok(result.coverage.reason);
  assert.deepEqual(result.findings, []);
});

test("prototype checker reports flow revision drift", async (t) => {
  const root = await temporaryWorkspace(t);
  const { outputPath } = await initFlow({
    root,
    id: "setup-flow",
    title: "Setup flow",
    purpose: "Understand the setup path.",
    outcome: "Workspace is ready",
    date: "2026-07-23",
  });
  await initPrototype({
    root,
    id: "setup-prototype",
    title: "Setup prototype",
    flowRefs: ["setup-flow@1=design/flows/setup-flow/flow.json"],
    date: "2026-07-23",
  });
  const flow = JSON.parse(await readFile(outputPath, "utf8"));
  flow.revision = 2;
  await writeFile(outputPath, `${JSON.stringify(flow, null, 2)}\n`);

  const result = await checkPrototypes({ root });
  assert.equal(result.status, "fail");
  assert.ok(
    result.findings.some(
      ({ rule }) => rule === "prototype.flow-revision-mismatch",
    ),
  );
});

test("v2 representation checks accept healthy identities and detect pending proposal drift", async (t) => {
  const root = await temporaryWorkspace(t);
  const artifactPath = "design/work/check-target.json";
  const artifactContent = '{"value":"before"}\n';
  await mkdir(path.join(root, "design/work"), { recursive: true });
  await writeFile(path.join(root, artifactPath), artifactContent);
  const integrity = contentIntegrity(artifactContent);
  const binding = `schema: silver/representation-binding/v2
id: check-target
artifact:
  id: check-target
  kind: token-source
  revision: r1
  path: ${artifactPath}
counterpart:
  type: provider
  provider: figma-console-mcp
  object_id: file-check
  revision: v1
adapter:
  id: silver-figma
  version: 0.9.2
authority: shared-review
round_trip: partial
sync_policy: notify
base:
  state: initialized
  local:
    state: present
    revision: r1
    integrity: ${integrity}
  external:
    state: present
    revision: v1
    integrity: ${integrity}
  at: 2026-08-23T12:00:00Z
`;
  await writeFile(path.join(root, "design/integrations/check-target.yaml"), binding);
  await writeFile(path.join(root, "design/integrations/missing-target.yaml"), binding
    .replaceAll("check-target", "missing-target")
    .replace("state: initialized\n  local:\n    state: present\n    revision: r1\n    integrity: " + integrity + "\n  external:\n    state: present\n    revision: v1\n    integrity: " + integrity + "\n  at: 2026-08-23T12:00:00Z", "state: initialized\n  local:\n    state: missing\n  external:\n    state: missing\n  at: 2026-08-23T12:00:00Z"));
  const proposal = {
    schema: "silver/change-set/v2",
    id: "check-proposal",
    binding_id: "check-target",
    direction: "external-to-local",
    binding_integrity: contentIntegrity(binding),
    base: {
      state: "initialized",
      local: { state: "present", revision: "r1", integrity },
      external: { state: "present", revision: "v1", integrity },
      at: "2026-08-23T12:00:00Z",
    },
    local: { state: "present", revision: "r1", integrity },
    external: { state: "present", revision: "v2", integrity },
    adapter: { id: "silver-figma", version: "0.9.2" },
    created_at: "2026-08-23T12:00:00Z",
    operations: [{
      id: "update-target",
      type: "update",
      classification: "semantic-style",
      mapping_fidelity: "semantic",
      source_path: "figma:node-1",
      target_path: artifactPath,
      source_identity: { state: "present", revision: "v2", integrity },
      target_identity: { state: "present", revision: "r1", integrity },
      required_approval: true,
      unresolved: [],
    }],
    required_checks: [],
  };
  const proposalContent = `${JSON.stringify(proposal, null, 2)}\n`;
  const proposalPath = ".silver/results/reconciliation/change-sets/check-proposal.json";
  const resultPath = ".silver/results/reconciliation/results/check-result.json";
  await mkdir(path.join(root, ".silver/results/reconciliation/change-sets"), { recursive: true });
  await mkdir(path.join(root, ".silver/results/reconciliation/results"), { recursive: true });
  await writeFile(path.join(root, proposalPath), proposalContent);
  const result = {
    schema: "silver/reconciliation-result/v2",
    id: "check-result",
    binding_id: "check-target",
    direction: "external-to-local",
    status: "awaiting-acceptance",
    state: "external-changed",
    proposal_path: proposalPath,
    proposal_integrity: contentIntegrity(proposalContent),
    selected_operations: [],
    applied_operations: [],
    checks: [],
    external_action: null,
    transaction: null,
    binding_advancement: null,
    blockers: [],
    created_at: "2026-08-23T12:00:00Z",
    updated_at: "2026-08-23T12:00:00Z",
  };
  await writeFile(path.join(root, resultPath), `${JSON.stringify(result, null, 2)}\n`);

  for (const checker of ["binding-integrity", "provider-revision-pins", "synchronization-status", "semantic-mapping", "stale-proposals", "authority"]) {
    assert.equal((await checkRepresentationRule({ root, checker })).status, "pass", checker);
  }

  await writeFile(path.join(root, artifactPath), '{"value":"after"}\n');
  assert.equal((await checkRepresentationRule({ root, checker: "stale-proposals" })).status, "fail");
  await writeFile(path.join(root, resultPath), `${JSON.stringify({
    ...result,
    status: "applied",
    state: "current",
    selected_operations: ["update-target"],
    applied_operations: ["update-target"],
  }, null, 2)}\n`);
  assert.equal((await checkRepresentationRule({ root, checker: "stale-proposals" })).status, "pass");
});
