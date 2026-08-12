import assert from "node:assert/strict";
import test from "node:test";

import {
  bindStyleProperties,
  classifyCollections,
  figmaVariablesToTokens,
} from "../providers/figma-console-mcp/tokens.mjs";

function variable({ id, name, semanticName, collectionId, resolvedType, value }) {
  return {
    id,
    name,
    semantic_type: "variable",
    ...(semanticName ? { semantic_name: semanticName } : {}),
    data: {
      variable_collection_id: collectionId,
      resolved_type: resolvedType,
      values_by_mode: { "mode-1": value },
    },
  };
}

function alias(id) {
  return { type: "VARIABLE_ALIAS", id };
}

test("an aliased variable resolves to a DTCG reference, not a flattened literal", () => {
  const primitive = variable({
    id: "VariableID:1",
    name: "Blue 500",
    semanticName: "color.blue.500",
    collectionId: "collection-primitive",
    resolvedType: "COLOR",
    value: "#3355ff",
  });
  const semantic = variable({
    id: "VariableID:2",
    name: "Action Primary Bg",
    semanticName: "action.primary.bg",
    collectionId: "collection-semantic",
    resolvedType: "COLOR",
    value: alias("VariableID:1"),
  });

  const { tokens, unresolved } = figmaVariablesToTokens([semantic, primitive]);
  assert.deepEqual(unresolved, []);
  assert.equal(tokens["action.primary.bg"].$value, "{color.blue.500}");
  assert.equal(tokens["color.blue.500"].$value, "#3355ff");
});

test("a variable order in the pull does not matter — resolution is bottom-up regardless", () => {
  const primitive = variable({
    id: "VariableID:1",
    name: "Blue 500",
    semanticName: "color.blue.500",
    collectionId: "collection-primitive",
    resolvedType: "COLOR",
    value: "#3355ff",
  });
  const semantic = variable({
    id: "VariableID:2",
    name: "Action Primary Bg",
    semanticName: "action.primary.bg",
    collectionId: "collection-semantic",
    resolvedType: "COLOR",
    value: alias("VariableID:1"),
  });
  // Primitive listed first this time.
  const { tokens } = figmaVariablesToTokens([primitive, semantic]);
  assert.equal(tokens["action.primary.bg"].$value, "{color.blue.500}");
});

test("an alias whose target has no semantic name is unresolved, not invented", () => {
  const unmapped = variable({
    id: "VariableID:1",
    name: "Blue 500",
    collectionId: "collection-primitive",
    resolvedType: "COLOR",
    value: "#3355ff",
  });
  const semantic = variable({
    id: "VariableID:2",
    name: "Action Primary Bg",
    semanticName: "action.primary.bg",
    collectionId: "collection-semantic",
    resolvedType: "COLOR",
    value: alias("VariableID:1"),
  });
  const { tokens, unresolved } = figmaVariablesToTokens([semantic, unmapped]);
  assert.equal(tokens["action.primary.bg"], undefined);
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].semantic_name, "action.primary.bg");
});

test("an alias cycle is refused rather than looping forever", () => {
  const a = variable({
    id: "VariableID:1",
    name: "A",
    semanticName: "loop.a",
    collectionId: "collection-a",
    resolvedType: "COLOR",
    value: alias("VariableID:2"),
  });
  const b = variable({
    id: "VariableID:2",
    name: "B",
    semanticName: "loop.b",
    collectionId: "collection-a",
    resolvedType: "COLOR",
    value: alias("VariableID:1"),
  });
  assert.throws(() => figmaVariablesToTokens([a, b]), /alias cycle/);
});

test("collection classification proposes primitive vs semantic from alias direction, never assumed", () => {
  const primitive = variable({
    id: "VariableID:1",
    name: "Blue 500",
    semanticName: "color.blue.500",
    collectionId: "collection-primitive",
    resolvedType: "COLOR",
    value: "#3355ff",
  });
  const semantic = variable({
    id: "VariableID:2",
    name: "Action Primary Bg",
    semanticName: "action.primary.bg",
    collectionId: "collection-semantic",
    resolvedType: "COLOR",
    value: alias("VariableID:1"),
  });
  const proposals = classifyCollections([primitive, semantic]);
  const byId = Object.fromEntries(proposals.map((item) => [item.collection_id, item]));
  assert.equal(byId["collection-primitive"].proposed_classification, "primitive");
  assert.equal(byId["collection-semantic"].proposed_classification, "semantic");
});

test("a collection neither aliased into nor aliasing anything is uncertain, not guessed", () => {
  const standalone = variable({
    id: "VariableID:9",
    name: "Standalone",
    semanticName: "misc.standalone",
    collectionId: "collection-standalone",
    resolvedType: "COLOR",
    value: "#000000",
  });
  const proposals = classifyCollections([standalone]);
  assert.equal(proposals[0].proposed_classification, "uncertain");
});

test("a text style's bound and literal properties are each classified independently", () => {
  const family = variable({
    id: "VariableID:5",
    name: "Font Family Base",
    semanticName: "type.family.base",
    collectionId: "collection-type",
    resolvedType: "STRING",
    value: "Inter",
  });
  const style = {
    id: "S:1",
    name: "Body",
    semantic_type: "style",
    semantic_name: "type.body.md",
    data: {
      fontFamily: "Inter",
      fontSize: 16,
      bound_variables: { fontFamily: { id: "VariableID:5" } },
    },
  };
  const properties = bindStyleProperties(style, [family]);
  assert.deepEqual(properties.fontFamily, { value: "{type.family.base}", is_alias: true });
  assert.deepEqual(properties.fontSize, { value: 16, is_alias: false });
});

test("a bound property whose target has no semantic name falls back to its literal, marked unresolved", () => {
  const unmapped = { id: "VariableID:6", name: "Unmapped", semantic_type: "variable", data: {} };
  const style = {
    id: "S:2",
    name: "Body",
    semantic_type: "style",
    data: {
      fontSize: 14,
      bound_variables: { fontSize: { id: "VariableID:6" } },
    },
  };
  const properties = bindStyleProperties(style, [unmapped]);
  assert.equal(properties.fontSize.is_alias, false);
  assert.equal(properties.fontSize.value, 14);
  assert.ok(properties.fontSize.unresolved_reason);
});
