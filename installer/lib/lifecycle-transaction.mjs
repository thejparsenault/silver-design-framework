import { randomUUID } from "node:crypto";
import { lstat, readdir, readlink } from "node:fs/promises";
import path from "node:path";

import { snapshotFiles } from "./files.mjs";
import { createWorkspaceMutator, workspaceContentIntegrity } from "../../framework/runtime/workspace-mutations.mjs";
import { runWorkspaceTransaction } from "../../framework/runtime/workspace-transactions.mjs";

const INTERNAL_PREFIXES = [
  ".silver/transactions/",
  ".silver/lifecycle-staging/",
];
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", ".cache", ".vite", "dist", "build"]);

const portable = (value) => value.split(path.sep).join("/");

function included(relativePath) {
  const candidate = portable(relativePath);
  return !INTERNAL_PREFIXES.some((prefix) =>
    candidate === prefix.slice(0, -1) || candidate.startsWith(prefix));
}

async function directories(root) {
  const output = new Set();
  async function visit(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const relativePath = portable(path.join(prefix, entry.name));
      if (!included(relativePath)) continue;
      output.add(relativePath);
      await visit(path.join(directory, entry.name), relativePath);
    }
  }
  await visit(root);
  return output;
}

async function snapshot(root) {
  const files = await snapshotFiles(root);
  const output = new Map();
  for (const [relativePath, content] of files) {
    if (!included(relativePath)) continue;
    const info = await lstat(path.join(root, relativePath));
    output.set(portable(relativePath), {
      content,
      integrity: workspaceContentIntegrity(content),
      mode: info.mode & 0o777,
    });
  }
  return output;
}

async function managedLinks(root) {
  const directory = path.join(root, ".claude/skills");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
  const links = new Map();
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) continue;
    const relativePath = `.claude/skills/${entry.name}`;
    links.set(relativePath, await readlink(path.join(root, relativePath)));
  }
  return links;
}

function same(left, right) {
  return Boolean(left && right && left.mode === right.mode && left.content.equals(right.content));
}

/**
 * Runs an existing lifecycle implementation against a disposable in-workspace
 * copy, then activates only the resulting file delta through the durable
 * transaction module. This lets migrate/update keep their well-tested planning
 * implementation while making the activation interface complete-or-recoverable.
 */
export async function runLifecycleTransaction({
  root,
  command,
  mutate,
  validate,
  metadata = {},
  hooks = {},
}) {
  const workspace = path.resolve(root);
  const mutator = await createWorkspaceMutator(workspace);
  for (const managedPath of [".silver", ".skills", "design", "design/system"]) {
    await mutator.assertSafe(managedPath);
  }
  const before = await snapshot(mutator.root);
  const beforeDirectories = await directories(mutator.root);
  const beforeLinks = await managedLinks(mutator.root);
  const stagingId = `${Date.now().toString(36)}-${randomUUID()}`;
  const stagingRelative = `.silver/lifecycle-staging/${stagingId}/workspace`;
  await mutator.ensureDirectory(stagingRelative);
  const stagingRoot = mutator.absolute(stagingRelative);
  const stagingMutator = await createWorkspaceMutator(stagingRoot);
  try {
    for (const [relativePath, entry] of before) {
      await stagingMutator.write(relativePath, entry.content, { mode: entry.mode });
    }
    for (const relativePath of beforeDirectories) await stagingMutator.ensureDirectory(relativePath);
    const stagedResult = await mutate(stagingRoot);
    if (stagedResult?.applied === false || stagedResult?.ok === false) {
      await mutator.remove(`.silver/lifecycle-staging/${stagingId}`, { recursive: true });
      return { stagedResult, transaction: null, operations: [] };
    }
    const after = await snapshot(stagingRoot);
    const afterDirectories = await directories(stagingRoot);
    const afterLinks = await managedLinks(stagingRoot);
    let operations = [];
    const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
    for (const relativePath of paths) {
      const previous = before.get(relativePath);
      const next = after.get(relativePath);
      if (same(previous, next)) continue;
      if (!next) {
        operations.push({
          id: `delete-${operations.length + 1}`,
          type: "delete",
          path: relativePath,
          expectedIntegrity: previous.integrity,
        });
      } else {
        operations.push({
          id: `write-${operations.length + 1}`,
          type: "write",
          path: relativePath,
          content: next.content,
          mode: next.mode,
          ...(previous ? { expectedIntegrity: previous.integrity } : {}),
          lockLast: relativePath === ".silver/lock.yaml",
        });
      }
    }
    for (const [relativePath, target] of afterLinks) {
      if (beforeLinks.get(relativePath) === target) continue;
      operations.push({
        id: `managed-link-${operations.length + 1}`,
        type: "managed-link",
        path: relativePath,
        target,
      });
    }
    for (const relativePath of beforeLinks.keys()) {
      if (afterLinks.has(relativePath)) continue;
      operations.push({
        id: `delete-managed-link-${operations.length + 1}`,
        type: "delete-managed-link",
        path: relativePath,
      });
    }
    const removedDirectories = [...beforeDirectories]
      .filter((relativePath) => !afterDirectories.has(relativePath))
      .sort((left, right) => left.length - right.length)
      .filter((relativePath, index, all) =>
        !all.slice(0, index).some((parent) => relativePath.startsWith(`${parent}/`)));
    if (removedDirectories.length) {
      operations = operations.filter(({ path: operationPath, type }) =>
        type !== "delete" || !removedDirectories.some((directory) =>
          operationPath === directory || operationPath.startsWith(`${directory}/`)));
      for (const relativePath of removedDirectories) {
        operations.push({
          id: `delete-tree-${operations.length + 1}`,
          type: "delete",
          path: relativePath,
        });
      }
    }
    await mutator.remove(`.silver/lifecycle-staging/${stagingId}`, { recursive: true });
    const transaction = operations.length
      ? await runWorkspaceTransaction({
          root: mutator.root,
          command,
          operations,
          metadata,
          validate,
          hooks,
        })
      : null;
    return { stagedResult, transaction, operations: operations.map(({ content, ...item }) => item) };
  } catch (error) {
    await mutator.remove(`.silver/lifecycle-staging/${stagingId}`, { recursive: true }).catch(() => {});
    throw error;
  }
}
