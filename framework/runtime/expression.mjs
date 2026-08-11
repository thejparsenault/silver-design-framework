// Resolves the active design context's stylesheet — the thing a renderer
// actually links — instead of every renderer hardcoding a path into
// reference-system/. Dependency-free (no "yaml" import) to match the rest of
// the skill scripts this is imported from, which run inside an installed
// workspace where an npm dependency may not be resolvable.

import { readFile } from "node:fs/promises";
import path from "node:path";

function scalar(content, key) {
  const match = content.match(new RegExp(`^[ \\t]*${key}:\\s*(.+)$`, "m"));
  if (!match) return undefined;
  const trimmed = match[1].trim();
  return trimmed.startsWith('"') ? JSON.parse(trimmed) : trimmed;
}

function nestedScalar(content, blockKey, key) {
  const block = content.match(
    new RegExp(`^${blockKey}:\\s*\\n((?:[ \\t]+.*\\n?)*)`, "m"),
  )?.[1];
  return block ? scalar(block, key) : undefined;
}

// Falls back to the conventional default-expression path when a workspace has
// no design context at all — a minimal or synthetic workspace (fixtures,
// scenario tests) still renders against the default system rather than
// hard-failing over a resolution nicety.
const DEFAULT_STYLESHEET = "design/system/expressions/html/styles/ds.css";

/** Reads `design/contexts/<contextFile>` -> its component_expression -> that
 * expression's `stylesheet` field, returning a workspace-relative path. */
export async function resolveActiveStylesheet(root, { contextFile = "default.yaml" } = {}) {
  const contextPath = path.join(root, "design", "contexts", contextFile);
  let contextContent;
  try {
    contextContent = await readFile(contextPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return DEFAULT_STYLESHEET;
    throw error;
  }
  const expressionRelative = nestedScalar(contextContent, "component_expression", "path");
  if (!expressionRelative) {
    throw new Error(`design/contexts/${contextFile} has no component_expression.path.`);
  }
  const expressionContent = await readFile(path.join(root, expressionRelative), "utf8");
  const stylesheet = scalar(expressionContent, "stylesheet");
  if (!stylesheet) {
    throw new Error(`${expressionRelative} has no stylesheet field.`);
  }
  return stylesheet;
}
