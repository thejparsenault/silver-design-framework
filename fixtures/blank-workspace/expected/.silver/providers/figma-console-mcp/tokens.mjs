// Figma's own alias mechanism, preserved rather than flattened.
//
// A real Figma design system usually has a primitive collection plus a
// semantic collection whose variables alias the primitives, and text styles
// that bind some properties to variables while leaving others hardcoded.
// None of that survives `entity()`'s normalization on its own — everything
// past `id`/`name`/`semantic_name` lands in `data` untyped. These functions
// read that raw `data` and derive DTCG-shaped structure from it: a
// `VARIABLE_ALIAS` becomes a `{reference}` string, never a flattened literal.
//
// Field names on `data` follow this codebase's snake_case convention
// (`values_by_mode`, `resolved_type`, `variable_collection_id`,
// `bound_variables`), matching `fixtures/providers/figma/base.json` — the
// payload assembler that calls the real Figma API is expected to translate
// Figma's own camelCase before handing a payload to this adapter, the same
// way it already does for `semanticName` -> `semantic_name`.
//
// Scope, stated plainly: Silver's token tree carries one `$value` per token,
// not per mode. Where a variable has more than one mode (light/dark, for
// example), the first mode Figma reports is what gets used here. Multi-mode
// token trees are a real gap this does not close.

const ALIAS_TYPE = "VARIABLE_ALIAS";

export function isAlias(value) {
  return Boolean(value) && typeof value === "object" && value.type === ALIAS_TYPE;
}

export function firstModeValue(variable) {
  const modes = variable.data?.values_by_mode ?? {};
  const [firstKey] = Object.keys(modes);
  return firstKey === undefined ? undefined : modes[firstKey];
}

const REFERENCE = /^\{(.+)\}$/;

// PUSH: the inverse of the pull-side resolution — a DTCG `{reference}`
// resolves back to whichever variable in this snapshot carries that
// semantic_name, so a push can write a VARIABLE_ALIAS instead of a literal.
export function resolveReferenceToVariableId(value, variables) {
  if (typeof value !== "string") return null;
  const match = REFERENCE.exec(value);
  if (!match) return null;
  const target = variables.find((variable) => variable.semantic_name === match[1]);
  return target ? target.id : null;
}

// Bottom-up: a variable can only become a reference once whatever it aliases
// has itself been resolved to a name. `trail` guards a cycle the same way
// `framework/runtime/tokens.mjs`'s resolver does for authored DTCG references.
function resolveVariableValue(variable, byId, trail = []) {
  if (trail.includes(variable.id)) {
    throw new Error(`Figma variable alias cycle: ${[...trail, variable.id].join(" -> ")}`);
  }
  const raw = firstModeValue(variable);
  if (!isAlias(raw)) {
    return { value: raw, resolved: raw !== undefined };
  }
  const target = byId.get(String(raw.id));
  if (!target) {
    return { value: undefined, resolved: false, unresolved_reason: `Alias target ${raw.id} was not in this pull.` };
  }
  if (!target.semantic_name) {
    // The alias is real; there is just nothing named to point at yet. A
    // floating Figma variable id means nothing outside Figma.
    return { value: undefined, resolved: false, unresolved_reason: `Alias target ${target.id} has no semantic name mapped.` };
  }
  const targetResolution = resolveVariableValue(target, byId, [...trail, variable.id]);
  if (!targetResolution.resolved) return targetResolution;
  return { value: `{${target.semantic_name}}`, resolved: true, is_alias: true };
}

// PULL: normalized variable entities -> DTCG-shaped token fragments, one per
// semantic_name. A variable with no semantic_name is not placed in the tree
// at all — that is the existing "unknown, needs a human to map it" state
// `createFigmaChangeSet` already reports as a finding.
export function figmaVariablesToTokens(variables) {
  const byId = new Map(variables.map((variable) => [variable.id, variable]));
  const tokens = {};
  const unresolved = [];
  for (const variable of variables) {
    if (!variable.semantic_name) continue;
    const resolution = resolveVariableValue(variable, byId);
    if (!resolution.resolved) {
      unresolved.push({ id: variable.id, semantic_name: variable.semantic_name, reason: resolution.unresolved_reason ?? "No mode value." });
      continue;
    }
    tokens[variable.semantic_name] = {
      $value: resolution.value,
      ...(variable.data?.resolved_type ? { $type: variable.data.resolved_type } : {}),
      ...(resolution.is_alias ? { $extensions: { "silver.figma": { variable_id: variable.id, alias: true } } } : {}),
    };
  }
  return { tokens, unresolved };
}

// PULL: which collection is probably primitive vs. probably semantic — a
// proposal per collection, never assumed. Figma exposes no such flag; this
// is a naming convention every real design system invents for itself.
// Heuristic: a variable many others alias is probably a primitive; a
// variable that is itself an alias and rarely referenced further is
// probably a semantic leaf. Ties or thin evidence come back `uncertain`
// rather than guessed.
export function classifyCollections(variables) {
  const byId = new Map(variables.map((variable) => [variable.id, variable]));
  const collectionOf = (variable) => variable.data?.variable_collection_id ?? "unknown-collection";
  const referencedCount = new Map();
  const aliasingCount = new Map();
  for (const variable of variables) {
    const collection = collectionOf(variable);
    referencedCount.set(collection, referencedCount.get(collection) ?? 0);
    aliasingCount.set(collection, aliasingCount.get(collection) ?? 0);
  }
  for (const variable of variables) {
    const raw = firstModeValue(variable);
    if (!isAlias(raw)) continue;
    const target = byId.get(String(raw.id));
    if (!target) continue;
    aliasingCount.set(collectionOf(variable), (aliasingCount.get(collectionOf(variable)) ?? 0) + 1);
    referencedCount.set(collectionOf(target), (referencedCount.get(collectionOf(target)) ?? 0) + 1);
  }
  return [...referencedCount.keys()].map((collection) => {
    const referenced = referencedCount.get(collection) ?? 0;
    const aliasing = aliasingCount.get(collection) ?? 0;
    const proposal =
      referenced > 0 && aliasing === 0
        ? "primitive"
        : aliasing > 0 && referenced === 0
          ? "semantic"
          : "uncertain";
    return {
      collection_id: collection,
      proposed_classification: proposal,
      evidence: { referenced_by_other_collections: referenced, aliases_into_other_collections: aliasing },
    };
  });
}

// PULL: per-property style binding. A text or effect style's `bound_variables`
// names which properties are bound to a variable; everything else is a
// literal already sitting on the style entity's `data`. type.tokens.json
// already has exactly this shape — a composite where each property is
// independently a reference or a literal.
export function bindStyleProperties(style, variables) {
  const byId = new Map(variables.map((variable) => [variable.id, variable]));
  const bound = style.data?.bound_variables ?? {};
  const properties = {};
  const sourceProperties = { ...style.data };
  delete sourceProperties.bound_variables;
  for (const [property, literalValue] of Object.entries(sourceProperties)) {
    const binding = bound[property];
    if (binding && typeof binding === "object" && binding.id) {
      const target = byId.get(String(binding.id));
      properties[property] = target?.semantic_name
        ? { value: `{${target.semantic_name}}`, is_alias: true }
        : { value: literalValue, is_alias: false, unresolved_reason: `Bound variable ${binding.id} has no semantic name mapped.` };
    } else {
      properties[property] = { value: literalValue, is_alias: false };
    }
  }
  return properties;
}
