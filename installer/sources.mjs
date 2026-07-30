import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { parse, stringify } from "yaml";

import { assertV2 } from "../framework/runtime/contracts.mjs";
import { createCheckpoint } from "./checkpoint.mjs";
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

async function verifyLinkedSource(source) {
  await assertV2("linked-source.schema.json", source);
  const observedIntegrity = await linkedSourceIntegrity(
    source.source.reference,
    source.source.paths,
  );
  if (observedIntegrity !== source.source.integrity) {
    throw new Error(
      `Linked ${source.kind} source ${source.id} changed since review; inspect and re-pin it.`,
    );
  }
  if (source.source.type === "git") {
    const revision = await gitHead(source.source.reference);
    if (revision !== source.source.revision) {
      throw new Error(
        `Linked ${source.kind} source ${source.id} is not at reviewed commit ${source.source.revision}.`,
      );
    }
  }
}

export async function writeSourceRegistry(root, sources) {
  for (const source of sources) await verifyLinkedSource(source);
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
    const reference = path.resolve(source.source.reference);
    if (!(await exists(reference))) {
      results.push({
        id: source.id,
        kind: source.kind,
        authority: source.authority,
        state: "unavailable",
        recorded_revision: source.source.revision,
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
  await verifyLinkedSource(proposal);
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
