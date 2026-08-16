import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parse } from "yaml";

import { codecForArtifact, decodePortable, discoverArtifactCodecs, encodePortable } from "../runtime/artifact-codecs.mjs";
import { assertV2 } from "../runtime/contracts.mjs";
import { invokeSkill } from "../runtime/invoke-skill.mjs";
import { resolvePermissions } from "../runtime/permissions.mjs";
import { discoverProviders } from "../runtime/providers.mjs";
import { acceptReconciliation, applyReconciliation, persistReconciliationRecord, proposeReconciliation } from "../runtime/reconciliation.mjs";
import { contentIntegrity, synchronizationState, validateBinding, validateToolProfile, valueIntegrity, writeBinding } from "../runtime/representations.mjs";
import { applySemanticTokenWrite, createFigmaChangeSet, normalizeFigmaSnapshot, previewSemanticTokenWrite } from "../providers/figma-console-mcp/adapter.mjs";
import { renderFlowFile } from "../skills/flow/scripts/render-flow.mjs";
import { renderStaticPrototype } from "../skills/prototype/scripts/render-static-prototype.mjs";
import { renderSystemCatalog } from "../skills/system/scripts/render-system-catalog.mjs";
import { runFastSuite } from "../skills/design-check/scripts/run-fast.mjs";
import { setupWorkspace } from "../../installer/setup.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const fixedTime = "2026-07-25T20:00:00Z";

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8"));
}

async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-reconcile-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Portable reconciliation", id: "portable-reconciliation", date: "2026-07-25" });
  return root;
}

function working(id, kind, title, payload, revision = "r1") {
  return {
    schema: "silver/working-artifact/v2",
    id, kind, revision, scope: "product", status: "accepted", title,
    created: fixedTime, updated: fixedTime, sources: [], payload,
  };
}

function flow() {
  return {
    schema: "silver/flow/v1",
    id: "guided-setup-flow",
    title: "Guided setup flow",
    kind: "user-flow",
    scope: "product",
    status: "active",
    revision: 1,
    purpose: "Make setup consequences predictable.",
    actors: [{ id: "owner", name: "Workspace owner" }],
    desired_outcomes: ["Setup is completed intentionally"],
    start_nodes: ["review"],
    nodes: [
      { id: "review", type: "screen", title: "Review setup", actor: "owner" },
      { id: "complete", type: "outcome", title: "Setup complete" },
    ],
    transitions: [{ id: "finish", from: "review", to: "complete", trigger: "Finish setup", actor: "owner" }],
    created: "2026-07-25",
    updated: "2026-07-25",
  };
}

async function writeJson(root, relativePath, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await writeFile(path.join(root, relativePath), content, "utf8");
  return { content, integrity: contentIntegrity(content) };
}

async function reconciliationFixture(t, authority = "local") {
  const root = await workspace(t);
  const paths = {
    flow: "design/flows/guided-setup/flow.json",
    visualization: "design/work/visualizations/guided-setup/visualization.json",
    specification: "design/work/specifications/guided-setup.json",
    tokens: "design/work/tokens/guided-setup.json",
    component: "design/work/components/guided-setup.json",
  };
  const artifacts = {
    flow: flow(),
    visualization: working("guided-setup-visualization", "visualization", "Guided setup visualization", {
      fidelity: "low", constraint_profile: "constrained",
      question: "Does the structure explain the consequence?",
      view_path: "design/work/visualizations/guided-setup/index.html",
      alternatives: [
        { title: "Summary", summary: "Show saved values.", tradeoff: "More content." },
        { title: "Action", summary: "Focus the decision.", tradeoff: "Less context." },
      ],
    }),
    specification: working("guided-setup-specification", "design-specification", "Guided setup specification", {
      outcomes: ["Predict the result"], hypothesis: "A summary improves prediction.",
      scope: ["Final review"], non_goals: ["Provisioning"], requirements: ["Show the result"],
      content_and_data: ["Workspace name"], states: ["ready", "complete"], edge_cases: ["Name missing"],
      accessibility: ["Keyboard operable"], success_criteria: ["Prediction is correct"],
      decisions: [], open_questions: [],
    }),
    tokens: working("guided-setup-tokens", "token-source", "Guided setup tokens", {
      format: "dtcg", semantic_tokens: { "surface.canvas": "{color.neutral.0}" },
    }),
    component: working("guided-setup-component", "component-proposal", "Guided setup component", {
      classification: "product-composition", anatomy: ["Summary", "Action"], states: ["ready", "complete"],
    }),
  };
  const writes = {};
  for (const key of Object.keys(paths)) writes[key] = await writeJson(root, paths[key], artifacts[key]);

  const binding = {
    schema: "silver/representation-binding/v1",
    id: "guided-setup-figma",
    artifact: { id: "guided-setup-flow", kind: "flow", revision: "r1", path: paths.flow },
    view: { role: "external-view", format: "figma" },
    provider: { id: "figma-console-mcp", object_id: "file-123", revision: "v18" },
    adapter: { id: "silver-figma", version: "0.4.0" },
    mapping_profile: "product-web",
    authority,
    ...(authority === "external" ? { authority_provider: "figma-console-mcp" } : {}),
    round_trip: "partial",
    sync_policy: "notify",
    last_reconciled: {
      portable_revision: "r1",
      portable_integrity: writes.flow.integrity,
      external_revision: "v18",
      snapshot_integrity: `sha256:${"0".repeat(64)}`,
      snapshot_path: ".silver/results/reconciliation/snapshots/guided-setup-figma-base.json",
      at: fixedTime,
    },
  };
  const baseSnapshot = await normalizeFigmaSnapshot({
    binding, payload: await json("fixtures/providers/figma/base.json"), capturedAt: fixedTime,
  });
  binding.last_reconciled.snapshot_integrity = valueIntegrity(baseSnapshot);
  await validateBinding(binding);
  await writeBinding({ root, binding });
  await persistReconciliationRecord({ root, kind: "snapshots", id: "guided-setup-figma-base", value: baseSnapshot });
  const currentSnapshot = await normalizeFigmaSnapshot({
    binding, payload: await json("fixtures/providers/figma/changed.json"), capturedAt: "2026-07-25T20:05:00Z",
  });
  await persistReconciliationRecord({ root, kind: "snapshots", id: "guided-setup-figma-current", value: currentSnapshot });

  const target = (key, checks = []) => ({
    id: artifacts[key].id,
    kind: key === "flow" ? "flow" : artifacts[key].kind,
    revision: "r1",
    path: paths[key],
    integrity: writes[key].integrity,
    checks,
    ...(key === "flow" ? { schema: "silver/flow/v1" } : {}),
  });
  const targets = {
    local: { integrity: writes.flow.integrity },
    flow: target("flow", ["flow-structure"]),
    visualization: target("visualization", ["contract-integrity", "semantic-styles"]),
    specification: target("specification", ["contract-integrity"]),
    tokens: target("tokens", ["semantic-styles"]),
    component: target("component", ["contract-integrity"]),
  };
  const changeSet = await createFigmaChangeSet({
    binding, baseSnapshot, currentSnapshot, targets, createdAt: "2026-07-25T20:06:00Z",
  });
  return { root, paths, artifacts, writes, binding, baseSnapshot, currentSnapshot, targets, changeSet };
}

test("provider packages and canonical codecs are registered and executable", async () => {
  // `home` is pinned to a directory with no host config so the MCP-backed
  // transports resolve to absent rather than picking up whatever the machine
  // running the tests happens to have configured.
  const providers = await discoverProviders({ home: path.join(repositoryRoot, "fixtures/host/empty") });
  // Packages ship adapter code; the catalog entries are declarations the agent
  // calls directly. Both resolve, and `execution` is what tells them apart.
  assert.deepEqual(
    providers.filter(({ origin }) => origin === "shipped").map(({ id }) => id),
    [
      "figma-console-mcp",
      "figma-official-mcp",
      "silver-browser-local",
      "silver-portable",
    ],
  );
  assert.deepEqual(
    providers.filter(({ origin }) => origin === "catalog").map(({ id }) => id).sort(),
    [
      "agent-native-browser",
      "axe-core-cli",
      "canva-connect-api",
      "chromatic-cli",
      "chrome-devtools-mcp",
      "excalidraw-mcp",
      "figma-official-desktop-mcp",
      "lighthouse-cli",
      "miro-mcp",
      "playwright-mcp",
      "v0-api",
      "webflow-mcp",
    ],
  );
  assert.equal(
    providers.find(({ id }) => id === "chrome-devtools-mcp").execution,
    "agent",
  );
  assert.equal(
    providers.find(({ id }) => id === "silver-portable").execution,
    "silver",
  );
  assert.equal(providers.find(({ id }) => id === "silver-portable").available, true);
  const console_ = providers.find(({ id }) => id === "figma-console-mcp");
  assert.equal(console_.available, false);
  assert.equal(console_.availability_level, "absent");
  const codecs = await discoverArtifactCodecs(providers);
  assert.deepEqual(codecs.map(({ id }) => id).sort(), ["silver-dtcg", "silver-flow-graph", "silver-prose", "silver-structured"]);
  for (const { name: id } of (await readdir(path.join(repositoryRoot, "framework/skills"), { withFileTypes: true })).filter((entry) => entry.isDirectory())) {
    const contract = parse(await readFile(path.join(repositoryRoot, "framework/skills", id, "skill.yaml"), "utf8"));
    for (const output of contract.outputs) assert.ok(codecForArtifact(codecs, output.kind), `${id}:${output.kind}`);
  }
  const legacy = await readFile(path.join(repositoryRoot, "fixtures/blank-workspace/expected/design/brand.md"), "utf8");
  const decoded = decodePortable(legacy, "markdown-frontmatter");
  assert.equal(decoded.metadata.schema, "silver/artifact/v1");
  assert.equal(decodePortable(encodePortable(decoded, "markdown-frontmatter"), "markdown-frontmatter").metadata.id, "brand");
});

test("binding and user-profile contracts enforce authority, provenance, permissions, and secret-free configuration", async () => {
  const binding = {
    schema: "silver/representation-binding/v1",
    id: "example-figma",
    artifact: { id: "example-flow", kind: "flow", revision: "r1", path: "design/flows/example/flow.json" },
    view: { role: "external-view", format: "figma" },
    provider: { id: "figma-console-mcp", object_id: "file-1", revision: "v1" },
    adapter: { id: "silver-figma", version: "0.4.0" },
    mapping_profile: "product-web", authority: "external", authority_provider: "figma-console-mcp",
    round_trip: "partial", sync_policy: "notify",
    last_reconciled: {
      portable_revision: "r1", portable_integrity: `sha256:${"1".repeat(64)}`,
      external_revision: "v1", snapshot_integrity: `sha256:${"2".repeat(64)}`, at: fixedTime,
    },
  };
  await validateBinding(binding);
  await assert.rejects(validateBinding({ ...binding, authority_provider: "other" }), /must name the bound provider/);
  await assert.rejects(validateBinding({ ...binding, access_token: "figd_secret_value" }), /validation failed/);
  const profile = parse(await readFile(path.join(repositoryRoot, "fixtures/contracts/v2/valid/tool-profile.yaml"), "utf8"));
  await validateToolProfile(profile);
  profile.providers[0].configuration_reference = "Bearer secret-value";
  await assert.rejects(validateToolProfile(profile), /Secret-like value/);
  const resolved = resolvePermissions({
    layers: [
      { schema: "silver/permission-policy/v2", id: "user", layer: "user-ceiling", rules: [{ capability: "design-file", actions: ["write"], decision: "ask" }] },
      { schema: "silver/permission-policy/v2", id: "project", layer: "workspace-restriction", rules: [{ capability: "design-file", actions: ["write"], decision: "deny" }] },
    ],
    requests: [{ capability: "design-file", action: "write" }],
  });
  assert.equal(resolved.decisions[0].decision, "deny");
});

test("flow and system renderers produce portable semantic HTML with exact provenance", async (t) => {
  const root = await workspace(t);
  const source = { ...flow(), id: "catalog-flow", title: "Catalog flow" };
  const flowPath = "design/flows/catalog-flow/flow.json";
  await writeJson(root, flowPath, source);
  const rendered = await renderFlowFile(path.join(root, flowPath), path.join(root, "design/flows/catalog-flow/flow.mmd"));
  assert.match(await readFile(rendered.outputPath, "utf8"), /source=catalog-flow@r1 renderer=flow-mermaid@0.4.0/);
  const html = await readFile(rendered.htmlOutput, "utf8");
  for (const value of [
    'data-source-revision="r1"', 'data-renderer-version="flow-html@0.4.0"',
    'data-assets-revision="r1"', 'data-design-system-revision="r1"',
  ]) assert.ok(html.includes(value));
  await renderSystemCatalog({ root, replace: true });
  assert.match(await readFile(path.join(root, "design/system/showcase.html"), "utf8"), /system-catalog-html@0.4.0/);
  assert.equal((await runFastSuite({ root })).status, "pass");
});

test("real Figma adapter normalizes variables, styles, components, and nodes into separate semantic proposals without mutation", async (t) => {
  const fixture = await reconciliationFixture(t);
  await assertV2("external-snapshot.schema.json", fixture.currentSnapshot);
  await assertV2("change-set.schema.json", fixture.changeSet);
  assert.equal(fixture.currentSnapshot.revision, "v19");
  const classes = fixture.changeSet.changes.map(({ classification }) => classification);
  for (const value of ["presentation", "flow", "specification", "semantic-style", "unknown-style", "unknown-component"]) assert.ok(classes.includes(value), value);
  assert.ok(fixture.changeSet.changes.filter(({ classification }) => classification.startsWith("unknown")).every(({ operation, unresolved }) => operation === "finding" && unresolved.length));
  for (const key of Object.keys(fixture.paths)) {
    assert.equal(await readFile(path.join(fixture.root, fixture.paths[key]), "utf8"), fixture.writes[key].content);
  }
  await assert.rejects(normalizeFigmaSnapshot({ binding: fixture.binding, payload: { file: { id: "file-123", revision: "bad" } } }), /requires variables array/);
});

test("local-to-Figma plans are preview-only and writes require fresh revision, permission, and approval", async (t) => {
  const fixture = await reconciliationFixture(t);
  const operation = await previewSemanticTokenWrite({
    binding: fixture.binding,
    changes: [{ classification: "semantic-style", semantic_name: "surface.canvas", value: "{color.neutral.25}" }],
    permission: "ask", createdAt: fixedTime,
  });
  await assertV2("provider-operation.schema.json", operation);
  assert.equal(operation.status, "previewed");
  let writes = 0;
  const transport = { async writeVariables() { writes += 1; return { revision: "v19" }; } };
  await assert.rejects(applySemanticTokenWrite({ operation, currentRevision: "v18", transport }), /approval/);
  await assert.rejects(applySemanticTokenWrite({ operation, approval: { id: "approved-write" }, currentRevision: "v19", transport }), /stale/);
  assert.equal(writes, 0);
  const applied = await applySemanticTokenWrite({ operation, approval: { id: "approved-write" }, currentRevision: "v18", transport });
  assert.equal(applied.status, "applied");
  assert.equal(writes, 1);
});

test("accepted Figma visual changes revise only the visualization and prototype pins only accepted revisions", async (t) => {
  const fixture = await reconciliationFixture(t);
  const result = await proposeReconciliation({
    root: fixture.root, binding: fixture.binding,
    local: { revision: "r1", integrity: fixture.targets.local.integrity },
    external: { revision: "v19", integrity: valueIntegrity(fixture.currentSnapshot), completeness: "complete" },
    changeSet: fixture.changeSet, createdAt: fixedTime,
  });
  assert.equal(result.state, "external-changed");
  assert.equal(result.authority, "local");
  const visual = fixture.changeSet.changes.find(({ classification }) => classification === "presentation");
  const accepted = await acceptReconciliation({ root: fixture.root, result, operationIds: [visual.id], acceptedAt: fixedTime });
  const applied = await applyReconciliation({
    root: fixture.root, result: accepted,
    approvals: [{ operation_id: visual.id, approved: true }], appliedAt: fixedTime,
  });
  assert.equal(applied.status, "applied");
  assert.equal(JSON.parse(await readFile(path.join(fixture.root, fixture.paths.visualization), "utf8")).revision, "r2");
  assert.equal(JSON.parse(await readFile(path.join(fixture.root, fixture.paths.flow), "utf8")).revision, 1);
  assert.equal(JSON.parse(await readFile(path.join(fixture.root, fixture.paths.specification), "utf8")).revision, "r1");
  const prototypeRoot = path.join(fixture.root, "prototypes/guided-setup");
  await mkdir(prototypeRoot, { recursive: true });
  const metadata = `schema: silver/prototype/v1
id: guided-setup
title: "Guided setup"
status: active
constraint_profile: constrained
flow_refs:
  - id: guided-setup-flow
    path: "design/flows/guided-setup/flow.json"
    revision: 1
created: 2026-07-25
updated: 2026-07-25
extensions:
  silver.reconciliation:
    external_revision: v19
    accepted_artifacts:
      - guided-setup-visualization@r2
      - guided-setup-flow@r1
`;
  await writeFile(path.join(prototypeRoot, "prototype.yaml"), metadata, "utf8");
  await renderStaticPrototype({ root: fixture.root, prototype: "prototypes/guided-setup", flow: fixture.paths.flow });
  assert.match(metadata, /guided-setup-visualization@r2/);
  assert.match(metadata, /guided-setup-flow@r1/);
  assert.doesNotMatch(metadata, /guided-setup-flow@r2/);
});

test("divergence, stale proposals, partial extraction, and interruption preserve accepted work", async (t) => {
  const fixture = await reconciliationFixture(t);
  const localWrite = await writeJson(fixture.root, fixture.paths.flow, { ...flow(), revision: 2, title: "Locally revised flow" });
  const result = await proposeReconciliation({
    root: fixture.root, binding: fixture.binding,
    local: { revision: "r2", integrity: localWrite.integrity },
    external: { revision: "v19", integrity: valueIntegrity(fixture.currentSnapshot), completeness: "complete" },
    changeSet: fixture.changeSet, createdAt: fixedTime,
  });
  assert.equal(result.state, "diverged");
  assert.equal(result.status, "notify");
  assert.match(result.blockers.join(" "), /no winner/);
  await assert.rejects(applyReconciliation({ root: fixture.root, result }), /accepted before apply/);
  assert.equal(await readFile(path.join(fixture.root, fixture.paths.flow), "utf8"), localWrite.content);
  const visual = fixture.changeSet.changes.find(({ classification }) => classification === "presentation");
  const accepted = await acceptReconciliation({ root: fixture.root, result, operationIds: [visual.id], acceptedAt: fixedTime });
  const before = await readFile(path.join(fixture.root, fixture.paths.visualization), "utf8");
  await assert.rejects(
    applyReconciliation({ root: fixture.root, result: accepted, approvals: [{ operation_id: visual.id, approved: true }], failBeforeCommit: true }),
    /Simulated interruption/,
  );
  assert.equal(await readFile(path.join(fixture.root, fixture.paths.visualization), "utf8"), before);
  await writeFile(path.join(fixture.root, fixture.paths.visualization), `${before}\n`, "utf8");
  await assert.rejects(
    applyReconciliation({ root: fixture.root, result: accepted, approvals: [{ operation_id: visual.id, approved: true }] }),
    /Stale expected integrity/,
  );
  const partial = await normalizeFigmaSnapshot({
    binding: fixture.binding, payload: await json("fixtures/providers/figma/partial.json"), capturedAt: fixedTime,
  });
  const partialResult = await proposeReconciliation({
    root: fixture.root, binding: fixture.binding,
    local: { revision: "r2", integrity: localWrite.integrity },
    external: { revision: "v20", integrity: valueIntegrity(partial), completeness: "partial" },
    changeSet: { ...fixture.changeSet, id: "partial-changes", external: { revision: "v20", integrity: valueIntegrity(partial) }, changes: [] },
    createdAt: fixedTime,
  });
  assert.equal(partialResult.status, "notify");
  assert.match(partialResult.blockers.join(" "), /partial/);
});

test("authority reversal blocks externally authoritative freshness when unavailable and exposes skill blockers", async (t) => {
  const local = await reconciliationFixture(t, "local");
  const localResult = await proposeReconciliation({
    root: local.root, binding: local.binding,
    local: { revision: "r1", integrity: local.targets.local.integrity },
    external: { revision: "v19", integrity: valueIntegrity(local.currentSnapshot), completeness: "complete" },
    changeSet: local.changeSet, createdAt: fixedTime,
  });
  assert.equal(localResult.status, "awaiting-acceptance");
  const external = await reconciliationFixture(t, "external");
  const externalResult = await proposeReconciliation({
    root: external.root, binding: external.binding,
    local: { revision: "r1", integrity: external.targets.local.integrity },
    external: { revision: "v18", integrity: external.binding.last_reconciled.snapshot_integrity, completeness: "complete" },
    changeSet: external.changeSet, providerAvailable: false, createdAt: fixedTime,
  });
  assert.equal(externalResult.state, "unverified");
  await assert.rejects(
    acceptReconciliation({ root: external.root, result: externalResult, operationIds: [external.changeSet.changes[0].id] }),
    /cannot be applied/,
  );
  const request = {
    schema: "silver/skill-invocation/v2", invocation_id: "external-freshness",
    skill: { id: "design-check", version: "0.9.0" }, started_at: fixedTime,
    inputs: [], outputs: [],
    permission_layers: [{
      schema: "silver/permission-policy/v2", id: "fixture-policy", layer: "framework-default",
      rules: [{ capability: "repository", actions: ["read", "inspect"], decision: "allow", paths: ["design/**", ".silver/**"] }],
    }],
    available_providers: [],
    binding_states: [{ binding_id: external.binding.id, authority: "external", state: "unverified", freshness_sensitive_readiness: ["prototype"] }],
    approvals: [], relaxations: [], checks: [], unresolved_questions: [],
  };
  const result = await invokeSkill({
    root: external.root, skillDirectory: path.join(external.root, ".skills/design-check"), request, completedAt: fixedTime,
  });
  assert.deepEqual(result.freshness_blockers, [{ binding_id: external.binding.id, state: "unverified", blocks: ["prototype"] }]);
});

test("all seven synchronization states are deterministic", () => {
  const binding = { last_reconciled: {
    portable_revision: "r1", portable_integrity: `sha256:${"1".repeat(64)}`,
    external_revision: "v1", snapshot_integrity: `sha256:${"2".repeat(64)}`,
  } };
  const base = {
    binding,
    local: { revision: "r1", integrity: `sha256:${"1".repeat(64)}` },
    external: { revision: "v1", integrity: `sha256:${"2".repeat(64)}`, completeness: "complete" },
    changeSet: { changes: [] },
  };
  assert.equal(synchronizationState(base), "current");
  assert.equal(synchronizationState({ ...base, local: { ...base.local, revision: "r2" } }), "view-stale");
  assert.equal(synchronizationState({ ...base, external: { ...base.external, revision: "v2" } }), "external-changed");
  assert.equal(synchronizationState({ ...base, local: { ...base.local, revision: "r2" }, external: { ...base.external, revision: "v2" } }), "diverged");
  assert.equal(synchronizationState({ ...base, providerAvailable: false }), "unverified");
  assert.equal(synchronizationState({ ...base, changeSet: { changes: [{ classification: "unmapped", mapping_fidelity: "unmapped", proposal: { patch: [] } }] } }), "unmapped");
  assert.equal(synchronizationState({
    ...base,
    local: { ...base.local, revision: "r2" },
    external: { ...base.external, revision: "v2" },
    changeSet: { changes: [
      { classification: "content", mapping_fidelity: "semantic", proposal: { target_path: "a", patch: [{ path: "/title", value: "A" }] } },
      { classification: "content", mapping_fidelity: "semantic", proposal: { target_path: "a", patch: [{ path: "/title", value: "B" }] } },
    ] },
  }), "conflict");
});
