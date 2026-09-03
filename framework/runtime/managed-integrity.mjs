import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";

const skippedDirectories = new Set([
  ".cache", ".git", ".parcel-cache", ".turbo", ".vite",
  "bower_components", "node_modules",
]);

function sha(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function inside(root, relative) {
  const workspace = path.resolve(root);
  const absolute = path.resolve(workspace, relative);
  if (absolute === workspace || !absolute.startsWith(`${workspace}${path.sep}`)) {
    throw new Error(`Path escapes workspace: ${relative}`);
  }
  return absolute;
}

async function treeIntegrity(root) {
  const hash = createHash("sha256");
  const entries = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const metadata = await lstat(absolute);
      if (metadata.isDirectory()) await visit(absolute);
      else if (metadata.isFile()) entries.push([relative, await readFile(absolute)]);
      else if (metadata.isSymbolicLink()) entries.push([relative, Buffer.from(`symlink:${await readlink(absolute)}`)]);
    }
  }
  await visit(root);
  for (const [relative, content] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(relative);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

async function present(absolute) {
  try {
    return await lstat(absolute);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function inspectManagedIntegrity(root, lock) {
  const workspace = path.resolve(root);
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
    return [{
      code: "managed-lock-invalid",
      path: ".silver/lock.yaml",
      message: "Managed package integrity cannot be verified because the parsed lock is unavailable.",
    }];
  }
  const issues = [];
  for (const installed of lock.packages ?? []) {
    if (installed.ownership !== "framework-managed") continue;
    let absolute;
    try {
      absolute = inside(workspace, installed.path);
    } catch (error) {
      issues.push({ code: "unsafe-managed-path", path: installed.path, message: error.message });
      continue;
    }
    const metadata = await present(absolute);
    if (!metadata?.isDirectory()) {
      issues.push({ code: "missing-package", path: installed.path, message: "Installed framework-managed package does not exist as a directory." });
      continue;
    }
    if ((await treeIntegrity(absolute)) !== installed.integrity) {
      issues.push({ code: "managed-package-stale", path: installed.path, message: "Framework-managed package differs from the integrity recorded in the lock." });
    }
  }
  for (const managed of lock.managed_files ?? []) {
    let absolute;
    try {
      absolute = inside(workspace, managed.path);
    } catch (error) {
      issues.push({ code: "unsafe-managed-path", path: managed.path, message: error.message });
      continue;
    }
    const metadata = await present(absolute);
    if (!metadata?.isFile()) {
      issues.push({ code: "missing-managed-file", path: managed.path, message: "Managed file does not exist." });
      continue;
    }
    if (sha(await readFile(absolute)) !== managed.base_integrity) {
      issues.push({ code: "managed-file-stale", path: managed.path, message: "Managed file differs from the integrity recorded in the lock." });
    }
  }
  return issues;
}

export async function assertManagedSkillIntegrity(root, skillId, lock) {
  const target = `.skills/${skillId}`;
  const issue = (await inspectManagedIntegrity(root, lock)).find(
    ({ path: issuePath }) => issuePath === target || issuePath === ".silver/lock.yaml",
  );
  if (issue) {
    throw new Error(`${issue.code} ${issue.path}: ${issue.message} Run \`silver repair\` or \`silver update\` before invoking this skill.`);
  }
}
