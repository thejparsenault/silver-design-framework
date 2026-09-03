import { createHash } from "node:crypto";

import { assertV2 } from "../../runtime/contracts.mjs";
import { firstModeValue, isAlias, resolveReferenceToVariableId } from "./tokens.mjs";

export const FIGMA_ADAPTER = { id: "silver-figma", version: "0.9.2" };

const digest = (value) =>
  `sha256:${createHash("sha256").update(`${JSON.stringify(value, null, 2)}\\n`).digest("hex")}`;

function requiredArray(input, key) {
  if (!Array.isArray(input[key])) throw new Error(`Figma payload requires ${key} array.`);
  return input[key];
}

function entity(item, semanticType) {
  if (!item?.id || !item?.name) throw new Error(`Figma ${semanticType} requires id and name.`);
  return {
    id: String(item.id),
    name: String(item.name),
    semantic_type: semanticType,
    ...(item.semantic_name || item.semanticName
      ? { semantic_name: item.semantic_name ?? item.semanticName }
      : {}),
    data: Object.fromEntries(
      Object.entries(item)
        .filter(([key]) => !["id", "name", "semantic_name", "semanticName"].includes(key))
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

export async function normalizeFigmaSnapshot({
  binding,
  payload,
  capturedAt = new Date().toISOString(),
  schemaRoot,
}) {
  if (!payload?.file?.id || !payload.file.revision) {
    throw new Error("Figma payload requires file.id and file.revision.");
  }
  if (binding?.schema !== "silver/representation-binding/v2" || binding.counterpart?.type !== "provider") {
    throw new Error("Figma capture requires a v2 provider representation binding.");
  }
  if (payload.file.id !== binding.counterpart.object_id) {
    throw new Error("Figma payload object does not match the binding.");
  }
  const variables = requiredArray(payload, "variables").map((item) => entity(item, "variable"));
  const styles = requiredArray(payload, "styles").map((item) => entity(item, "style"));
  const components = requiredArray(payload, "components").map((item) => entity(item, "component"));
  const nodes = requiredArray(payload, "selected_nodes").map((item) => entity(item, "design-node"));
  for (const values of [variables, styles, components, nodes]) {
    values.sort((left, right) => left.id.localeCompare(right.id));
  }
  const unresolved = (payload.unresolved ?? []).map((item) => ({
    provider_path: String(item.provider_path),
    reason: String(item.reason),
    ...(item.raw_type ? { raw_type: String(item.raw_type) } : {}),
  }));
  const snapshot = {
    schema: "silver/external-snapshot/v1",
    id: `${binding.id}-snapshot`,
    provider: "figma",
    object_id: payload.file.id,
    revision: String(payload.file.revision),
    captured_at: capturedAt,
    adapter: FIGMA_ADAPTER,
    binding_id: binding.id,
    completeness: unresolved.length ? "partial" : "complete",
    variables,
    styles,
    components,
    nodes,
    unresolved,
  };
  await assertV2("external-snapshot.schema.json", snapshot, schemaRoot ? { schemaRoot } : {});
  return snapshot;
}

function changedEntities(base, current, key) {
  const previous = new Map((base?.[key] ?? []).map((item) => [item.id, item]));
  return current[key].filter((item) => digest(item) !== digest(previous.get(item.id)));
}

function patchFor(target, payloadKey, value) {
  const nextRevision = /^r([1-9][0-9]*)$/.exec(target.revision);
  return [
    {
      op: "add",
      path: `/payload/${payloadKey}`,
      value,
    },
    ...(nextRevision
      ? [{ op: "replace", path: "/revision", value: `r${Number(nextRevision[1]) + 1}` }]
      : []),
  ];
}

function proposal(target, patch) {
  return {
    target_path: target.path,
    expected_integrity: target.integrity,
    patch,
  };
}

function change({
  id,
  entity: providerEntity,
  target,
  classification,
  valueKind,
  operation = "propose-update",
  confidence,
  fidelity,
  unresolved = [],
  patch = [],
}) {
  return {
    id,
    provider_entity: providerEntity.id,
    artifact_kind: target.kind,
    artifact_id: target.id,
    classification,
    ...(valueKind ? { value_kind: valueKind } : {}),
    operation,
    confidence,
    mapping_fidelity: fidelity,
    dependencies: target.dependencies ?? [],
    unresolved,
    required_checks: target.checks ?? ["contract-integrity"],
    required_approval: operation !== "finding" && operation !== "no-op",
    proposal: proposal(target, patch),
  };
}

export async function createFigmaChangeSet({
  binding,
  baseSnapshot,
  currentSnapshot,
  targets,
  bindingIntegrity,
  direction = "external-to-local",
  createdAt = new Date().toISOString(),
  schemaRoot,
}) {
  const changes = [];
  for (const variable of changedEntities(baseSnapshot, currentSnapshot, "variables")) {
    const known = Boolean(variable.semantic_name);
    changes.push(change({
      id: `variable-${variable.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`.replace(/-+$/, ""),
      entity: variable,
      target: targets.tokens,
      classification: known ? "semantic-style" : "unknown-style",
      valueKind: isAlias(firstModeValue(variable)) ? "alias" : "literal",
      operation: known ? "propose-update" : "finding",
      confidence: known ? 0.98 : 0.45,
      fidelity: known ? "semantic" : "partial",
      unresolved: known ? [] : ["Variable has no approved semantic token mapping."],
      patch: known ? patchFor(targets.tokens, "figma_variable_changes", [variable]) : [],
    }));
  }
  for (const style of changedEntities(baseSnapshot, currentSnapshot, "styles")) {
    changes.push(change({
      id: `style-${style.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`.replace(/-+$/, ""),
      entity: style,
      target: targets.tokens,
      classification: style.semantic_name ? "semantic-style" : "unknown-style",
      operation: style.semantic_name ? "propose-update" : "finding",
      confidence: style.semantic_name ? 0.95 : 0.4,
      fidelity: style.semantic_name ? "semantic" : "partial",
      unresolved: style.semantic_name ? [] : ["Style has no approved semantic mapping."],
      patch: style.semantic_name ? patchFor(targets.tokens, "figma_style_changes", [style]) : [],
    }));
  }
  for (const component of changedEntities(baseSnapshot, currentSnapshot, "components")) {
    const target = targets.component;
    changes.push(change({
      id: `component-${component.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`.replace(/-+$/, ""),
      entity: component,
      target,
      classification: component.semantic_name ? "component" : "unknown-component",
      operation: component.semantic_name ? "propose-update" : "finding",
      confidence: component.semantic_name ? 0.9 : 0.4,
      fidelity: component.semantic_name ? "semantic" : "partial",
      unresolved: component.semantic_name ? [] : ["Component has no approved catalog mapping."],
      patch: component.semantic_name ? patchFor(target, "figma_component_changes", [component]) : [],
    }));
  }
  for (const node of changedEntities(baseSnapshot, currentSnapshot, "nodes")) {
    const data = node.data ?? {};
    const visualKeys = ["layout", "styles", "geometry", "text"];
    if (visualKeys.some((key) => key in data)) {
      changes.push(change({
        id: `visual-${node.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`.replace(/-+$/, ""),
        entity: node,
        target: targets.visualization,
        classification: "presentation",
        confidence: 0.92,
        fidelity: "semantic",
        patch: patchFor(targets.visualization, "figma_visual_changes", [node]),
      }));
    }
    if ("interactions" in data) {
      changes.push(change({
        id: `flow-${node.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`.replace(/-+$/, ""),
        entity: node,
        target: targets.flow,
        classification: "flow",
        confidence: 0.86,
        fidelity: "semantic",
        patch: targets.flow.schema === "silver/flow/v1"
          ? [
              { op: "add", path: "/extensions/silver.reconciliation", value: { figma_revision: currentSnapshot.revision, node: node.id } },
              { op: "replace", path: "/revision", value: Number(targets.flow.revision.replace(/^r/, "")) + 1 },
            ]
          : patchFor(targets.flow, "figma_behavior_changes", [node]),
      }));
      changes.push(change({
        id: `specification-${node.id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`.replace(/-+$/, ""),
        entity: node,
        target: targets.specification,
        classification: "specification",
        confidence: 0.78,
        fidelity: "partial",
        unresolved: ["Confirm the behavioral intent before acceptance."],
        patch: patchFor(targets.specification, "figma_behavior_changes", [node]),
      }));
    }
  }
  const externalIdentity = {
    state: "present",
    revision: currentSnapshot.revision,
    integrity: digest(currentSnapshot),
  };
  const localIdentity = {
    state: "present",
    revision: binding.artifact.revision,
    integrity: targets.local.integrity,
  };
  const operations = changes.map((item) => ({
    id: item.id,
    type:
      item.operation === "finding" ? "finding" :
      item.operation === "no-op" ? "no-op" :
      item.operation === "propose-create" ? "create" : "update",
    classification:
      ["unknown-style", "unknown-component"].includes(item.classification) ? "unmapped" :
      ["presentation", "flow", "specification"].includes(item.classification) ? "structural" :
      item.classification,
    mapping_fidelity:
      item.mapping_fidelity === "partial"
        ? item.operation === "finding" ? "unmapped" : "semantic"
        : item.mapping_fidelity,
    source_path: `figma:${item.provider_entity}`,
    target_path: item.proposal.target_path,
    source_identity: externalIdentity,
    target_identity: {
      state: "present",
      revision: item.proposal.target_path === binding.artifact.path
        ? binding.artifact.revision
        : item.artifact_id,
      integrity: item.proposal.expected_integrity,
    },
    required_approval: item.required_approval,
    unresolved: item.unresolved,
  }));
  const changeSet = {
    schema: "silver/change-set/v2",
    id: `${binding.id}-changes`,
    binding_id: binding.id,
    direction,
    binding_integrity: bindingIntegrity,
    base: binding.base,
    local: localIdentity,
    external: externalIdentity,
    adapter: FIGMA_ADAPTER,
    created_at: createdAt,
    operations,
    required_checks: [...new Set(changes.flatMap(({ required_checks: checks }) => checks))]
      .map((id) => ({ id, required: true })),
    adapter_payload: {
      patches: Object.fromEntries(changes.map((item) => [item.id, item.proposal.patch])),
      metadata: Object.fromEntries(changes.map((item) => [item.id, {
        provider_entity: item.provider_entity,
        ...(item.value_kind ? { value_kind: item.value_kind } : {}),
      }])),
    },
  };
  await assertV2("change-set-v2.schema.json", changeSet, schemaRoot ? { schemaRoot } : {});
  return changeSet;
}

// Writing a token back is the moment a reference silently becomes a literal,
// unless the alias is written on purpose. If `item.value` is still a DTCG
// `{reference}` at push time, this resolves it against `snapshot`'s
// variables and writes a `VARIABLE_ALIAS`, never the reference's resolved
// value. Without a `snapshot` (or where the reference does not resolve),
// this falls back to writing the value as given — the caller's choice to
// make deliberately, not a silent default.
export async function previewSemanticTokenWrite({
  binding,
  changes,
  snapshot,
  expectedExternalRevision = snapshot?.revision ?? binding.counterpart.revision,
  permission = "ask",
  createdAt = new Date().toISOString(),
  schemaRoot,
}) {
  if (!changes.length || changes.some((item) => item.classification !== "semantic-style")) {
    throw new Error("Figma write preview accepts only mapped semantic-style changes.");
  }
  const variables = snapshot?.variables ?? [];
  const operation = {
    schema: "silver/provider-operation/v2",
    id: `${binding.id}-token-preview`,
    provider: binding.counterpart.provider,
    adapter: FIGMA_ADAPTER,
    binding_id: binding.id,
    operation: "apply-write",
    direction: "local-to-external",
    expected_external_revision: expectedExternalRevision,
    status: permission === "deny" ? "blocked" : "external-action-required",
    created_at: createdAt,
    payload: {
      variables: changes.map((item) => {
        const aliasTarget = resolveReferenceToVariableId(item.value, variables);
        return aliasTarget
          ? { semantic_name: item.semantic_name, alias_to: aliasTarget }
          : { semantic_name: item.semantic_name, value: item.value };
      }),
    },
  };
  await assertV2("provider-operation-v2.schema.json", operation, schemaRoot ? { schemaRoot } : {});
  return operation;
}

// PUSH, per-property style write — the inverse of `bindStyleProperties`.
// `properties` is the desired state per property (`{value, is_alias}`, the
// same shape `bindStyleProperties` produces on pull); a property marked
// `is_alias` has its `{reference}` resolved against `snapshot` and written as
// a VARIABLE_ALIAS, never a literal.
export async function previewStyleWrite({
  binding,
  style,
  properties,
  snapshot,
  expectedExternalRevision = snapshot?.revision ?? binding.counterpart.revision,
  permission = "ask",
  createdAt = new Date().toISOString(),
  schemaRoot,
}) {
  const variables = snapshot?.variables ?? [];
  const payloadProperties = {};
  for (const [property, entry] of Object.entries(properties)) {
    if (entry.is_alias) {
      const variableId = resolveReferenceToVariableId(entry.value, variables);
      if (!variableId) {
        throw new Error(`Cannot resolve ${entry.value} to a Figma variable for property "${property}".`);
      }
      payloadProperties[property] = { alias_to: variableId };
    } else {
      payloadProperties[property] = { value: entry.value };
    }
  }
  const operation = {
    schema: "silver/provider-operation/v2",
    id: `${binding.id}-style-preview`,
    provider: binding.counterpart.provider,
    adapter: FIGMA_ADAPTER,
    binding_id: binding.id,
    operation: "apply-write",
    direction: "local-to-external",
    expected_external_revision: expectedExternalRevision,
    status: permission === "deny" ? "blocked" : "external-action-required",
    created_at: createdAt,
    payload: { style_id: style.id, properties: payloadProperties },
  };
  await assertV2("provider-operation-v2.schema.json", operation, schemaRoot ? { schemaRoot } : {});
  return operation;
}

export async function applySemanticTokenWrite({
  operation,
  approval,
  currentRevision,
  transport,
}) {
  if (operation.operation !== "apply-write" || operation.status !== "external-action-required") {
    throw new Error("Only an approved pending semantic-token operation can be applied.");
  }
  if (!approval) {
    throw new Error("Explicit approval is required for a Figma write.");
  }
  if (currentRevision !== operation.expected_external_revision) {
    throw new Error("Figma write rejected because the provider revision is stale.");
  }
  if (!transport || typeof transport.writeVariables !== "function") {
    throw new Error("No Figma write transport is available.");
  }
  const result = await transport.writeVariables({
    expectedRevision: currentRevision,
    variables: operation.payload.variables,
  });
  return {
    ...operation,
    status: "applied",
    result: { approval_id: approval.id, provider_result: result },
  };
}
