import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertV2 } from "./contracts.mjs";
import {
  contentIntegrity,
  synchronizationState,
  valueIntegrity,
  validateBinding,
} from "./representations.mjs";

function inside(root, relativePath) {
  const workspace = path.resolve(root);
  const absolute = path.resolve(workspace, relativePath);
  if (!absolute.startsWith(`${workspace}${path.sep}`)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  return absolute;
}

async function atomicWrite(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.silver-${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, filePath);
}

export async function persistReconciliationRecord({
  root,
  kind,
  id,
  value,
}) {
  if (!["snapshots", "change-sets", "results", "operations"].includes(kind)) {
    throw new Error(`Unsupported reconciliation record kind: ${kind}`);
  }
  const relativePath = `.silver/results/reconciliation/${kind}/${id}.json`;
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await atomicWrite(inside(root, relativePath), content);
  return { path: relativePath, integrity: contentIntegrity(content) };
}

export async function proposeReconciliation({
  root,
  binding,
  local,
  external,
  changeSet,
  providerAvailable = true,
  createdAt = new Date().toISOString(),
  schemaRoot,
}) {
  await validateBinding(binding, schemaRoot ? { schemaRoot } : {});
  await assertV2("change-set.schema.json", changeSet, schemaRoot ? { schemaRoot } : {});
  if (changeSet.binding_id !== binding.id) {
    throw new Error("Change set does not belong to the representation binding.");
  }
  if (
    changeSet.artifact.id !== binding.artifact.id ||
    changeSet.artifact.path !== binding.artifact.path
  ) {
    throw new Error("Change set artifact does not match the representation binding.");
  }
  const stored = await persistReconciliationRecord({
    root,
    kind: "change-sets",
    id: changeSet.id,
    value: changeSet,
  });
  const state = synchronizationState({
    binding,
    local,
    external,
    providerAvailable,
    changeSet,
  });
  const blockers = [];
  if (state === "unverified") blockers.push("Provider freshness could not be verified.");
  if (state === "unmapped") blockers.push("One or more changes have no portable semantic mapping.");
  if (["diverged", "conflict"].includes(state)) {
    blockers.push("Both sides changed after the shared base; no winner was selected.");
  }
  if (external.completeness === "partial") {
    blockers.push("External extraction is partial; unresolved data remains inspectable only.");
  }
  const result = {
    schema: "silver/reconciliation-result/v1",
    id: `${binding.id}-reconciliation`,
    binding_id: binding.id,
    authority: binding.authority,
    state,
    base: {
      revision: binding.last_reconciled.portable_revision,
      integrity: binding.last_reconciled.portable_integrity,
    },
    local: { revision: local.revision, integrity: local.integrity },
    external: { revision: external.revision, integrity: external.integrity },
    change_set_path: stored.path,
    change_set_integrity: stored.integrity,
    proposal_integrity: valueIntegrity({
      binding: binding.id,
      state,
      base: binding.last_reconciled,
      change_set_integrity: stored.integrity,
    }),
    status:
      blockers.length || ["current", "view-stale"].includes(state)
        ? "notify"
        : "awaiting-acceptance",
    accepted_operations: [],
    applied_operations: [],
    blockers,
    created_at: createdAt,
    updated_at: createdAt,
  };
  await assertV2("reconciliation-result.schema.json", result, schemaRoot ? { schemaRoot } : {});
  await persistReconciliationRecord({
    root,
    kind: "results",
    id: result.id,
    value: result,
  });
  return result;
}

export async function acceptReconciliation({
  root,
  result,
  operationIds,
  acceptedAt = new Date().toISOString(),
  schemaRoot,
}) {
  await assertV2("reconciliation-result.schema.json", result, schemaRoot ? { schemaRoot } : {});
  if (!["awaiting-acceptance", "notify"].includes(result.status)) {
    throw new Error(`Reconciliation cannot be accepted from ${result.status}.`);
  }
  if (["unverified", "unmapped", "conflict"].includes(result.state)) {
    throw new Error(`Reconciliation state ${result.state} cannot be applied.`);
  }
  const changeSetContent = await readFile(inside(root, result.change_set_path), "utf8");
  if (contentIntegrity(changeSetContent) !== result.change_set_integrity) {
    throw new Error("Reconciliation change set integrity is stale.");
  }
  const changeSet = JSON.parse(changeSetContent);
  const known = new Set(changeSet.changes.map(({ id }) => id));
  if (!operationIds.length || operationIds.some((id) => !known.has(id))) {
    throw new Error("Acceptance must name one or more known change operations.");
  }
  const accepted = {
    ...result,
    status: "accepted",
    accepted_operations: [...new Set(operationIds)].sort(),
    blockers: result.blockers.filter((item) => !item.startsWith("Both sides changed")),
    updated_at: acceptedAt,
  };
  await assertV2("reconciliation-result.schema.json", accepted, schemaRoot ? { schemaRoot } : {});
  await persistReconciliationRecord({ root, kind: "results", id: accepted.id, value: accepted });
  return accepted;
}

function decodePointer(pathValue) {
  return pathValue
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function applyPatch(document, patch) {
  const output = structuredClone(document);
  for (const operation of patch) {
    const parts = decodePointer(operation.path);
    const key = parts.pop();
    let parent = output;
    for (const part of parts) {
      if (parent[part] === undefined && operation.op === "add") parent[part] = {};
      parent = parent[part];
      if (!parent || typeof parent !== "object") throw new Error(`Invalid patch path ${operation.path}.`);
    }
    if (operation.op === "remove") delete parent[key];
    else parent[key] = structuredClone(operation.value);
  }
  return output;
}

function validatePortableArtifact(value) {
  if (!value || typeof value !== "object" || !value.schema || !value.id) {
    throw new Error("Reconciled portable artifact is structurally invalid.");
  }
  if (value.schema === "silver/working-artifact/v2") {
    for (const field of ["kind", "revision", "payload"]) {
      if (value[field] === undefined) throw new Error(`Working artifact is missing ${field}.`);
    }
  }
  if (value.schema === "silver/flow/v1") {
    if (!Array.isArray(value.nodes) || !Array.isArray(value.transitions) || !Number.isInteger(value.revision)) {
      throw new Error("Reconciled flow is invalid.");
    }
  }
}

export async function applyReconciliation({
  root,
  result,
  approvals = [],
  failBeforeCommit = false,
  appliedAt = new Date().toISOString(),
  schemaRoot,
}) {
  await assertV2("reconciliation-result.schema.json", result, schemaRoot ? { schemaRoot } : {});
  if (result.status !== "accepted") throw new Error("Reconciliation must be accepted before apply.");
  const resultPath = `.silver/results/reconciliation/results/${result.id}.json`;
  const persistedResult = JSON.parse(await readFile(inside(root, resultPath), "utf8"));
  if (persistedResult.proposal_integrity !== result.proposal_integrity) {
    throw new Error("Reconciliation proposal integrity is stale.");
  }
  const changeSetContent = await readFile(inside(root, result.change_set_path), "utf8");
  if (contentIntegrity(changeSetContent) !== result.change_set_integrity) {
    throw new Error("Reconciliation change set changed after acceptance.");
  }
  const changeSet = JSON.parse(changeSetContent);
  const selected = changeSet.changes.filter(({ id }) => result.accepted_operations.includes(id));
  const prepared = new Map();
  for (const change of selected) {
    if (change.operation === "finding" || change.operation === "no-op") {
      throw new Error(`Operation ${change.id} has no applicable mutation.`);
    }
    if (
      change.required_approval &&
      !approvals.some(({ operation_id: operationId, approved }) =>
        operationId === change.id && approved === true,
      )
    ) {
      throw new Error(`Operation ${change.id} requires explicit approval.`);
    }
    const absolute = inside(root, change.proposal.target_path);
    const content = prepared.get(absolute)?.original ?? await readFile(absolute, "utf8");
    if (contentIntegrity(content) !== change.proposal.expected_integrity) {
      throw new Error(`Stale expected integrity for ${change.proposal.target_path}.`);
    }
    const current = prepared.has(absolute)
      ? prepared.get(absolute).value
      : JSON.parse(content);
    const next = applyPatch(current, change.proposal.patch);
    validatePortableArtifact(next);
    prepared.set(absolute, { original: content, value: next });
  }
  if (failBeforeCommit) throw new Error("Simulated interruption before atomic commit.");
  const staged = [];
  try {
    for (const [absolute, record] of prepared) {
      const temporary = `${absolute}.silver-${process.pid}.stage`;
      await writeFile(temporary, `${JSON.stringify(record.value, null, 2)}\n`, "utf8");
      staged.push({ absolute, temporary, original: record.original });
    }
    for (const item of staged) await rename(item.temporary, item.absolute);
  } catch (error) {
    for (const item of staged) {
      try {
        await atomicWrite(item.absolute, item.original);
      } catch {}
    }
    throw error;
  }
  const applied = {
    ...result,
    status: "applied",
    applied_operations: selected.map(({ id }) => id).sort(),
    blockers: [],
    updated_at: appliedAt,
  };
  await assertV2("reconciliation-result.schema.json", applied, schemaRoot ? { schemaRoot } : {});
  await persistReconciliationRecord({ root, kind: "results", id: applied.id, value: applied });
  return applied;
}
