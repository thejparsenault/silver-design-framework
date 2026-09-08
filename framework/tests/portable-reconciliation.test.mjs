import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { preparePortableReconciliation } from "../runtime/reconciliation.mjs";
import {
  contentIntegrity,
  synchronizationState,
  validateBinding,
  writeBinding,
} from "../runtime/representations.mjs";

const when = "2026-08-23T12:00:00Z";
const zero = `sha256:${"0".repeat(64)}`;

function binding(base = {
  state: "initialized",
  local: { state: "present", revision: "r1", integrity: zero },
  external: { state: "present", revision: "v1", integrity: zero },
  at: when,
}) {
  return {
    schema: "silver/representation-binding/v2",
    id: "figma-tokens",
    artifact: { id: "tokens", kind: "token-source", revision: "r1", path: "design/work/tokens.json" },
    counterpart: { type: "provider", provider: "figma-console-mcp", object_id: "file-1", revision: "v1" },
    adapter: { id: "silver-figma", version: "0.10.0" },
    authority: "shared-review",
    round_trip: "partial",
    sync_policy: "notify",
    base,
  };
}

test("live binding runtime accepts v2 and rejects v1 with migration guidance", async () => {
  await validateBinding(binding());
  await assert.rejects(
    validateBinding({ schema: "silver/representation-binding/v1" }),
    /silver migrate.*silver sync inspect/,
  );
});

test("v2 binding writes require fresh expected integrity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-v2-binding-"));
  await mkdir(path.join(root, "design/integrations"), { recursive: true });
  const first = await writeBinding({ root, binding: binding() });
  const next = { ...binding(), sync_policy: "propose" };
  await assert.rejects(writeBinding({ root, binding: next }), /expected integrity/);
  await writeBinding({ root, binding: next, expectedIntegrity: first.integrity });
});

test("v2 synchronization states cover uninitialized, missing, drift, divergence, and mapping", () => {
  const currentBinding = binding();
  const local = { state: "present", revision: "r1", integrity: zero };
  const external = { state: "present", revision: "v1", integrity: zero };
  assert.equal(synchronizationState({ binding: binding({ state: "uninitialized" }), local, external }), "uninitialized");
  assert.equal(synchronizationState({ binding: currentBinding, local, external }), "current");
  assert.equal(synchronizationState({ binding: currentBinding, local: { ...local, revision: "r2" }, external }), "local-changed");
  assert.equal(synchronizationState({ binding: currentBinding, local, external: { ...external, revision: "v2" } }), "external-changed");
  assert.equal(synchronizationState({
    binding: currentBinding,
    local: { ...local, revision: "r2", integrity: `sha256:${"1".repeat(64)}` },
    external: { ...external, revision: "v2", integrity: `sha256:${"2".repeat(64)}` },
  }), "diverged");
  assert.equal(synchronizationState({ binding: currentBinding, local, external, providerAvailable: false }), "unverified");
  assert.equal(synchronizationState({
    binding: currentBinding,
    local,
    external,
    changeSet: { operations: [{ classification: "unmapped", mapping_fidelity: "unmapped" }] },
  }), "unmapped");
  const missingBinding = binding({ state: "initialized", local: { state: "missing" }, external: { state: "missing" }, at: when });
  assert.equal(synchronizationState({ binding: missingBinding, local: { state: "missing" }, external: { state: "missing" } }), "current");
});

test("portable preparation composes selected v2 adapter patches", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-v2-prepare-"));
  const relative = "design/work/tokens.json";
  await mkdir(path.join(root, "design/work"), { recursive: true });
  const original = `${JSON.stringify({ schema: "silver/working-artifact/v2", id: "tokens", kind: "token-source", revision: "r1", payload: {} }, null, 2)}\n`;
  await writeFile(path.join(root, relative), original);
  const identity = { state: "present", revision: "r1", integrity: contentIntegrity(original) };
  const operation = (id) => ({
    id,
    type: "update",
    classification: "semantic-style",
    mapping_fidelity: "semantic",
    source_path: `figma:${id}`,
    target_path: relative,
    source_identity: { state: "present", revision: "v2", integrity: zero },
    target_identity: identity,
    required_approval: true,
    unresolved: [],
  });
  const changeSet = {
    schema: "silver/change-set/v2",
    operations: [operation("one"), operation("two")],
    adapter_payload: { patches: {
      one: [{ op: "add", path: "/payload/one", value: true }],
      two: [{ op: "add", path: "/payload/two", value: true }],
    } },
  };
  const prepared = await preparePortableReconciliation({
    root,
    changeSet,
    operationIds: ["one", "two"],
    approvals: [{ operation_id: "one", approved: true }, { operation_id: "two", approved: true }],
  });
  assert.equal(prepared.files.length, 1);
  assert.deepEqual(JSON.parse(prepared.files[0].content).payload, { one: true, two: true });
});
