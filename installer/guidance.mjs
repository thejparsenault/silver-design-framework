import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
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

async function selectedIntegrity(root, selectedPaths) {
  const base = path.resolve(root);
  const hash = createHash("sha256");
  for (const selected of [...selectedPaths].sort()) {
    const absolute = resolveInside(base, selected);
    if (!(await exists(absolute))) {
      throw new Error(`Linked guidance path does not exist: ${selected}`);
    }
    const metadata = await stat(absolute);
    if (metadata.isDirectory()) {
      for (const [relative, content] of [
        ...(await snapshotFiles(absolute)).entries(),
      ].sort(([left], [right]) => left.localeCompare(right))) {
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

function snapshotKey(source) {
  return createHash("sha256")
    .update(source.source.revision)
    .digest("hex")
    .slice(0, 16);
}

async function copySelectedSnapshot(workspace, source) {
  const snapshotRoot = path.join(
    workspace,
    ".silver",
    "guidance",
    source.id,
    snapshotKey(source),
  );
  if (await exists(snapshotRoot)) {
    const observed = await selectedIntegrity(
      snapshotRoot,
      source.source.paths,
    );
    if (observed !== source.source.integrity) {
      throw new Error(
        `Existing guidance snapshot for ${source.id} differs from its recorded integrity.`,
      );
    }
    return snapshotRoot;
  }
  for (const selected of source.source.paths) {
    const upstream = resolveInside(source.source.reference, selected);
    const destination = resolveInside(snapshotRoot, selected);
    const metadata = await stat(upstream);
    if (metadata.isDirectory()) {
      for (const [relative, content] of await snapshotFiles(upstream)) {
        const file = resolveInside(destination, relative);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content, { flag: "wx" });
      }
    } else {
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(upstream, destination);
    }
  }
  return snapshotRoot;
}

async function prepareGuidanceSource(workspace, source) {
  await assertV2("guidance-source.schema.json", source);
  const observed = await selectedIntegrity(
    source.source.reference,
    source.source.paths,
  );
  if (observed !== source.source.integrity) {
    throw new Error(
      `Guidance source ${source.id} changed since review; inspect and re-pin it.`,
    );
  }
  if (source.source.type === "git") {
    const revision = await gitHead(source.source.reference);
    if (revision !== source.source.revision) {
      throw new Error(
        `Guidance source ${source.id} is not at reviewed commit ${source.source.revision}.`,
      );
    }
  } else {
    await copySelectedSnapshot(workspace, source);
  }
}

export async function writeGuidanceRegistry(root, sources) {
  const workspace = path.resolve(root);
  for (const source of sources) {
    await prepareGuidanceSource(workspace, source);
  }
  const file = path.join(workspace, "design", "guidance", "sources.yaml");
  await writeUtf8(file, stringify({ schema: "silver/guidance-registry/v1", sources }));
  return file;
}

export async function applyGuidanceRepin({
  root,
  proposal,
  now = new Date().toISOString(),
}) {
  const workspace = path.resolve(root);
  await prepareGuidanceSource(workspace, proposal);
  const file = path.join(workspace, "design", "guidance", "sources.yaml");
  const registry = parse(await readUtf8(file));
  const index = (registry.sources ?? []).findIndex(
    ({ id }) => id === proposal.id,
  );
  if (index < 0) {
    throw new Error(`Guidance source ${proposal.id} is not linked.`);
  }
  const previous = registry.sources[index];
  const staleDependents = await findPinnedDependents({
    root: workspace,
    field: "guidance",
    id: previous.id,
    revision: previous.source.revision,
    integrity: previous.source.integrity,
  });
  registry.sources[index] = proposal;
  await writeUtf8(file, stringify(registry));
  const checkpoint = await createCheckpoint({
    root: workspace,
    id: `guidance-${proposal.id}-${proposal.source.revision}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+$/g, ""),
    reason: "guidance-change",
    paths: [
      "design/guidance/sources.yaml",
      ...(proposal.source.type === "local-snapshot"
        ? [`.silver/guidance/${proposal.id}/${snapshotKey(proposal)}`]
        : []),
    ],
    now,
  });
  return { source: proposal, checkpoint, stale_dependents: staleDependents };
}

export async function inspectGuidanceSources(root) {
  const workspace = path.resolve(root);
  const file = path.join(workspace, "design", "guidance", "sources.yaml");
  if (!(await exists(file))) return [];
  const registry = parse(await readUtf8(file));
  const results = [];
  for (const source of registry.sources ?? []) {
    await assertV2("guidance-source.schema.json", source);
    const reference = path.resolve(source.source.reference);
    if (!(await exists(reference))) {
      results.push({
        id: source.id,
        influence: source.influence,
        state: "unavailable",
        recorded_revision: source.source.revision,
      });
      continue;
    }
    let observedIntegrity;
    try {
      observedIntegrity = await selectedIntegrity(
        reference,
        source.source.paths,
      );
    } catch {
      results.push({
        id: source.id,
        influence: source.influence,
        state: "unavailable",
        recorded_revision: source.source.revision,
      });
      continue;
    }
    if (source.source.type === "git") {
      const revision = await gitHead(reference);
      const current =
        revision === source.source.revision &&
        observedIntegrity === source.source.integrity;
      const staleDependents = current
        ? []
        : await findPinnedDependents({
            root: workspace,
            field: "guidance",
            id: source.id,
            revision: source.source.revision,
            integrity: source.source.integrity,
          });
      results.push({
        id: source.id,
        influence: source.influence,
        state: current ? "current" : "external-changed",
        recorded_revision: source.source.revision,
        observed_revision: revision ?? "unverified",
        observed_integrity: observedIntegrity,
        ...(current
          ? {}
          : {
              repin_proposal: {
                ...source,
                source: {
                  ...source.source,
                  revision: revision ?? source.source.revision,
                  integrity: observedIntegrity,
                },
              },
              stale_dependents: staleDependents,
            }),
      });
      continue;
    }
    const snapshotRoot = path.join(
      workspace,
      ".silver",
      "guidance",
      source.id,
      snapshotKey(source),
    );
    const snapshotIntegrity = (await exists(snapshotRoot))
      ? await selectedIntegrity(snapshotRoot, source.source.paths)
      : null;
    const current = observedIntegrity === source.source.integrity;
    const staleDependents = current
      ? []
      : await findPinnedDependents({
          root: workspace,
          field: "guidance",
          id: source.id,
          revision: source.source.revision,
          integrity: source.source.integrity,
        });
    results.push({
      id: source.id,
      influence: source.influence,
      state: current ? "current" : "external-changed",
      recorded_revision: source.source.revision,
      observed_integrity: observedIntegrity,
      snapshot_state:
        snapshotIntegrity === source.source.integrity ? "current" : "invalid",
      ...(current
        ? {}
        : {
            repin_proposal: {
              ...source,
              source: {
                ...source.source,
                revision: `snapshot-${observedIntegrity.slice(7, 19)}`,
                integrity: observedIntegrity,
              },
            },
            stale_dependents: staleDependents,
          }),
    });
  }
  return results;
}
