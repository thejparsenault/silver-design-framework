import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { decodePortable } from "../artifact-codecs.mjs";
import {
  createWorkspaceMutator,
  workspaceContentIntegrity,
} from "../workspace-mutations.mjs";

export const REPOSITORY_ADAPTER = Object.freeze({
  schema: "silver/representation-adapter/v1",
  id: "silver-repository",
  version: "0.9.1",
  counterparts: ["linked-source"],
  formats: ["json", "yaml", "dtcg-json", "markdown-frontmatter", "text", "binary"],
  directions: ["external-to-local", "local-to-external"],
});

function sourceRoot(workspace, source) {
  return path.isAbsolute(source.source.reference)
    ? source.source.reference
    : path.resolve(workspace, source.source.reference);
}

async function readable(mutator, relativePath, revision) {
  await mutator.assertSafe(relativePath);
  try {
    const content = await readFile(mutator.absolute(relativePath));
    return {
      identity: {
        state: "present",
        revision,
        integrity: workspaceContentIntegrity(content),
      },
      content,
    };
  } catch (error) {
    if (error.code === "ENOENT") return { identity: { state: "missing" }, content: null };
    throw error;
  }
}

function utf8(buffer) {
  if (buffer === null) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

function structuralPaths(left, right, prefix = "") {
  if (Object.is(left, right)) return [];
  if (
    !left || !right ||
    typeof left !== "object" || typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return [prefix || "/"];
  }
  const keys = new Set([
    ...Object.keys(left),
    ...Object.keys(right),
  ]);
  return [...keys]
    .sort()
    .flatMap((key) => structuralPaths(left[key], right[key], `${prefix}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`));
}

function changed(identity, base) {
  if (!base) return true;
  if (base.state === "missing") return identity.state !== "missing";
  if (identity.state === "missing") return true;
  return identity.integrity !== base.integrity;
}

function stateFor(binding, local, external) {
  if (binding.base.state === "uninitialized") return "uninitialized";
  const localChanged = changed(local, binding.base.local);
  const externalChanged = changed(external, binding.base.external);
  if (localChanged && externalChanged) {
    if (local.state === external.state && local.integrity === external.integrity) return "current";
    return "conflict";
  }
  if (localChanged) return "local-changed";
  if (externalChanged) return "external-changed";
  return "current";
}

export async function inspectRepositoryBinding({ root, binding, source, direction, externalRevision }) {
  const workspace = path.resolve(root);
  const localMutator = await createWorkspaceMutator(workspace);
  const externalRoot = sourceRoot(workspace, source);
  const externalMutator = await createWorkspaceMutator(externalRoot);
  let local;
  const primarySystem = path.join(workspace, "design/system");
  let primarySystemIsLink = false;
  try { primarySystemIsLink = (await lstat(primarySystem)).isSymbolicLink(); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (
    primarySystemIsLink &&
    direction === "external-to-local" &&
    binding.artifact.path.startsWith("design/system/")
  ) {
    const linkedTarget = await realpath(primarySystem);
    if (linkedTarget !== externalMutator.root && !linkedTarget.startsWith(`${externalMutator.root}${path.sep}`)) {
      throw new Error("The linked source does not own the design/system symlink target.");
    }
    local = { identity: { state: "missing" }, content: null };
  } else {
    local = await readable(localMutator, binding.artifact.path, binding.artifact.revision);
  }
  const external = await readable(
    externalMutator,
    binding.counterpart.path,
    externalRevision ?? source.source.revision,
  );
  const state = stateFor(binding, local.identity, external.identity);
  const from = direction === "external-to-local" ? external : local;
  const to = direction === "external-to-local" ? local : external;
  const sourcePath = direction === "external-to-local"
    ? `${source.id}:${binding.counterpart.path}`
    : binding.artifact.path;
  const targetPath = direction === "external-to-local"
    ? binding.artifact.path
    : `${source.id}:${binding.counterpart.path}`;
  let operationType = "no-op";
  if (from.identity.state === "missing" && to.identity.state === "present") operationType = "delete";
  else if (from.identity.state === "present" && to.identity.state === "missing") operationType = "create";
  else if (
    from.identity.state === "present" &&
    to.identity.state === "present" &&
    from.identity.integrity !== to.identity.integrity
  ) operationType = "update";

  let classification = binding.counterpart.format === "text" ? "opaque-text" : "structural";
  let fidelity = binding.counterpart.format === "text" ? "opaque" : "exact";
  let content = utf8(from.content);
  let diff = [];
  const unresolved = [];
  if (binding.counterpart.format === "binary" || (from.content && content === null)) {
    classification = "unmapped";
    fidelity = "unmapped";
    operationType = "finding";
    unresolved.push("Binary or invalid UTF-8 data has no safe synchronization mapping.");
  } else if (
    from.content &&
    to.content &&
    ["json", "yaml", "dtcg-json", "markdown-frontmatter"].includes(binding.counterpart.format)
  ) {
    const fromValue = decodePortable(content, binding.counterpart.format);
    const toValue = decodePortable(utf8(to.content), binding.counterpart.format);
    diff = structuralPaths(toValue, fromValue);
  }
  if (state === "conflict" && operationType !== "no-op") {
    classification = "conflict";
    operationType = "finding";
    unresolved.push("Both representations changed after the shared base; no winner was selected.");
  }
  const operation = {
    id: `${binding.id}-${direction === "external-to-local" ? "import" : "export"}`,
    type: operationType,
    classification,
    mapping_fidelity: fidelity,
    source_path: sourcePath,
    target_path: targetPath,
    source_identity: from.identity,
    target_identity: to.identity,
    ...(content !== null && ["create", "update"].includes(operationType)
      ? { content, encoding: "utf8" }
      : {}),
    ...(diff.length ? { structural_diff: diff } : {}),
    required_approval: !["no-op", "finding"].includes(operationType),
    unresolved,
  };
  return {
    adapter: REPOSITORY_ADAPTER,
    state,
    local: local.identity,
    external: external.identity,
    operations: [operation],
    requiredChecks: direction === "local-to-external" ? source.writeback?.checks ?? [] : [],
    externalRoot,
  };
}
