#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveActiveStylesheet } from "../../../runtime/expression.mjs";

const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// This script runs through the CLI, which bundles the framework runtime with
// the native executable. The copied workspace script remains an unsupported
// direct entrypoint; `.silver/bin/silver` is its supported route.
async function resolveStylesheetHref(root, fromDirectory) {
  const stylesheet = await resolveActiveStylesheet(root);
  return path.relative(fromDirectory, path.join(root, stylesheet)).split(path.sep).join("/");
}

function leaves(value, prefix = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const output = [];
  for (const [key, nested] of Object.entries(value)) {
    if (key.startsWith("$")) continue;
    if (
      nested &&
      typeof nested === "object" &&
      ("value" in nested || "$value" in nested)
    ) {
      output.push({ name: [...prefix, key].join("."), value: nested.value ?? nested.$value });
    } else if (nested && typeof nested === "object") {
      output.push(...leaves(nested, [...prefix, key]));
    } else {
      output.push({ name: [...prefix, key].join("."), value: nested });
    }
  }
  return output;
}

export async function renderSystemCatalog({
  root = process.cwd(),
  tokens = "design/system/tokens.json",
  output = "design/system/showcase.html",
  sourceRevision = "r1",
  assetRevision = "r1",
  designSystemRevision = "r1",
  replace = false,
} = {}) {
  const workspace = path.resolve(root);
  const tokenPath = path.resolve(workspace, tokens);
  const outputPath = path.resolve(workspace, output);
  if (!tokenPath.startsWith(`${workspace}${path.sep}`) || !outputPath.startsWith(`${workspace}${path.sep}`)) throw new Error("Catalog paths must stay inside the workspace.");
  try {
    await access(outputPath);
    if (!replace) throw new Error("Refusing to replace the system catalog without --replace.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const tokenSource = JSON.parse(await readFile(tokenPath, "utf8"));
  const rows = leaves(tokenSource).slice(0, 200).map(({ name, value }) =>
    `<tr><th scope="row">${escapeHtml(name)}</th><td><code>${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</code></td></tr>`,
  ).join("");
  const stylesheetHref = await resolveStylesheetHref(workspace, path.dirname(outputPath));
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Design system showcase</title>
<link rel="stylesheet" href="${escapeHtml(stylesheetHref)}" /><style>
.catalog { max-width: var(--ds-layout-content-max-width); margin: var(--ds-space-0) auto; padding: var(--ds-space-32); }
table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: var(--ds-space-12); border-bottom: var(--ds-field-input-border-width) solid var(--ds-border-subtle); }
</style></head><body data-scheme="light" data-mode="default"><main class="catalog" data-silver-target="system-catalog" data-source-id="design-system" data-source-revision="${escapeHtml(sourceRevision)}" data-renderer-version="system-catalog-html@0.4.0" data-assets-revision="${escapeHtml(assetRevision)}" data-design-system-revision="${escapeHtml(designSystemRevision)}"><h1>Design system showcase</h1><p>This workspace's own system, rendered from its current tokens. Regenerates whenever tokens or components change — safe to delete.</p><table><thead><tr><th>Token</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
  return { outputPath, tokenCount: leaves(tokenSource).length };
}

if (import.meta.main ?? (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)))) {
  (async () => {
    const args = process.argv.slice(2);
    const rootIndex = args.indexOf("--root");
    const replace = args.includes("--replace");
    try {
      const result = await renderSystemCatalog({ root: rootIndex >= 0 ? args[rootIndex + 1] : process.cwd(), replace });
      console.log(path.relative(process.cwd(), result.outputPath));
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exitCode = 1;
    }
  })();
}
