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

export async function renderSketch({ root = process.cwd(), artifact, output, replace = false }) {
  const workspace = path.resolve(root);
  const sourcePath = inside(workspace, artifact, "Artifact");
  const outputPath = inside(workspace, output, "Output");
  const sketch = JSON.parse(await readFile(sourcePath, "utf8"));
  if (sketch.schema !== "silver/working-artifact/v2" || sketch.kind !== "sketch") {
    throw new Error("Sketch input must be a silver/working-artifact/v2 sketch.");
  }
  const { fidelity, constraint_profile: profile, question, alternatives = [] } = sketch.payload;
  if (!fidelity || !profile || !question || alternatives.length < 2) {
    throw new Error("Sketch must declare fidelity, constraint profile, question, and at least two alternatives.");
  }
  const cards = alternatives.map((item, index) => `<article class="sketch-card">
        <p class="sketch-label">Alternative ${index + 1}</p>
        <h2>${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(item.summary)}</p>
        <p class="sketch-tradeoff"><strong>Tradeoff:</strong> ${escapeHtml(item.tradeoff)}</p>
      </article>`).join("\n      ");
  const relativeCss = await resolveStylesheetHref(workspace, path.posix.dirname(output));
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(sketch.title)}</title>
  <link rel="stylesheet" href="${escapeHtml(relativeCss)}" />
  <style>
    .sketch-page { min-height: 100dvh; padding: var(--ds-space-24); background: var(--ds-surface-canvas); color: var(--ds-text-primary); }
    .sketch-shell { max-width: var(--ds-layout-content-max-width); margin: 0 auto; }
    .sketch-meta, .sketch-label { color: var(--ds-text-muted); }
    .sketch-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(var(--ds-layout-card-min-width), 1fr)); gap: var(--ds-space-16); margin-top: var(--ds-space-24); }
    .sketch-card { padding: var(--ds-space-20); background: var(--ds-surface-raised); border: var(--ds-field-input-border-width) solid var(--ds-border-subtle); border-radius: var(--ds-radius-lg); }
    .sketch-tradeoff { margin-top: var(--ds-space-16); }
  </style>
</head>
<body data-scheme="light" data-mode="default">
  <main class="sketch-page" data-silver-target="sketch" data-source-id="${escapeHtml(sketch.id)}" data-source-revision="${escapeHtml(sketch.revision)}" data-artifact-id="${escapeHtml(sketch.id)}" data-artifact-revision="${escapeHtml(sketch.revision)}" data-renderer-version="sketch-html@0.4.0" data-assets-revision="r1" data-design-system-revision="r1">
    <div class="sketch-shell">
      <p class="sketch-meta">${escapeHtml(fidelity)} · ${escapeHtml(profile)}</p>
      <h1>${escapeHtml(sketch.title)}</h1>
      <p>${escapeHtml(question)}</p>
      <section class="sketch-grid" aria-label="Sketch alternatives">${cards}</section>
    </div>
  </main>
</body>
</html>
`;
  await writeExclusive(outputPath, html, replace);
  return { outputPath, artifact: { id: sketch.id, revision: sketch.revision } };
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

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const result = await renderSketch(parseArgs(process.argv.slice(2)));
    console.log(path.relative(process.cwd(), result.outputPath));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
