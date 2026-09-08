// Fixture-only Figma round-trip fidelity — no live calls, ever. Extends
// portable-reconciliation.test.mjs's pattern with a synthetic multi-tier
// payload: a primitive variable, a semantic variable that aliases it, and a
// text style with one bound and one literal property.
import assert from "node:assert/strict";
import test from "node:test";

import { assertRoundTripLossless } from "../testing/adapter-round-trip.mjs";
import {
  createFigmaChangeSet,
  normalizeFigmaSnapshot,
  previewSemanticTokenWrite,
  previewStyleWrite,
} from "../providers/figma-console-mcp/adapter.mjs";
import { bindStyleProperties, figmaVariablesToTokens } from "../providers/figma-console-mcp/tokens.mjs";

const fixedTime = "2026-08-11T00:00:00Z";

function binding(objectId = "file-aliasing", revision = "v1") {
  return {
    schema: "silver/representation-binding/v2",
    id: "aliasing-figma",
    artifact: { id: "aliasing-flow", kind: "flow", revision: "r1", path: "design/flows/aliasing/flow.json" },
    counterpart: { type: "provider", provider: "figma-console-mcp", object_id: objectId, revision },
    adapter: { id: "silver-figma", version: "0.10.0" },
    authority: "workspace-authoritative",
    round_trip: "partial",
    sync_policy: "notify",
    base: {
      state: "initialized",
      local: { state: "present", revision: "r1", integrity: `sha256:${"0".repeat(64)}` },
      external: { state: "present", revision, integrity: `sha256:${"0".repeat(64)}` },
      at: fixedTime,
    },
  };
}

function payload({ primitiveValue = "#3355ff", semanticIsAlias = true, fileRevision = "v1" } = {}) {
  return {
    file: { id: "file-aliasing", revision: fileRevision },
    variables: [
      {
        id: "VariableID:1",
        name: "Blue/500",
        semantic_name: "color.blue.500",
        resolved_type: "COLOR",
        values_by_mode: { light: primitiveValue },
      },
      {
        id: "VariableID:2",
        name: "Action/Primary/Bg",
        semantic_name: "action.primary.bg",
        resolved_type: "COLOR",
        values_by_mode: {
          light: semanticIsAlias ? { type: "VARIABLE_ALIAS", id: "VariableID:1" } : "#ff0000",
        },
      },
      {
        id: "VariableID:3",
        name: "Type/Family/Base",
        semantic_name: "type.family.base",
        resolved_type: "STRING",
        values_by_mode: { light: "Inter" },
      },
    ],
    styles: [
      {
        id: "S:1",
        name: "Body",
        semantic_name: "type.body.md",
        font_family: "Inter",
        font_size: 16,
        bound_variables: { font_family: { id: "VariableID:3" } },
      },
    ],
    components: [],
    selected_nodes: [],
    unresolved: [],
  };
}

test("a synthetic aliased variable pulls as a DTCG reference, not a flattened literal", async () => {
  const snapshot = await normalizeFigmaSnapshot({ binding: binding(), payload: payload(), capturedAt: fixedTime });
  const { tokens, unresolved } = figmaVariablesToTokens(snapshot.variables);
  assert.deepEqual(unresolved, []);
  assert.equal(tokens["action.primary.bg"].$value, "{color.blue.500}");
  assert.equal(tokens["color.blue.500"].$value, "#3355ff");
});

test("a no-op push reconstructs the same alias, never rewrites it as a literal", async () => {
  const snapshot = await normalizeFigmaSnapshot({ binding: binding(), payload: payload(), capturedAt: fixedTime });
  const change = {
    classification: "semantic-style",
    semantic_name: "action.primary.bg",
    value: "{color.blue.500}",
  };
  const operation = await previewSemanticTokenWrite({ binding: binding(), changes: [change], snapshot, createdAt: fixedTime });
  const written = operation.payload.variables[0];
  assert.equal(written.alias_to, "VariableID:1");
  assert.equal(written.value, undefined);
});

test("editing only the primitive leaves the semantic variable's write still expressed as an alias", async () => {
  const editedPrimitivePayload = payload({ primitiveValue: "#000000" });
  const snapshot = await normalizeFigmaSnapshot({ binding: binding(), payload: editedPrimitivePayload, capturedAt: fixedTime });
  // The semantic token's authored value is unaffected by the primitive's new
  // literal — it is still the same reference.
  const { tokens } = figmaVariablesToTokens(snapshot.variables);
  assert.equal(tokens["action.primary.bg"].$value, "{color.blue.500}");
  const change = { classification: "semantic-style", semantic_name: "action.primary.bg", value: tokens["action.primary.bg"].$value };
  const operation = await previewSemanticTokenWrite({ binding: binding(), changes: [change], snapshot, createdAt: fixedTime });
  assert.equal(operation.payload.variables[0].alias_to, "VariableID:1");
});

test("a deliberate structural edit is classified distinctly from an ordinary value edit", async () => {
  const snapshot = await normalizeFigmaSnapshot({ binding: binding(), payload: payload(), capturedAt: fixedTime });

  // Ordinary value edit: still a reference, just pushed again.
  const valueEdit = { classification: "semantic-style", semantic_name: "action.primary.bg", value: "{color.blue.500}" };
  const valueOperation = await previewSemanticTokenWrite({ binding: binding(), changes: [valueEdit], snapshot, createdAt: fixedTime });
  assert.equal(valueOperation.payload.variables[0].alias_to, "VariableID:1");

  // Structural edit: the reference is hardcoded into a literal.
  const structuralEdit = { classification: "semantic-style", semantic_name: "action.primary.bg", value: "#112233" };
  const structuralOperation = await previewSemanticTokenWrite({ binding: binding(), changes: [structuralEdit], snapshot, createdAt: fixedTime });
  assert.equal(structuralOperation.payload.variables[0].alias_to, undefined);
  assert.equal(structuralOperation.payload.variables[0].value, "#112233");

  // The same distinction is visible at the change-set level via value_kind:
  // pulling both an unedited alias and a hardcoded literal into one payload
  // and diffing against an empty base shows each classified independently.
  const currentPayload = payload();
  currentPayload.variables[1].values_by_mode.light = "#112233"; // hardcoded in Figma
  const currentSnapshot = await normalizeFigmaSnapshot({ binding: binding(undefined, "v2"), payload: { ...currentPayload, file: { id: "file-aliasing", revision: "v2" } }, capturedAt: fixedTime });
  const targets = {
    local: { integrity: `sha256:${"0".repeat(64)}` },
    tokens: { id: "aliasing-tokens", kind: "token-source", revision: "r1", path: "design/work/tokens/aliasing.json", integrity: `sha256:${"0".repeat(64)}`, checks: [] },
  };
  const emptyBase = await normalizeFigmaSnapshot({ binding: binding(), payload: { ...payload(), variables: [], file: { id: "file-aliasing", revision: "v0" } }, capturedAt: fixedTime });
  const changeSet = await createFigmaChangeSet({
    binding: binding(undefined, "v2"),
    baseSnapshot: emptyBase,
    currentSnapshot,
    targets,
    bindingIntegrity: `sha256:${"0".repeat(64)}`,
    createdAt: fixedTime,
  });
  const metadata = Object.values(changeSet.adapter_payload.metadata);
  assert.equal(metadata.find((item) => item.provider_entity === "VariableID:1").value_kind, "literal");
  assert.equal(metadata.find((item) => item.provider_entity === "VariableID:2").value_kind, "literal");
});

test("a text style's bound-vs-literal property split survives a no-op round trip", async () => {
  const snapshot = await normalizeFigmaSnapshot({ binding: binding(), payload: payload(), capturedAt: fixedTime });
  const style = snapshot.styles.find(({ id }) => id === "S:1");
  const properties = bindStyleProperties(style, snapshot.variables);
  assert.deepEqual(properties.font_family, { value: "{type.family.base}", is_alias: true });
  assert.deepEqual(properties.font_size, { value: 16, is_alias: false });

  const operation = await previewStyleWrite({ binding: binding(), style, properties, snapshot, createdAt: fixedTime });
  assert.equal(operation.payload.properties.font_family.alias_to, "VariableID:3");
  assert.equal(operation.payload.properties.font_size.value, 16);
});

test("the shared adapter-round-trip harness passes for the Figma adapter", async () => {
  const snapshot = await normalizeFigmaSnapshot({ binding: binding(), payload: payload(), capturedAt: fixedTime });
  const { tokens } = figmaVariablesToTokens(snapshot.variables);
  const items = Object.entries(tokens).map(([id, token]) => ({
    id,
    value: token.$value,
    is_alias: Boolean(token.$extensions?.["silver.figma"]?.alias),
  }));

  await assertRoundTripLossless({
    items,
    push: async (pushItems) => {
      const changes = pushItems.map((item) => ({
        classification: "semantic-style",
        semantic_name: item.id,
        value: item.value,
      }));
      const operation = await previewSemanticTokenWrite({ binding: binding(), changes, snapshot, createdAt: fixedTime });
      return operation.payload.variables.map((entry) => ({
        id: entry.semantic_name,
        kind: entry.alias_to ? "alias" : "literal",
      }));
    },
  });
});
