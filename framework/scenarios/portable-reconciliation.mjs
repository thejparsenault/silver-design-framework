#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFigmaChangeSet,
  normalizeFigmaSnapshot,
  previewSemanticTokenWrite,
} from "../providers/figma/adapter.mjs";
import {
  acceptReconciliation,
  applyReconciliation,
  persistReconciliationRecord,
  proposeReconciliation,
} from "../runtime/reconciliation.mjs";
import {
  contentIntegrity,
  valueIntegrity,
  writeBinding,
} from "../runtime/representations.mjs";
import { renderStaticPrototype } from "../skills/prototype/scripts/render-static-prototype.mjs";
import { renderFlowFile } from "../skills/flow/scripts/render-flow.mjs";

const time = "2026-07-25T21:00:00Z";
const basePayload = {
  file: { id: "file-123", revision: "v18" },
  variables: [{ id: "V:1", name: "Surface/Canvas", semantic_name: "surface.canvas", resolved_type: "COLOR", values_by_mode: { light: "#ffffff" } }],
  styles: [{ id: "S:1", name: "Text/Primary", semantic_name: "text.primary", style_type: "FILL", value: "#161616" }],
  components: [{ id: "C:1", name: "Button", semantic_name: "button", properties: { variant: ["primary"] } }],
  selected_nodes: [{ id: "N:1", name: "Review", type: "FRAME", layout: { direction: "vertical" }, styles: { fill: "surface.canvas" }, interactions: [{ trigger: "click", target: "N:2" }] }],
  unresolved: [],
};
const changedPayload = {
  file: { id: "file-123", revision: "v19" },
  variables: [
    { id: "V:1", name: "Surface/Canvas", semantic_name: "surface.canvas", resolved_type: "COLOR", values_by_mode: { light: "#f7f7f7" } },
    { id: "V:2", name: "Experiment/Purple", resolved_type: "COLOR", values_by_mode: { light: "#6f42c1" } },
  ],
  styles: [{ id: "S:1", name: "Text/Primary", semantic_name: "text.primary", style_type: "FILL", value: "#222222" }],
  components: [{ id: "C:1", name: "Button", semantic_name: "button", properties: { variant: ["primary"] } }],
  selected_nodes: [{ id: "N:1", name: "Review", type: "FRAME", layout: { direction: "horizontal" }, styles: { fill: "surface.canvas" }, interactions: [{ trigger: "click", target: "N:3" }] }],
  unresolved: [],
};

const flow = {
  schema: "silver/flow/v1", id: "guided-flow", title: "Guided flow",
  kind: "user-flow", scope: "product", status: "active", revision: 1,
  purpose: "Review before completion.", actors: [{ id: "owner", name: "Owner" }],
  desired_outcomes: ["Complete intentionally"], start_nodes: ["review"],
  nodes: [{ id: "review", type: "screen", title: "Review" }, { id: "complete", type: "outcome", title: "Complete" }],
  transitions: [{ id: "finish", from: "review", to: "complete", trigger: "Finish" }],
  created: "2026-07-25", updated: "2026-07-25",
};

function working(id, kind, payload) {
  return {
    schema: "silver/working-artifact/v2", id, kind, revision: "r1",
    scope: "product", status: "accepted", title: id,
    created: time, updated: time, sources: [], payload,
  };
}

async function put(root, relative, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), content, "utf8");
  return { content, integrity: contentIntegrity(content) };
}

export async function runPortableReconciliationScenario({ root }) {
  const workspace = path.resolve(root);
  const paths = {
    flow: "design/flows/guided/flow.json",
    sketch: "design/work/sketches/guided/sketch.json",
    specification: "design/work/specifications/guided.json",
    tokens: "design/work/tokens/guided.json",
    component: "design/work/components/guided.json",
  };
  const artifacts = {
    flow,
    sketch: working("guided-sketch", "sketch", { fidelity: "low", constraint_profile: "constrained", question: "Clear?", view_path: "design/work/sketches/guided/index.html", alternatives: [{ title: "A", summary: "A", tradeoff: "A" }, { title: "B", summary: "B", tradeoff: "B" }] }),
    specification: working("guided-specification", "design-specification", { requirements: ["Review"], states: ["ready", "complete"] }),
    tokens: working("guided-tokens", "token-source", { format: "dtcg", semantic_tokens: { "surface.canvas": "{color.neutral.0}" } }),
    component: working("guided-component", "component-proposal", { classification: "product-composition", anatomy: ["Summary", "Action"] }),
  };
  const writes = {};
  for (const key of Object.keys(paths)) writes[key] = await put(workspace, paths[key], artifacts[key]);
  const flowView = await renderFlowFile(
    path.join(workspace, paths.flow),
    path.join(workspace, "design/flows/guided/flow.mmd"),
  );
  const flowHtml = await readFile(flowView.htmlOutput, "utf8");
  const localBinding = {
    schema: "silver/representation-binding/v1",
    id: "guided-flow-html",
    artifact: { id: "guided-flow", kind: "flow", revision: "r1", path: paths.flow },
    view: { role: "local-view", format: "html", path: "design/flows/guided/index.html", revision: "0.3.0" },
    provider: { id: "silver-portable", object_id: "design/flows/guided/index.html", revision: "0.3.0" },
    adapter: { id: "flow-html", version: "0.3.0" },
    mapping_profile: "product-web", authority: "local", round_trip: "read-only", sync_policy: "notify",
    last_reconciled: {
      portable_revision: "r1", portable_integrity: writes.flow.integrity,
      external_revision: "0.3.0", snapshot_integrity: contentIntegrity(flowHtml), at: time,
    },
  };
  await writeBinding({ root: workspace, binding: localBinding });
  const binding = {
    schema: "silver/representation-binding/v1",
    id: "guided-figma",
    artifact: { id: "guided-flow", kind: "flow", revision: "r1", path: paths.flow },
    view: { role: "external-view", format: "figma" },
    provider: { id: "figma", object_id: "file-123", revision: "v18" },
    adapter: { id: "silver-figma", version: "0.3.0" },
    mapping_profile: "product-web", authority: "local", round_trip: "partial", sync_policy: "notify",
    last_reconciled: {
      portable_revision: "r1", portable_integrity: writes.flow.integrity,
      external_revision: "v18", snapshot_integrity: `sha256:${"0".repeat(64)}`, at: time,
    },
  };
  const base = await normalizeFigmaSnapshot({ binding, payload: basePayload, capturedAt: time });
  binding.last_reconciled.snapshot_integrity = valueIntegrity(base);
  await writeBinding({ root: workspace, binding });
  const current = await normalizeFigmaSnapshot({ binding, payload: changedPayload, capturedAt: time });
  await persistReconciliationRecord({ root: workspace, kind: "snapshots", id: "guided-figma-base", value: base });
  await persistReconciliationRecord({ root: workspace, kind: "snapshots", id: "guided-figma-current", value: current });
  const target = (key, checks = []) => ({
    id: artifacts[key].id, kind: key === "flow" ? "flow" : artifacts[key].kind,
    revision: "r1", path: paths[key], integrity: writes[key].integrity, checks,
    ...(key === "flow" ? { schema: "silver/flow/v1" } : {}),
  });
  const targets = {
    local: { integrity: writes.flow.integrity },
    flow: target("flow", ["flow-structure"]), sketch: target("sketch", ["semantic-styles"]),
    specification: target("specification"), tokens: target("tokens", ["semantic-styles"]),
    component: target("component"),
  };
  const changes = await createFigmaChangeSet({ binding, baseSnapshot: base, currentSnapshot: current, targets, createdAt: time });
  const preview = await previewSemanticTokenWrite({
    binding,
    changes: [{ classification: "semantic-style", semantic_name: "surface.canvas", value: "{color.neutral.25}" }],
    permission: "ask", createdAt: time,
  });
  await persistReconciliationRecord({ root: workspace, kind: "operations", id: preview.id, value: preview });
  const proposed = await proposeReconciliation({
    root: workspace, binding,
    local: { revision: "r1", integrity: writes.flow.integrity },
    external: { revision: "v19", integrity: valueIntegrity(current), completeness: "complete" },
    changeSet: changes, createdAt: time,
  });
  const visual = changes.changes.find(({ classification }) => classification === "presentation");
  const accepted = await acceptReconciliation({ root: workspace, result: proposed, operationIds: [visual.id], acceptedAt: time });
  const applied = await applyReconciliation({
    root: workspace, result: accepted,
    approvals: [{ operation_id: visual.id, approved: true }], appliedAt: time,
  });
  assert.equal(JSON.parse(await readFile(path.join(workspace, paths.sketch), "utf8")).revision, "r2");
  assert.equal(JSON.parse(await readFile(path.join(workspace, paths.flow), "utf8")).revision, 1);
  const prototypeRoot = path.join(workspace, "prototypes/guided");
  await mkdir(prototypeRoot, { recursive: true });
  await writeFile(path.join(prototypeRoot, "prototype.yaml"), `schema: silver/prototype/v1
id: guided
title: "Guided"
status: active
constraint_profile: constrained
flow_refs:
  - id: guided-flow
    path: "design/flows/guided/flow.json"
    revision: 1
created: 2026-07-25
updated: 2026-07-25
extensions:
  silver.reconciliation:
    external_revision: v19
    accepted_artifacts:
      - guided-sketch@r2
      - guided-flow@r1
`, "utf8");
  await renderStaticPrototype({ root: workspace, prototype: "prototypes/guided", flow: paths.flow });
  const localFlow = { ...flow, revision: 2, title: "Local change" };
  const localWrite = await put(workspace, paths.flow, localFlow);
  const diverged = await proposeReconciliation({
    root: workspace, binding,
    local: { revision: "r2", integrity: localWrite.integrity },
    external: { revision: "v19", integrity: valueIntegrity(current), completeness: "complete" },
    changeSet: changes, createdAt: time,
  });
  const externalAuthority = { ...binding, authority: "external", authority_provider: "figma" };
  const unavailable = await proposeReconciliation({
    root: workspace, binding: externalAuthority,
    local: { revision: "r2", integrity: localWrite.integrity },
    external: { revision: "v18", integrity: binding.last_reconciled.snapshot_integrity, completeness: "complete" },
    changeSet: changes, providerAvailable: false, createdAt: time,
  });
  return {
    schema: "silver/portable-reconciliation-scenario/v1",
    status: "pass",
    provider_operation: preview.status,
    provider_operation_expected_revision: preview.expected_external_revision,
    bindings: [localBinding.id, binding.id],
    local_authority: proposed.state,
    applied: applied.status,
    behavioral_proposals: changes.changes.filter(({ classification }) => ["flow", "specification"].includes(classification)).map(({ classification }) => classification).sort(),
    unknown_findings: changes.changes.filter(({ operation }) => operation === "finding").length,
    divergence: diverged.state,
    external_authority_unavailable: unavailable.state,
    prototype: "prototypes/guided/index.html",
  };
}

async function main() {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex >= 0 ? process.argv[rootIndex + 1] : process.cwd();
  try {
    console.log(JSON.stringify(await runPortableReconciliationScenario({ root }), null, 2));
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await main();
