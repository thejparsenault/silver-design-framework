#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function inside(root, value) {
  if (!value || path.isAbsolute(value)) throw new Error("Paths must be workspace-relative.");
  const absolute = path.resolve(root, value);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error("Path escapes workspace.");
  return absolute;
}
async function mayWrite(directory, names, replace) {
  const present = [];
  for (const name of names) {
    try { await access(path.join(directory, name)); present.push(name); } catch {}
  }
  if (present.length && !replace) throw new Error(`Refusing to replace ${present.join(", ")}; pass --replace after review.`);
}

export async function renderStaticImplementation({ root = process.cwd(), handoff, output, replace = false }) {
  const workspace = path.resolve(root);
  const handoffPath = inside(workspace, handoff);
  const outputRoot = inside(workspace, output);
  const artifact = JSON.parse(await readFile(handoffPath, "utf8"));
  if (artifact.schema !== "silver/working-artifact/v2" || artifact.kind !== "implementation-handoff") throw new Error("Handoff must use the v2 working-artifact contract.");
  const payload = artifact.payload;
  if (payload.recipe !== "static-html" || payload.readiness !== "ready" || payload.missing_intent.length) throw new Error("Implementation requires a ready static-html handoff with no missing intent.");
  if (!artifact.sources.length || artifact.sources.some(({ revision }) => !revision)) throw new Error("Accepted intent must be pinned.");
  const content = payload.content;
  for (const key of ["title", "heading", "body", "primary_action", "secondary_action", "completion_message"]) {
    if (!content?.[key]) throw new Error(`Handoff content is missing ${key}; the renderer will not invent intent.`);
  }
  const names = ["index.html", "implementation.css", "implementation.js"];
  await mayWrite(outputRoot, names, replace);
  await mkdir(outputRoot, { recursive: true });
  const relativeCss = path.posix.relative(output, "reference-system/packages/css/src/ds.css");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(content.title)}</title>
  <link rel="stylesheet" href="${escapeHtml(relativeCss)}" />
  <link rel="stylesheet" href="./implementation.css" />
</head>
<body data-scheme="light" data-mode="default">
  <main class="implementation-page" data-silver-target="production" data-handoff-id="${escapeHtml(artifact.id)}" data-handoff-revision="${escapeHtml(artifact.revision)}">
    <section class="implementation-card" aria-labelledby="page-heading">
      <p class="implementation-eyebrow">Production recipe</p>
      <h1 id="page-heading">${escapeHtml(content.heading)}</h1>
      <p>${escapeHtml(content.body)}</p>
      <p class="implementation-status" role="status" aria-live="polite"></p>
      <div class="implementation-actions">
        <button class="ds-button" data-variant="primary" type="button" data-action="complete">${escapeHtml(content.primary_action)}</button>
        <button class="ds-button" data-variant="secondary" type="button" data-action="cancel">${escapeHtml(content.secondary_action)}</button>
      </div>
    </section>
  </main>
  <script type="module" src="./implementation.js"></script>
</body>
</html>
`;
  const css = `@layer components {
  .implementation-page { min-height: 100dvh; display: grid; place-items: center; padding: var(--ds-space-24); background: var(--ds-surface-canvas); color: var(--ds-text-primary); }
  .implementation-card { width: 100%; max-width: var(--ds-layout-form-max-width); display: grid; gap: var(--ds-space-16); padding: var(--ds-space-32); background: var(--ds-surface-raised); border: var(--ds-field-input-border-width) solid var(--ds-border-subtle); border-radius: var(--ds-radius-lg); }
  .implementation-eyebrow, .implementation-status { color: var(--ds-text-muted); }
  .implementation-actions { display: flex; flex-wrap: wrap; gap: var(--ds-space-12); }
}
`;
  const js = `const status = document.querySelector(".implementation-status");
document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "complete") status.textContent = ${JSON.stringify(content.completion_message)};
  if (action === "cancel") status.textContent = "No changes were made.";
});
`;
  for (const [name, value] of [["index.html", html], ["implementation.css", css], ["implementation.js", js]]) {
    await writeFile(path.join(outputRoot, name), value, "utf8");
  }
  return { outputRoot, handoff: { id: artifact.id, revision: artifact.revision } };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--replace") { options.replace = true; continue; }
    if (!["--root", "--handoff", "--output"].includes(key)) throw new Error(`Unknown option: ${key}`);
    options[key.slice(2)] = args[++index];
  }
  return options;
}
if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  try { const result = await renderStaticImplementation(parseArgs(process.argv.slice(2))); console.log(path.relative(process.cwd(), result.outputRoot)); }
  catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 1; }
}
