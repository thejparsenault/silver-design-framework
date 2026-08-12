import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { parse, stringify } from "yaml";

import { assertV2 } from "../framework/runtime/contracts.mjs";
import { createCheckpoint } from "./checkpoint.mjs";
import { resolveDesignContext } from "./context.mjs";
import { findPinnedDependents } from "./lib/dependents.mjs";
import {
  exists,
  readUtf8,
  resolveInside,
  snapshotFiles,
  writeUtf8,
} from "./lib/files.mjs";

const run = promisify(execFile);

async function gitHead(root) {
  try {
    const result = await run("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
    });
    return result.stdout.trim();
  } catch {
    return null;
  }
}

// A registered reference is stored relative to the workspace so a clone
// keeps working from wherever it lands; resolving it against process.cwd()
// instead of the workspace root would silently work only when Silver
// happens to be invoked from the workspace directory itself.
function resolveSourceReference(root, reference) {
  return path.isAbsolute(reference)
    ? reference
    : path.resolve(path.resolve(root), reference);
}

export async function linkedSourceIntegrity(root, selectedPaths) {
  const base = path.resolve(root);
  const hash = createHash("sha256");
  for (const selected of [...selectedPaths].sort()) {
    const absolute = resolveInside(base, selected);
    if (!(await exists(absolute))) {
      throw new Error(`Linked source path does not exist: ${selected}`);
    }
    const metadata = await stat(absolute);
    if (metadata.isDirectory()) {
      const files = [...(await snapshotFiles(absolute)).entries()].sort(
        ([left], [right]) => left.localeCompare(right),
      );
      for (const [relative, content] of files) {
        hash.update(`${selected}/${relative}`.split(path.sep).join("/"));
        hash.update("\0");
        hash.update(content);
        hash.update("\0");
      }
    } else {
      hash.update(selected.split(path.sep).join("/"));
      hash.update("\0");
      hash.update(await readFile(absolute));
      hash.update("\0");
    }
  }
  return `sha256:${hash.digest("hex")}`;
}

async function verifyLinkedSource(root, source) {
  await assertV2("linked-source.schema.json", source);
  const reference = resolveSourceReference(root, source.source.reference);
  const observedIntegrity = await linkedSourceIntegrity(
    reference,
    source.source.paths,
  );
  if (observedIntegrity !== source.source.integrity) {
    throw new Error(
      `Linked ${source.kind} source ${source.id} changed since review; inspect and re-pin it.`,
    );
  }
  if (source.source.type === "git") {
    const revision = await gitHead(reference);
    if (revision !== source.source.revision) {
      throw new Error(
        `Linked ${source.kind} source ${source.id} is not at reviewed commit ${source.source.revision}.`,
      );
    }
  }
}

export async function writeSourceRegistry(root, sources) {
  for (const source of sources) await verifyLinkedSource(root, source);
  const file = path.join(
    path.resolve(root),
    "design",
    "sources",
    "sources.yaml",
  );
  await writeUtf8(
    file,
    stringify({ schema: "silver/source-registry/v1", sources }),
  );
  return file;
}

export async function inspectLinkedSources(root) {
  const file = path.join(
    path.resolve(root),
    "design",
    "sources",
    "sources.yaml",
  );
  if (!(await exists(file))) return [];
  const registry = parse(await readUtf8(file));
  if (
    registry?.schema !== "silver/source-registry/v1" ||
    !Array.isArray(registry.sources)
  ) {
    throw new Error("Linked source registry does not declare the v1 contract.");
  }
  const results = [];
  for (const source of registry.sources) {
    await assertV2("linked-source.schema.json", source);
    const reference = resolveSourceReference(root, source.source.reference);
    if (!(await exists(reference))) {
      results.push({
        id: source.id,
        kind: source.kind,
        authority: source.authority,
        state: "unavailable",
        recorded_revision: source.source.revision,
        reference: source.source.reference,
        ...(source.source.reference_hint
          ? { reference_hint: source.source.reference_hint }
          : {}),
      });
      continue;
    }
    let observedIntegrity;
    try {
      observedIntegrity = await linkedSourceIntegrity(
        reference,
        source.source.paths,
      );
    } catch {
      results.push({
        id: source.id,
        kind: source.kind,
        authority: source.authority,
        state: "unavailable",
        recorded_revision: source.source.revision,
        reference: source.source.reference,
        ...(source.source.reference_hint
          ? { reference_hint: source.source.reference_hint }
          : {}),
      });
      continue;
    }
    const observedRevision =
      source.source.type === "git"
        ? await gitHead(reference)
        : `snapshot-${observedIntegrity.slice(7, 19)}`;
    const current =
      observedIntegrity === source.source.integrity &&
      (source.source.type !== "git" ||
        observedRevision === source.source.revision);
    const staleDependents = current
      ? []
      : await findPinnedDependents({
          root,
          field: "linked_sources",
          id: source.id,
          revision: source.source.revision,
          integrity: source.source.integrity,
        });
    results.push({
      id: source.id,
      kind: source.kind,
      authority: source.authority,
      state: current ? "current" : "external-changed",
      recorded_revision: source.source.revision,
      observed_revision: observedRevision ?? "unverified",
      observed_integrity: observedIntegrity,
      ...(current
        ? {}
        : {
            repin_proposal: {
              ...source,
              source: {
                ...source.source,
                revision: observedRevision ?? source.source.revision,
                integrity: observedIntegrity,
              },
            },
            stale_dependents: staleDependents,
          }),
    });
  }
  return results;
}

export async function applySourceRepin({
  root,
  proposal,
  now = new Date().toISOString(),
}) {
  const workspace = path.resolve(root);
  await verifyLinkedSource(workspace, proposal);
  const file = path.join(workspace, "design", "sources", "sources.yaml");
  const registry = parse(await readUtf8(file));
  const index = (registry.sources ?? []).findIndex(
    ({ id }) => id === proposal.id,
  );
  if (index < 0) throw new Error(`Linked source ${proposal.id} is not registered.`);
  const previous = registry.sources[index];
  const staleDependents = await findPinnedDependents({
    root: workspace,
    field: "linked_sources",
    id: previous.id,
    revision: previous.source.revision,
    integrity: previous.source.integrity,
  });
  registry.sources[index] = proposal;
  await writeUtf8(file, stringify(registry));
  const checkpoint = await createCheckpoint({
    root: workspace,
    id: `source-${proposal.id}-${proposal.source.revision}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+$/g, ""),
    reason: "workspace-configuration",
    paths: ["design/sources/sources.yaml"],
    now,
  });
  return { source: proposal, checkpoint, stale_dependents: staleDependents };
}

function slugify(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[a-z]/.test(slug) ? slug : `codebase-${slug}`;
}

function nextRevision(revision) {
  const value = Number(revision.slice(1));
  if (!Number.isInteger(value)) throw new Error(`Unsupported revision: ${revision}`);
  return `r${value + 1}`;
}

// `silver link` registers an external codebase as a pinned linked-source and,
// where exactly one active design context exists, records the link on its
// `codebase` field. It never moves, renames, or reads into the target beyond
// what integrity hashing requires — the codebase stays exactly what it was.
export async function linkCodebase({
  root,
  targetPath,
  as,
  linkedBy = "silver-link",
  now = new Date().toISOString(),
}) {
  const workspace = path.resolve(root);
  const absoluteTarget = path.resolve(process.cwd(), targetPath);
  if (!(await exists(absoluteTarget))) {
    throw new Error(`No such path to link: ${targetPath}`);
  }
  const id = as ?? slugify(path.basename(absoluteTarget));

  const file = path.join(workspace, "design", "sources", "sources.yaml");
  const registry = (await exists(file))
    ? parse(await readUtf8(file))
    : { schema: "silver/source-registry/v1", sources: [] };
  if ((registry.sources ?? []).some((source) => source.id === id)) {
    throw new Error(
      `A source named ${id} is already linked; choose a different --as id.`,
    );
  }

  const revision = await gitHead(absoluteTarget);
  const paths = ["."];
  const linked = {
    schema: "silver/linked-source/v1",
    id,
    title: path.basename(absoluteTarget),
    kind: "codebase",
    source: {
      type: revision ? "git" : "local",
      reference: path.relative(workspace, absoluteTarget) || ".",
      reference_hint: absoluteTarget,
      revision: revision ?? "local",
      integrity: await linkedSourceIntegrity(absoluteTarget, paths),
      paths,
    },
    authority: "external-authoritative",
    scope: {},
    linked_at: now,
    linked_by: linkedBy,
  };

  registry.sources = [...(registry.sources ?? []), linked];
  await writeSourceRegistry(workspace, registry.sources);
  const checkpointPaths = ["design/sources/sources.yaml"];

  let updatedContext = null;
  const resolved = await resolveDesignContext({ root: workspace });
  if (resolved.status === "resolved") {
    const contextPath = path.join(workspace, resolved.context.path);
    const context = parse(await readUtf8(contextPath));
    context.codebase = { ...context.codebase, linked_source: id };
    context.revision = nextRevision(context.revision);
    await assertV2("design-context.schema.json", context);
    await writeUtf8(contextPath, stringify(context));
    checkpointPaths.push(resolved.context.path);
    updatedContext = { id: context.id, revision: context.revision, path: resolved.context.path };
  }

  const checkpoint = await createCheckpoint({
    root: workspace,
    id: `link-${id}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+$/g, ""),
    reason: "workspace-configuration",
    paths: checkpointPaths,
    now,
  });

  return { source: linked, design_context: updatedContext, checkpoint };
}
