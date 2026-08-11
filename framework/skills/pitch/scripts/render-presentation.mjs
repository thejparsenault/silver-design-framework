#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const list = (values) => `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
function inside(root, value) {
  if (!value || path.isAbsolute(value)) throw new Error("Paths must be workspace-relative.");
  const absolute = path.resolve(root, value);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error("Path escapes workspace.");
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

async function output(file, content, replace) {
  try { await access(file); if (!replace) throw new Error(`Refusing to replace ${file}; pass --replace after review.`); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

export async function renderPresentation({ root = process.cwd(), changeCase, kit, output: destination, replace = false }) {
  const workspace = path.resolve(root);
  const casePath = inside(workspace, changeCase);
  const kitPath = inside(workspace, kit);
  const outputPath = inside(workspace, destination);
  const change = JSON.parse(await readFile(casePath, "utf8"));
  const presentationKit = JSON.parse(await readFile(kitPath, "utf8"));
  if (change.schema !== "silver/working-artifact/v2" || change.kind !== "change-case") throw new Error("Change case must use the v2 working-artifact contract.");
  if (presentationKit.schema !== "silver/presentation-kit/v2") throw new Error("Presentation kit must use the v2 contract.");
  const payload = change.payload;
  const impact = payload.impact;
  if (!["estimated", "proxy", "measured"].includes(impact.kind) || !impact.source) throw new Error("Impact must distinguish kind and source.");
  if (!presentationKit.source_revisions?.length) throw new Error("Presentation kit must pin source revisions.");
  const relativeCss = await resolveStylesheetHref(workspace, path.posix.dirname(destination));
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(change.title)}</title>
  <link rel="stylesheet" href="${escapeHtml(relativeCss)}" />
  <style>
    .deck { min-height: 100dvh; background: var(--ds-surface-canvas); color: var(--ds-text-primary); }
    .slide { min-height: 100dvh; display: grid; align-content: center; gap: var(--ds-space-20); padding: var(--ds-space-48); border-bottom: var(--ds-field-input-border-width) solid var(--ds-border-subtle); }
    .slide > * { max-width: var(--ds-layout-content-max-width); }
    .eyebrow, .source { color: var(--ds-text-muted); }
    .comparison { display: grid; grid-template-columns: repeat(auto-fit, minmax(var(--ds-layout-card-min-width), 1fr)); gap: var(--ds-space-16); }
    .card { padding: var(--ds-space-20); background: var(--ds-surface-raised); border: var(--ds-field-input-border-width) solid var(--ds-border-subtle); border-radius: var(--ds-radius-lg); }
  </style>
</head>
<body data-scheme="light" data-mode="default">
  <main class="deck" data-silver-target="presentation" data-source-id="${escapeHtml(change.id)}" data-source-revision="${escapeHtml(change.revision)}" data-case-id="${escapeHtml(change.id)}" data-case-revision="${escapeHtml(change.revision)}" data-renderer-version="presentation-html@0.4.0" data-assets-revision="r1" data-design-system-revision="${escapeHtml(presentationKit.source_revisions.find(({ kind }) => kind === "design-system")?.revision ?? "unverified")}" data-kit-id="${escapeHtml(presentationKit.id)}" data-kit-revision="${escapeHtml(presentationKit.revision)}">
    <section class="slide"><p class="eyebrow">${escapeHtml(payload.mode)} change case</p><h1>${escapeHtml(change.title)}</h1><p>${escapeHtml(payload.decision_request)}</p></section>
    <section class="slide"><h2>Why change</h2>${list(payload.reasons)}</section>
    <section class="slide"><h2>Before and after</h2><div class="comparison"><article class="card"><h3>Before</h3><p>${escapeHtml(payload.before)}</p></article><article class="card"><h3>After</h3><p>${escapeHtml(payload.after)}</p></article></div></section>
    <section class="slide"><h2>Impact</h2><p><strong>${escapeHtml(impact.kind)}</strong> · ${escapeHtml(impact.claim)}</p><p>Confidence: ${escapeHtml(impact.confidence)}</p><p class="source">Source: ${escapeHtml(impact.source)}</p></section>
    <section class="slide"><h2>Tradeoffs and decision</h2>${list(payload.tradeoffs)}<p><strong>${escapeHtml(payload.decision_request)}</strong></p></section>
  </main>
</body>
</html>
`;
  await output(outputPath, html, replace);
  return { outputPath, changeCase: { id: change.id, revision: change.revision }, kit: { id: presentationKit.id, revision: presentationKit.revision } };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--replace") { options.replace = true; continue; }
    if (!["--root", "--case", "--kit", "--output"].includes(key)) throw new Error(`Unknown option: ${key}`);
    options[key === "--case" ? "changeCase" : key.slice(2)] = args[++index];
  }
  return options;
}
if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  try { const result = await renderPresentation(parseArgs(process.argv.slice(2))); console.log(path.relative(process.cwd(), result.outputPath)); }
  catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 1; }
}
