import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { exists, readUtf8, writeUtf8 } from "./lib/files.mjs";
import { createWorkspaceMutator } from "../framework/runtime/workspace-mutations.mjs";

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  return match ? parseYaml(match[1]) : null;
}

function parseArtifact(file, content) {
  if (file.endsWith(".json")) return JSON.parse(content);
  if (file.endsWith(".yaml") || file.endsWith(".yml")) return parseYaml(content);
  if (file.endsWith(".md")) return parseFrontmatter(content);
  return null;
}

async function filesUnder(root, relative) {
  const base = path.join(root, relative);
  if (!(await exists(base))) return [];
  const output = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (/\.(?:json|ya?ml|md)$/.test(entry.name)) output.push(absolute);
    }
  }
  if ((await stat(base)).isDirectory()) await visit(base);
  else output.push(base);
  return output;
}

export async function traceArtifact({ root, target }) {
  const workspace = path.resolve(root ?? process.cwd());
  const direct = path.resolve(workspace, target);
  const directIsInside =
    direct !== workspace && direct.startsWith(`${workspace}${path.sep}`);
  if (
    (path.isAbsolute(target) || target.split(/[\\/]/).includes("..")) &&
    !directIsInside
  ) {
    throw new Error(`Trace target escapes workspace: ${target}`);
  }
  const candidates = directIsInside && (await exists(direct))
    ? [direct]
    : (
        await Promise.all(
          ["design", "prototypes", "presentations", ".silver/results"].map((relative) =>
            filesUnder(workspace, relative),
          ),
        )
      ).flat();
  for (const file of candidates) {
    let value;
    try {
      value = parseArtifact(file, await readUtf8(file));
    } catch {
      continue;
    }
    if (!value || (file !== direct && value.id !== target && value.invocation_id !== target)) continue;
    const provenance = value.provenance ?? null;
    return {
      schema: "silver/trace/v1",
      target: {
        id: value.id ?? value.invocation_id ?? target,
        kind: value.kind ?? value.schema ?? "unknown",
        revision: value.revision ?? null,
        path: path.relative(workspace, file).split(path.sep).join("/"),
      },
      provenance,
      sources: provenance?.sources ?? value.sources ?? value.inputs ?? [],
      practice: provenance?.practice ?? null,
      guidance: provenance?.guidance ?? [],
      linked_sources: provenance?.linked_sources ?? [],
      design_contexts: provenance?.design_contexts ?? value.design_contexts ?? [],
      references: provenance?.references ?? [],
      acceptance: provenance?.acceptance ?? value.acceptance?.status ?? value.status ?? "unknown",
    };
  }
  const bootstrapPath = path.join(
    workspace,
    ".silver",
    "provenance",
    "legacy-artifacts.json",
  );
  if (await exists(bootstrapPath)) {
    const bootstrap = JSON.parse(await readUtf8(bootstrapPath));
    const artifact = (bootstrap.artifacts ?? []).find(
      ({ id, path: artifactPath }) => id === target || artifactPath === target,
    );
    if (artifact) {
      return {
        schema: "silver/trace/v1",
        target: {
          id: artifact.id,
          kind: artifact.kind,
          revision: null,
          path: artifact.path,
          integrity: artifact.integrity,
        },
        provenance: {
          origin: "legacy",
          recorded_at: bootstrap.created_at,
          sources: [],
          guidance: [],
          linked_sources: [],
          design_contexts: [],
        },
        sources: [],
        practice: null,
        guidance: [],
        linked_sources: [],
        design_contexts: [],
        references: [],
        acceptance: "unknown",
      };
    }
  }
  throw new Error(`No durable Silver artifact found for ${target}.`);
}

export function renderTrace(trace) {
  const lines = [
    `Trace: ${trace.target.id}`,
    `Kind: ${trace.target.kind}`,
    `Revision: ${trace.target.revision ?? "unknown"}`,
    `Path: ${trace.target.path}`,
    `Acceptance: ${trace.acceptance}`,
    `Origin: ${trace.provenance?.origin ?? "unknown"}`,
    `Sources: ${trace.sources.length}`,
    `Guidance pins: ${trace.guidance.length}`,
    `Linked source pins: ${trace.linked_sources?.length ?? 0}`,
    `Design contexts: ${trace.design_contexts.length}`,
  ];
  for (const citation of trace.references ?? []) {
    lines.push(
      `Reference: ${citation.collection}@${citation.revision} (${citation.ids.join(", ")})`,
    );
  }
  if (trace.practice) {
    lines.push(`My Practice: ${trace.practice.id}@${trace.practice.revision}`);
  }
  return lines.join("\n");
}

export async function writeTraceView({ root, trace }) {
  const mutator = await createWorkspaceMutator(root ?? process.cwd());
  const workspace = mutator.root;
  const id = String(trace.target.id)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artifact";
  const output = path.join(
    workspace,
    ".silver",
    "results",
    "traces",
    `${id}.md`,
  );
  await mutator.write(path.relative(workspace, output), `# ${trace.target.id}\n\n${renderTrace(trace)}\n`);
  return path.relative(workspace, output).split(path.sep).join("/");
}
