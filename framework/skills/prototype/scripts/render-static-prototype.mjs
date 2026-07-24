#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const usage = `Render a constrained static prototype from a pinned flow

Usage:
  render-static-prototype.mjs --prototype <directory> --flow <flow.json> [options]

Options:
  --root <workspace>   Defaults to the current directory
  --replace            Explicitly replace the three generated render files
`;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeWorkspacePath(root, value, label) {
  if (!value || path.isAbsolute(value)) {
    throw new Error(`${label} must be a workspace-relative path.`);
  }
  const absolute = path.resolve(root, value);
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes the workspace.`);
  }
  return absolute;
}

function yamlString(value) {
  const trimmed = value.trim();
  return trimmed.startsWith('"') ? JSON.parse(trimmed) : trimmed;
}

function readPrototypeMetadata(content) {
  const scalar = (key) => {
    const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return match ? yamlString(match[1]) : undefined;
  };
  const flowRefs = [];
  const flowBlock = content.match(
    /^flow_refs:\s*\n((?:[ \t]+.*(?:\n|$))*)/m,
  )?.[1];
  if (flowBlock) {
    const pattern =
      /^\s*-\s+id:\s*(.+)\n\s+path:\s*(.+)\n\s+revision:\s*([1-9][0-9]*)\s*$/gm;
    for (const match of flowBlock.matchAll(pattern)) {
      flowRefs.push({
        id: yamlString(match[1]),
        path: yamlString(match[2]),
        revision: Number(match[3]),
      });
    }
  }
  return {
    schema: scalar("schema"),
    id: scalar("id"),
    title: scalar("title"),
    question: scalar("question"),
    constraint_profile: scalar("constraint_profile"),
    flow_refs: flowRefs,
  };
}

function renderHtml(prototype, flow) {
  const outgoing = new Map(flow.nodes.map(({ id }) => [id, []]));
  for (const transition of flow.transitions) {
    outgoing.get(transition.from)?.push(transition);
  }
  const start = flow.start_nodes[0];
  const sections = flow.nodes
    .map((node) => {
      const transitions = outgoing.get(node.id) ?? [];
      const actions =
        transitions.length > 0
          ? transitions
              .map(
                (transition) =>
                  `<button class="ds-button" data-variant="primary" type="button" data-target="${escapeHtml(transition.to)}">${escapeHtml(transition.trigger ?? `Continue to ${transition.to}`)}</button>`,
              )
              .join("\n          ")
          : `<button class="ds-button" data-variant="secondary" type="button" data-target="${escapeHtml(start)}">Start again</button>`;
      return `      <section class="prototype-step" data-node="${escapeHtml(node.id)}" ${node.id === start ? "" : "hidden"}>
        <p class="prototype-step-kind">${escapeHtml(node.type.replaceAll("-", " "))}</p>
        <h2>${escapeHtml(node.title)}</h2>
        ${node.description ? `<p>${escapeHtml(node.description)}</p>` : ""}
        <div class="prototype-actions">
          ${actions}
        </div>
      </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(prototype.title)}</title>
  <link rel="stylesheet" href="../../reference-system/packages/css/src/ds.css" />
  <link rel="stylesheet" href="./prototype.css" />
</head>
<body data-scheme="light" data-mode="default">
  <main class="prototype-page" data-start-node="${escapeHtml(start)}">
    <article class="prototype-shell">
      <header class="prototype-header">
        <p class="prototype-eyebrow">Flow prototype · revision ${flow.revision}</p>
        <h1>${escapeHtml(prototype.title)}</h1>
        ${prototype.question ? `<p>${escapeHtml(prototype.question)}</p>` : ""}
      </header>
      <p class="prototype-status" aria-live="polite"></p>
${sections}
    </article>
  </main>
  <script type="module" src="./prototype.js"></script>
</body>
</html>
`;
}

function renderCss() {
  return `@layer components {
  .prototype-page {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: var(--ds-space-24);
  }

  .prototype-shell {
    width: 100%;
    max-width: var(--ds-layout-form-max-width);
    padding: var(--ds-space-32);
    background: var(--ds-surface-raised);
    border: var(--ds-field-input-border-width) solid var(--ds-border-subtle);
    border-radius: var(--ds-radius-lg);
    box-shadow: var(--ds-shadow-sm);
  }

  .prototype-header,
  .prototype-step {
    display: grid;
    gap: var(--ds-space-12);
  }

  .prototype-header {
    margin-bottom: var(--ds-space-32);
  }

  .prototype-eyebrow,
  .prototype-step-kind,
  .prototype-status {
    color: var(--ds-text-muted);
    font-size: var(--ds-font-size-sm);
  }

  .prototype-step-kind {
    text-transform: capitalize;
  }

  .prototype-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ds-space-12);
    margin-top: var(--ds-space-16);
  }
}
`;
}

function renderJavaScript() {
  return `const root = document.querySelector(".prototype-page");
const status = document.querySelector(".prototype-status");

function show(target) {
  const steps = [...document.querySelectorAll("[data-node]")];
  const next = steps.find((step) => step.dataset.node === target);
  if (!next) return;
  for (const step of steps) step.hidden = step !== next;
  status.textContent = \`Current state: \${next.querySelector("h2").textContent}\`;
  next.querySelector("button")?.focus();
}

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-target]");
  if (action) show(action.dataset.target);
});

show(root.dataset.startNode);
`;
}

export async function renderStaticPrototype(options) {
  const root = path.resolve(options.root ?? process.cwd());
  const prototypeDirectory = safeWorkspacePath(
    root,
    options.prototype,
    "Prototype directory",
  );
  const flowPath = safeWorkspacePath(root, options.flow, "Flow path");
  const metadata = readPrototypeMetadata(
    await readFile(path.join(prototypeDirectory, "prototype.yaml"), "utf8"),
  );
  const flow = JSON.parse(await readFile(flowPath, "utf8"));
  if (
    metadata.schema !== "silver/prototype/v1" ||
    flow.schema !== "silver/flow/v1"
  ) {
    throw new Error("Prototype metadata and flow must use the v1 contracts.");
  }
  const relativeFlowPath = path
    .relative(root, flowPath)
    .split(path.sep)
    .join("/");
  const pinned = metadata.flow_refs.find(
    (reference) => reference.path === relativeFlowPath,
  );
  if (
    !pinned ||
    pinned.id !== flow.id ||
    pinned.revision !== flow.revision
  ) {
    throw new Error(
      "Prototype metadata must pin this flow's exact ID, path, and revision before rendering.",
    );
  }
  if (!flow.start_nodes?.length || !flow.nodes?.length) {
    throw new Error("Flow needs at least one start node and renderable node.");
  }

  await mkdir(prototypeDirectory, { recursive: true });
  const outputs = new Map([
    ["index.html", renderHtml(metadata, flow)],
    ["prototype.css", renderCss()],
    ["prototype.js", renderJavaScript()],
  ]);
  if (!options.replace) {
    const existing = [];
    for (const name of outputs.keys()) {
      try {
        await access(path.join(prototypeDirectory, name));
        existing.push(name);
      } catch {
        // Missing outputs are safe to create.
      }
    }
    if (existing.length > 0) {
      throw new Error(
        `Refusing to replace existing render files: ${existing.join(", ")}. Reconcile edits, then pass --replace explicitly.`,
      );
    }
  }
  for (const [name, content] of outputs) {
    await writeFile(path.join(prototypeDirectory, name), content, {
      encoding: "utf8",
      flag: options.replace ? "w" : "wx",
    });
  }
  return {
    prototype: metadata.id,
    flow: { id: flow.id, revision: flow.revision, path: relativeFlowPath },
    outputs: [...outputs.keys()].map((name) =>
      path.join(prototypeDirectory, name),
    ),
  };
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--replace") {
      values.replace = true;
      continue;
    }
    if (argument === "--help") {
      values.help = true;
      continue;
    }
    const key = argument.slice(2);
    const mapping = {
      flow: "flow",
      prototype: "prototype",
      root: "root",
    };
    const next = args[index + 1];
    if (!argument.startsWith("--") || !mapping[key] || !next) {
      throw new Error(`Invalid argument: ${argument}`);
    }
    values[mapping[key]] = next;
    index += 1;
  }
  return values;
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage);
      return;
    }
    const result = await renderStaticPrototype(options);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
) {
  await main();
}
