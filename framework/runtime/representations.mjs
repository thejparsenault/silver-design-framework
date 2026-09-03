import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse, stringify } from "yaml";

import { assertV2 } from "./contracts.mjs";
import { createWorkspaceMutator } from "./workspace-mutations.mjs";

export function contentIntegrity(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function valueIntegrity(value) {
  return contentIntegrity(`${JSON.stringify(value, null, 2)}\n`);
}

export function assertNoSecrets(value, trail = []) {
  inspectSecrets(value, trail);
  return value;
}

function inspectSecrets(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectSecrets(item, [...trail, index]));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const location = [...trail, key].join(".");
    if (/(?:password|access[-_]?token|secret|credential|cookie|private[-_]?key|api[-_]?key)/i.test(key)) {
      throw new Error(`Secret-bearing field is prohibited in project configuration: ${location}`);
    }
    if (
      typeof nested === "string" &&
      /^(?:Bearer\s+|figd_[A-Za-z0-9_-]{12,}|gh[ps]_[A-Za-z0-9]{12,})/.test(nested)
    ) {
      throw new Error(`Secret-like value is prohibited in project configuration: ${location}`);
    }
    inspectSecrets(nested, [...trail, key]);
  }
}

export async function validateBinding(binding, options = {}) {
  if (binding?.schema !== "silver/representation-binding/v2") {
    throw new Error(
      "Live representation bindings must use silver/representation-binding/v2. Run silver migrate, then run silver sync inspect again.",
    );
  }
  await assertV2("representation-binding-v2.schema.json", binding, options);
  inspectSecrets(binding);
  if (binding.counterpart.type === "provider" && binding.counterpart.provider === "silver-portable") {
    throw new Error("An external counterpart cannot use the portable provider.");
  }
  return binding;
}

export async function validateToolProfile(profile, options = {}) {
  await assertV2("tool-profile.schema.json", profile, options);
  inspectSecrets(profile);
  return profile;
}

export async function readBinding({ root, path: relativePath, schemaRoot }) {
  const workspace = path.resolve(root);
  if (!relativePath?.startsWith("design/integrations/") || !relativePath.endsWith(".yaml")) {
    throw new Error("Bindings must live under design/integrations/<binding-id>.yaml.");
  }
  const absolute = path.resolve(workspace, relativePath);
  if (!absolute.startsWith(`${workspace}${path.sep}`)) throw new Error("Binding path escapes workspace.");
  const binding = parse(await readFile(absolute, "utf8"));
  await validateBinding(binding, schemaRoot ? { schemaRoot } : {});
  return binding;
}

export async function writeBinding({ root, binding, expectedIntegrity, schemaRoot }) {
  await validateBinding(binding, schemaRoot ? { schemaRoot } : {});
  const mutator = await createWorkspaceMutator(root);
  const workspace = mutator.root;
  const relativePath = `design/integrations/${binding.id}.yaml`;
  const absolute = path.join(workspace, relativePath);
  let previous;
  try {
    previous = await readFile(absolute, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (previous !== undefined) {
    if (!expectedIntegrity || contentIntegrity(previous) !== expectedIntegrity) {
      throw new Error("Binding write rejected because expected integrity is missing or stale.");
    }
  }
  const content = stringify(binding);
  if (previous === undefined) await mutator.create(relativePath, content);
  else await mutator.replace(relativePath, content, expectedIntegrity);
  return { path: relativePath, integrity: contentIntegrity(content) };
}

export function synchronizationState({
  binding,
  local,
  external,
  providerAvailable = true,
  changeSet,
}) {
  if (binding?.schema !== "silver/representation-binding/v2") {
    throw new Error("Synchronization state requires a v2 representation binding.");
  }
  if (!providerAvailable || !local?.state || !external?.state) return "unverified";
  if (binding.base.state === "uninitialized") return "uninitialized";
  if (
    external.completeness === "invalid" ||
    changeSet?.operations?.some(({ classification, mapping_fidelity: fidelity }) =>
      classification === "unmapped" || fidelity === "unmapped",
    )
  ) {
    return "unmapped";
  }
  const changed = (identity, base) => {
    if (identity.state !== base.state) return true;
    if (identity.state === "missing") return false;
    return identity.revision !== base.revision || identity.integrity !== base.integrity;
  };
  const localChanged = changed(local, binding.base.local);
  const externalChanged = changed(external, binding.base.external);
  if (localChanged && externalChanged) {
    if (local.state === external.state && (
      local.state === "missing" || local.integrity === external.integrity
    )) return "current";
    if (changeSet?.operations?.some(({ classification }) => classification === "conflict")) return "conflict";
    return "diverged";
  }
  if (localChanged) return "local-changed";
  if (externalChanged) return "external-changed";
  return "current";
}
