#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArguments } from "./flow-lib.mjs";

function mermaidId(id) {
  return `node_${id.replaceAll("-", "_")}`;
}

function label(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function renderNode(node) {
  const id = mermaidId(node.id);
  const title = label(node.title);
  const shapes = {
    screen: `${id}["${title}"]`,
    "component-state": `${id}[["${title}"]]`,
    "user-action": `${id}(["${title}"])`,
    "system-action": `${id}["${title}"]`,
    decision: `${id}{"${title}"}`,
    external: `${id}[/"${title}"/]`,
    outcome: `${id}(("${title}"))`,
  };
  return shapes[node.type] ?? `${id}["${title}"]`;
}

function transitionLabel(transition) {
  const parts = [];
  if (transition.trigger) {
    parts.push(transition.trigger);
  }
  if (transition.condition) {
    parts.push(`[${transition.condition}]`);
  }
  return parts.length > 0 ? `|"${label(parts.join(" "))}"|` : "";
}

export function renderFlow(flow) {
  const lines = [
    `%% silver-view source=${flow.id}@r${flow.revision} renderer=flow-mermaid@0.4.0 assets=project-assets@r1 design-system=design-system@r1`,
    `%% Generated from ${flow.id} revision ${flow.revision}. Edit flow.json, then rerender.`,
    "flowchart TD",
  ];
  for (const node of flow.nodes ?? []) {
    lines.push(`  ${renderNode(node)}`);
  }
  for (const transition of flow.transitions ?? []) {
    lines.push(
      `  ${mermaidId(transition.from)} -->${transitionLabel(transition)} ${mermaidId(transition.to)}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderFlowHtml(flow, options = {}) {
  const assetRevision = options.assetRevision ?? "r1";
  const designSystemRevision = options.designSystemRevision ?? "r1";
  const outgoing = new Map(flow.nodes.map(({ id }) => [id, []]));
  for (const transition of flow.transitions) outgoing.get(transition.from)?.push(transition);
  const cards = flow.nodes.map((node) => {
    const transitions = outgoing.get(node.id) ?? [];
    const links = transitions.length
      ? `<ul>${transitions.map((item) => `<li><strong>${escapeHtml(item.trigger ?? "Continue")}</strong> → ${escapeHtml(item.to)}</li>`).join("")}</ul>`
      : "<p>End state</p>";
    return `<article class="flow-node" id="${escapeHtml(node.id)}"><p class="kind">${escapeHtml(node.type)}</p><h2>${escapeHtml(node.title)}</h2>${node.description ? `<p>${escapeHtml(node.description)}</p>` : ""}${links}</article>`;
  }).join("\\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(flow.title)}</title>
  <style>
    @layer view {
      body { margin: var(--ds-space-0); font-family: var(--ds-font-family-sans); background: var(--ds-surface-page); color: var(--ds-text-primary); }
      .flow-page { max-width: var(--ds-layout-container-max-width); margin: var(--ds-space-0) auto; padding: var(--ds-space-32); }
      .flow-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(var(--ds-layout-card-min-width), 1fr)); gap: var(--ds-space-16); }
      .flow-node { padding: var(--ds-space-20); border: var(--ds-field-input-border-width) solid var(--ds-border-subtle); border-radius: var(--ds-radius-lg); background: var(--ds-surface-raised); }
      .kind { color: var(--ds-text-muted); text-transform: capitalize; }
    }
  </style>
  <link rel="stylesheet" href="${escapeHtml(options.stylesheetHref)}" />
</head>
<body data-scheme="light" data-mode="default">
  <main class="flow-page" data-silver-target="flow" data-source-id="${escapeHtml(flow.id)}" data-source-revision="r${escapeHtml(flow.revision)}" data-renderer-version="flow-html@0.4.0" data-assets-revision="${escapeHtml(assetRevision)}" data-design-system-revision="${escapeHtml(designSystemRevision)}">
    <p class="kind">${escapeHtml(flow.kind)}</p>
    <h1>${escapeHtml(flow.title)}</h1>
    <p>${escapeHtml(flow.purpose)}</p>
    <section class="flow-grid" aria-label="Flow nodes">${cards}</section>
  </main>
</body>
</html>
`;
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
  return path.relative(fromDirectory, path.join(root, stylesheet)).split(path.sep).join("/");
}

async function workspaceMutator(root) {
  for (const specifier of [
    "silver-design-framework/framework/runtime/workspace-mutations.mjs",
    "../../../.silver/runtime/workspace-mutations.mjs",
    "../../../runtime/workspace-mutations.mjs",
  ]) {
    try {
      const { createWorkspaceMutator } = await import(specifier);
      return createWorkspaceMutator(root);
    } catch {}
  }
  throw new Error("Could not resolve the workspace mutation runtime module.");
}

function workspaceRelative(root, absolute) {
  const relative = path.relative(root, absolute);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Flow output must be inside the workspace.");
  }
  return relative;
}

async function discoverWorkspaceRoot(inputPath) {
  const absolute = path.resolve(inputPath);
  let current = path.dirname(absolute);
  while (true) {
    try {
      await access(path.join(current, "design", "manifest.yaml"));
      return current;
    } catch {}
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const segments = absolute.split(path.sep);
  const designIndex = segments.lastIndexOf("design");
  if (designIndex > 0) {
    return segments.slice(0, designIndex).join(path.sep) || path.parse(absolute).root;
  }
  throw new Error("Could not discover the workspace root; pass the root option explicitly.");
}

export async function renderFlowFile(inputPath, outputPath, options = {}) {
  const root = path.resolve(options.root ?? await discoverWorkspaceRoot(inputPath));
  const mutator = await workspaceMutator(root);
  const absoluteInput = path.resolve(inputPath);
  const flow = JSON.parse(await readFile(absoluteInput, "utf8"));
  const absoluteOutput = path.resolve(
    outputPath ?? path.join(path.dirname(absoluteInput), "flow.mmd"),
  );
  const outputRelative = workspaceRelative(root, absoluteOutput);
  await mutator.write(outputRelative, renderFlow(flow));
  const htmlOutput = path.resolve(
    options.htmlOutput ?? path.join(path.dirname(absoluteInput), "index.html"),
  );
  const htmlRelative = workspaceRelative(root, htmlOutput);
  const canonicalHtmlOutput = mutator.absolute(htmlRelative);
  const stylesheetHref = await resolveStylesheetHref(mutator.root, path.dirname(canonicalHtmlOutput));
  await mutator.write(
    htmlRelative,
    renderFlowHtml(flow, { ...options, stylesheetHref }),
  );
  return {
    flow,
    outputPath: mutator.absolute(outputRelative),
    htmlOutput: canonicalHtmlOutput,
  };
}

async function main() {
  try {
    if (process.argv.slice(2).includes("--help")) {
      console.log("Usage: render-flow.mjs <flow.json> [--output <flow.mmd>] [--html-output <index.html>]");
      return;
    }
    const options = parseArguments(process.argv.slice(2));
    if (options.positional.length !== 1) {
      throw new Error("Provide exactly one flow.json path.");
    }
    for (const key of Object.keys(options)) {
      if (!["positional", "output", "html-output"].includes(key)) {
        throw new Error(`Unknown option: --${key}`);
      }
    }
    const result = await renderFlowFile(
      options.positional[0],
      options.output,
      { htmlOutput: options["html-output"] },
    );
    console.log(JSON.stringify({
      mermaid: path.relative(process.cwd(), result.outputPath),
      html: path.relative(process.cwd(), result.htmlOutput),
    }));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.main ?? (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
)) {
  void main();
}
