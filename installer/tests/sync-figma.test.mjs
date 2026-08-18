import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeFigmaSnapshot } from "../../framework/providers/figma-console-mcp/adapter.mjs";
import { contentIntegrity, valueIntegrity, writeBinding } from "../../framework/runtime/representations.mjs";
import { setupWorkspace } from "../setup.mjs";
import { applySynchronization, inspectSynchronization } from "../sync.mjs";

const when = "2026-08-17T12:00:00Z";

function payload(revision, variables = []) {
  return {
    file: { id: "file-public-sync", revision },
    variables,
    styles: [],
    components: [],
    selected_nodes: [],
    unresolved: [],
  };
}

test("public Figma sync imports captured changes and uses a two-pass external write", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-sync-figma-"));
  await setupWorkspace({ root, name: "Figma Sync", id: "figma-sync" });
  const artifactPath = "design/work/tokens/figma.json";
  const artifact = {
    schema: "silver/working-artifact/v2",
    id: "figma-tokens",
    kind: "token-source",
    revision: "r1",
    scope: "product",
    status: "accepted",
    title: "Figma tokens",
    created: when,
    updated: when,
    sources: [],
    payload: {},
  };
  await mkdir(path.join(root, "design/work/tokens"), { recursive: true });
  const artifactContent = `${JSON.stringify(artifact, null, 2)}\n`;
  await writeFile(path.join(root, artifactPath), artifactContent);
  const binding = {
    schema: "silver/representation-binding/v1",
    id: "public-figma",
    artifact: { id: artifact.id, kind: artifact.kind, revision: artifact.revision, path: artifactPath },
    view: { role: "external-view", format: "figma" },
    provider: { id: "figma-console-mcp", object_id: "file-public-sync", revision: "v1" },
    adapter: { id: "silver-figma", version: "0.4.0" },
    mapping_profile: "product-web",
    authority: "external",
    authority_provider: "figma-console-mcp",
    round_trip: "partial",
    sync_policy: "notify",
    last_reconciled: {
      portable_revision: "r1",
      portable_integrity: contentIntegrity(artifactContent),
      external_revision: "v1",
      snapshot_integrity: `sha256:${"0".repeat(64)}`,
      at: when,
    },
  };
  const base = await normalizeFigmaSnapshot({ binding, payload: payload("v1"), capturedAt: when });
  binding.last_reconciled.snapshot_integrity = valueIntegrity(base);
  await writeBinding({ root, binding });
  const changedPayload = payload("v2", [
    { id: "VariableID:1", name: "Surface/Canvas", semantic_name: "surface.canvas", values_by_mode: { light: "#ffffff" } },
  ]);
  const targets = {
    local: { integrity: contentIntegrity(artifactContent) },
    tokens: {
      id: artifact.id,
      kind: artifact.kind,
      revision: artifact.revision,
      path: artifactPath,
      integrity: contentIntegrity(artifactContent),
      checks: [],
    },
  };
  const inspected = await inspectSynchronization({
    root,
    bindingId: binding.id,
    direction: "external-to-local",
    capture: { payload: changedPayload, base_snapshot: base, targets },
    now: when,
  });
  const importSnapshot = JSON.parse(await readFile(
    path.join(root, inspected.proposal.adapter_payload.external_snapshot_path),
    "utf8",
  ));
  assert.equal(importSnapshot.schema, "silver/external-snapshot/v2");
  assert.equal(importSnapshot.payload.schema, "silver/external-snapshot/v1");
  const importOperation = inspected.proposal.operations.find(({ type }) => type === "update");
  const imported = await applySynchronization({
    root,
    input: inspected,
    only: [importOperation.id],
    now: when,
  });
  assert.equal(imported.status, "applied");
  assert.equal(
    JSON.parse(await readFile(path.join(root, artifactPath), "utf8")).payload.figma_variable_changes[0].semantic_name,
    "surface.canvas",
  );

  const exportInspection = await inspectSynchronization({
    root,
    bindingId: binding.id,
    direction: "local-to-external",
    capture: {
      payload: changedPayload,
      changes: [{ classification: "semantic-style", semantic_name: "surface.canvas", value: "#f8f8f8" }],
    },
    now: when,
  });
  const exportOperation = exportInspection.proposal.operations[0];
  const pending = await applySynchronization({
    root,
    input: exportInspection,
    only: [exportOperation.id],
    now: when,
  });
  assert.equal(pending.status, "external-action-required");
  assert.equal(pending.external_action.status, "external-action-required");
  assert.equal(pending.external_action.payload.status, "previewed");
  const completed = await applySynchronization({
    root,
    input: exportInspection,
    only: [exportOperation.id],
    externalResult: { status: "applied", revision: "v3" },
    capture: { payload: payload("v3", changedPayload.variables) },
    now: "2026-08-17T12:05:00Z",
  });
  assert.equal(completed.status, "applied");
  assert.equal(completed.binding_advancement.base.external.revision, "v3");
});
