import { readdir } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { assertV2 } from "../framework/runtime/contracts.mjs";
import { findPinnedDependents } from "./lib/dependents.mjs";
import { exists, readUtf8 } from "./lib/files.mjs";

export async function loadDesignContexts(root) {
  const directory = path.join(path.resolve(root), "design", "contexts");
  if (!(await exists(directory))) return [];
  const contexts = [];
  for (const name of (await readdir(directory)).filter((item) => item.endsWith(".yaml")).sort()) {
    const value = parse(await readUtf8(path.join(directory, name)));
    if (value?.schema !== "silver/design-context/v1") continue;
    await assertV2("design-context.schema.json", value);
    contexts.push({ ...value, path: `design/contexts/${name}` });
  }
  return contexts;
}

export async function resolveDesignContext({
  root,
  product,
  surface,
  contextId,
}) {
  const contexts = (await loadDesignContexts(root)).filter(
    (context) => context.status === "active",
  );
  const matches = contextId
    ? contexts.filter(({ id }) => id === contextId)
    : contexts.filter(
        (context) =>
          (!product || context.products.includes(product)) &&
          (!surface || context.surfaces.includes(surface)),
      );
  if (matches.length === 0) {
    return { status: "unresolved", reason: "No active design context matches." };
  }
  const selected =
    matches.length === 1
      ? matches[0]
      : matches.filter((context) => context.default).length === 1
        ? matches.find((context) => context.default)
        : null;
  if (!selected) {
    return {
      status: "ambiguous",
      candidates: matches.map(({ id, title, revision }) => ({ id, title, revision })),
    };
  }
  const mappingPath = path.join(path.resolve(root), selected.component_expression.path);
  const mapping = parse(await readUtf8(mappingPath));
  await assertV2("component-expression.schema.json", mapping);
  if (
    mapping.component_catalog.id !== selected.component_catalog.id ||
    mapping.design_system.id !== selected.design_system.id
  ) {
    throw new Error(`Design context ${selected.id} has an incompatible component expression mapping.`);
  }
  return {
    status: "resolved",
    context: selected,
    mapping,
    stale_dependents: await findPinnedDependents({
      root,
      field: "design_contexts",
      id: selected.id,
      revision: selected.revision,
      excludeRevision: true,
    }),
  };
}
