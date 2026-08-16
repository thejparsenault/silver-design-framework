#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function inside(root, value, label) {
  if (!value || path.isAbsolute(value)) throw new Error(`${label} must be workspace-relative.`);
  const absolute = path.resolve(root, value);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`${label} escapes the workspace.`);
  return absolute;
}

// This script runs from an installed workspace where a bare specifier may not
// resolve, hence the ladder — the same one framework/skills/design-check/
// scripts/run-browser.mjs uses for chrome.mjs.
async function resolveStylesheetHref(root, fromDirectory) {
  let resolveActiveStylesheet;
  for (const specifier of [
    "silver-design-framework/framework/runtime/expression.mjs",
    "../../../.silver/runtime/expression.mjs",
    "../../../runtime/expression.mjs",
  ]) {
    try {
      ({ resolveActiveStylesheet } = await import(specifier));
      break;
    } catch {
      // Try the next resolution path.
    }
  }
  if (!resolveActiveStylesheet) {
    throw new Error("Could not resolve the design-system runtime module.");
  }
  const stylesheet = await resolveActiveStylesheet(root);
  return path.posix.relative(fromDirectory, stylesheet);
}

async function writeExclusive(file, content, replace) {
  try {
    await access(file);
    if (!replace) throw new Error(`Refusing to replace ${file}; pass --replace after review.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

export async function renderVisualization({ root = process.cwd(), artifact, output, replace = false }) {
  const workspace = path.resolve(root);
  const sourcePath = inside(workspace, artifact, "Artifact");
  const outputPath = inside(workspace, output, "Output");
  const visualization = JSON.parse(await readFile(sourcePath, "utf8"));
  if (visualization.schema !== "silver/working-artifact/v2" || visualization.kind !== "visualization") {
    throw new Error("Visualization input must be a silver/working-artifact/v2 visualization.");
  }
  const { fidelity, constraint_profile: profile, question, alternatives = [] } = visualization.payload;
  if (!fidelity || !profile || !question || alternatives.length < 2) {
    throw new Error("Visualization must declare fidelity, constraint profile, question, and at least two alternatives.");
  }
  const cards = alternatives.map((item, index) => `<article class="visualization-card">
        <p class="visualization-label">Alternative ${index + 1}</p>
        <h2>${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(item.summary)}</p>
        <p class="visualization-tradeoff"><strong>Tradeoff:</strong> ${escapeHtml(item.tradeoff)}</p>
      </article>`).join("\n      ");
  const relativeCss = await resolveStylesheetHref(workspace, path.posix.dirname(output));
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(visualization.title)}</title>
  <link rel="stylesheet" href="${escapeHtml(relativeCss)}" />
  <style>
    .visualization-page { min-height: 100dvh; padding: var(--ds-space-24); background: var(--ds-surface-canvas); color: var(--ds-text-primary); }
    .visualization-shell { max-width: var(--ds-layout-content-max-width); margin: 0 auto; }
    .visualization-meta, .visualization-label { color: var(--ds-text-muted); }
    .visualization-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(var(--ds-layout-card-min-width), 1fr)); gap: var(--ds-space-16); margin-top: var(--ds-space-24); }
    .visualization-card { padding: var(--ds-space-20); background: var(--ds-surface-raised); border: var(--ds-field-input-border-width) solid var(--ds-border-subtle); border-radius: var(--ds-radius-lg); }
    .visualization-tradeoff { margin-top: var(--ds-space-16); }
  </style>
</head>
<body data-scheme="light" data-mode="default">
  <main class="visualization-page" data-silver-target="visualization" data-source-id="${escapeHtml(visualization.id)}" data-source-revision="${escapeHtml(visualization.revision)}" data-artifact-id="${escapeHtml(visualization.id)}" data-artifact-revision="${escapeHtml(visualization.revision)}" data-renderer-version="visualization-html@0.1.0" data-assets-revision="r1" data-design-system-revision="r1">
    <div class="visualization-shell">
      <p class="visualization-meta">${escapeHtml(fidelity)} · ${escapeHtml(profile)}</p>
      <h1>${escapeHtml(visualization.title)}</h1>
      <p>${escapeHtml(question)}</p>
      <section class="visualization-grid" aria-label="Visualization alternatives">${cards}</section>
    </div>
  </main>
</body>
</html>
`;
  await writeExclusive(outputPath, html, replace);
  return { outputPath, artifact: { id: visualization.id, revision: visualization.revision } };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--replace") { options.replace = true; continue; }
    if (!["--root", "--artifact", "--output"].includes(key)) throw new Error(`Unknown option: ${key}`);
    options[key.slice(2)] = args[++index];
  }
  return options;
}

if (import.meta.main ?? (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)))) {
  try {
    const result = await renderVisualization(parseArgs(process.argv.slice(2)));
    console.log(path.relative(process.cwd(), result.outputPath));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
