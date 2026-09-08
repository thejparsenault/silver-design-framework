import { readFile } from "node:fs/promises";
import path from "node:path";

import { contentIntegrity } from "./representations.mjs";

function inside(root, relativePath) {
  const workspace = path.resolve(root);
  const absolute = path.resolve(workspace, relativePath);
  if (!absolute.startsWith(`${workspace}${path.sep}`)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  return absolute;
}

function decodePointer(pathValue) {
  return pathValue
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
}

export function applyPatch(document, patch) {
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

export function validatePortableArtifact(value) {
  if (!value || typeof value !== "object" || !value.schema || !value.id) {
    throw new Error("Reconciled portable artifact is structurally invalid.");
  }
  if (value.schema === "silver/working-artifact/v2") {
    for (const field of ["kind", "revision", "payload"]) {
      if (value[field] === undefined) throw new Error(`Working artifact is missing ${field}.`);
    }
  }
  if (value.schema === "silver/flow/v1") {
    if (!Array.isArray(value.nodes) || !Array.isArray(value.transitions) || typeof value.revision !== "string") {
      throw new Error("Reconciled flow is invalid.");
    }
  }
}

// Adapter-specific patches remain inspectable in changeSet.adapter_payload,
// while the selected operations and all freshness identities use the v2
// portable contract. The installer synchronization coordinator is the only
// lifecycle owner; this helper only prepares validated local file contents.
export async function preparePortableReconciliation({
  root,
  changeSet,
  operationIds,
  approvals = [],
}) {
  if (changeSet?.schema !== "silver/change-set/v2") {
    throw new Error("Portable reconciliation requires a v2 change set; migrate and inspect again.");
  }
  const selected = changeSet.operations.filter(({ id }) => operationIds.includes(id));
  const prepared = new Map();
  for (const operation of selected) {
    if (["finding", "no-op"].includes(operation.type)) {
      throw new Error(`Operation ${operation.id} has no applicable mutation.`);
    }
    if (
      operation.required_approval &&
      !approvals.some(({ operation_id: operationId, approved }) =>
        operationId === operation.id && approved === true,
      )
    ) {
      throw new Error(`Operation ${operation.id} requires explicit approval.`);
    }
    const absolute = inside(root, operation.target_path);
    const content = prepared.get(absolute)?.original ?? await readFile(absolute, "utf8");
    if (operation.target_identity.state !== "present" || contentIntegrity(content) !== operation.target_identity.integrity) {
      throw new Error(`Stale expected integrity for ${operation.target_path}.`);
    }
    const current = prepared.has(absolute)
      ? prepared.get(absolute).value
      : JSON.parse(content);
    const patch = changeSet.adapter_payload?.patches?.[operation.id];
    if (!Array.isArray(patch)) throw new Error(`Operation ${operation.id} has no adapter patch payload.`);
    const next = applyPatch(current, patch);
    validatePortableArtifact(next);
    prepared.set(absolute, {
      path: operation.target_path,
      original: content,
      value: next,
      operationIds: [...(prepared.get(absolute)?.operationIds ?? []), operation.id],
    });
  }
  return {
    selected,
    files: [...prepared.values()].map((record) => ({
      path: record.path,
      content: `${JSON.stringify(record.value, null, 2)}\n`,
      expectedIntegrity: contentIntegrity(record.original),
      operationIds: record.operationIds,
    })),
  };
}
