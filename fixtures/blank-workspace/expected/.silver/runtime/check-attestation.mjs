import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";

export const CHECK_STATE_SCOPE = "workspace-check-inputs/v1";

const ignoredDirectories = new Set([
  ".cache", ".git", ".next", ".nuxt", ".output", ".parcel-cache",
  ".svelte-kit", ".turbo", ".vite", "__pycache__", "bower_components",
  "build", "coverage", "dist", "node_modules", "out", "target", "vendor",
]);

const ignoredResultDirectories = new Set([
  ".silver/results/checks",
  ".silver/results/resume",
  ".silver/results/skills",
  ".silver/results/traces",
]);

function portable(value) {
  return value.split(path.sep).join("/");
}

export async function workspaceCheckStateDigest(root) {
  const workspace = path.resolve(root);
  const hash = createHash("sha256");

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = portable(path.relative(workspace, absolute));
      if (
        entry.isDirectory() &&
        [...ignoredResultDirectories].some(
          (ignored) => relative === ignored || relative.startsWith(`${ignored}/`),
        )
      ) {
        continue;
      }
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) {
        hash.update(`link\0${relative}\0${await readlink(absolute)}\0`);
      } else if (metadata.isDirectory()) {
        await visit(absolute);
      } else if (metadata.isFile()) {
        hash.update(`file\0${relative}\0`);
        hash.update(await readFile(absolute));
        hash.update("\0");
      }
    }
  }

  await visit(workspace);
  return `sha256:${hash.digest("hex")}`;
}

export function attestCheckResults(results, stateDigest, completedAt = new Date().toISOString()) {
  return results.map((result) => ({
    ...result,
    completed_at: completedAt,
    state_scope: CHECK_STATE_SCOPE,
    state_digest: stateDigest,
  }));
}

export function unstableCheckResults(results, completedAt = new Date().toISOString()) {
  return results.map((result) => ({
    ...result,
    status: "error",
    completed_at: completedAt,
    state_scope: CHECK_STATE_SCOPE,
    findings: [],
    coverage: {
      ...result.coverage,
      reason: "Workspace state changed while the check suite was running.",
    },
    execution_error: {
      stage: "inspection",
      message: "Workspace state changed while the check suite was running; no stable state was attested.",
    },
  }));
}
