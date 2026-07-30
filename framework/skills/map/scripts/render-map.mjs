#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkMap } from "./check-map.mjs";

const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const inside = (root, value) => {
  const result = path.resolve(root, value);
  if (!result.startsWith(`${root}${path.sep}`)) throw new Error("Path escapes workspace.");
  return result;
};

export async function renderMap({ root = process.cwd(), map, output, replace = false }) {
  const workspace = path.resolve(root);
  const check = await checkMap({ root: workspace, map });
  if (check.status !== "pass") throw new Error(check.findings.join(" "));
  const artifact = JSON.parse(await readFile(inside(workspace, map), "utf8"));
  const primaryContext = artifact.design_contexts.find(
    ({ id }) => id === artifact.primary_context,
  );
  const contextPin = `${primaryContext.id}@${primaryContext.revision}`;
  const inputPins = (artifact.provenance?.sources ?? [])
    .map(({ id, revision }) => `${id}@${revision}`)
    .join(",");
  const destination = inside(workspace, output);
  try {
    await access(destination);
    if (!replace) throw new Error("Map view already exists; pass --replace after review.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const stageCells = artifact.stages.map((stage) => `<th scope="col">${escape(stage.title)}</th>`).join("");
  const rows = artifact.lanes.map((lane) => {
    const cells = artifact.stages.map((stage) => {
      const items = artifact.items.filter((item) => item.lane === lane.id && item.stage === stage.id);
      return `<td>${items.map((item) => `<article><h3>${escape(item.title)}</h3>${item.assumption ? "<span>Assumption</span>" : `<span>${item.evidence.length} evidence source(s)</span>`}${item.pain_points.map((value) => `<p class="pain">Pain: ${escape(value)}</p>`).join("")}${item.opportunities.map((value) => `<p class="opportunity">Opportunity: ${escape(value)}</p>`).join("")}</article>`).join("")}</td>`;
    }).join("");
    return `<tr><th scope="row">${escape(lane.title)}</th>${cells}</tr>`;
  }).join("");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(artifact.title)}</title><style>
:root{font-family:system-ui,sans-serif;color:#18202a;background:#f7f8fa}body{margin:0;padding:2rem}header{max-width:70rem;margin:auto auto 2rem}table{border-collapse:collapse;min-width:100%;background:white}th,td{border:1px solid #cbd2da;padding:.75rem;vertical-align:top}thead th{background:#e8edf2}tbody th{min-width:10rem;text-align:left;background:#f2f5f7}article{min-width:12rem;border-left:.25rem solid #58728d;padding:.5rem;margin-bottom:.5rem;background:#fafbfc}article h3{font-size:.95rem;margin:0 0 .5rem}.pain{color:#8a2d2d}.opportunity{color:#16633b}span{font-size:.75rem;color:#52606d}
  </style></head><body><header><p>${escape(artifact.map_type)} · ${escape(artifact.state)}</p><h1>${escape(artifact.title)}</h1><p>${escape(artifact.question)}</p></header><main data-silver-target="map" data-source-id="${escape(artifact.id)}" data-source-revision="${escape(artifact.revision)}" data-input-revisions="${escape(inputPins)}" data-renderer-version="map-html@0.5.0" data-assets-revision="${escape(`via-context:${contextPin}`)}" data-design-system-revision="${escape(`via-context:${contextPin}`)}" data-map-id="${escape(artifact.id)}" data-map-revision="${escape(artifact.revision)}" data-design-context="${escape(contextPin)}"><table><thead><tr><th>Lane</th>${stageCells}</tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html, "utf8");
  return { output: destination, map: { id: artifact.id, revision: artifact.revision }, context: primaryContext };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--replace") { options.replace = true; continue; }
    const key = args[index].slice(2);
    options[key] = args[++index];
  }
  renderMap(options).then((value) => console.log(JSON.stringify(value))).catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
