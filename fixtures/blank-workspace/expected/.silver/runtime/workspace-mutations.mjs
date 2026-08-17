import { randomUUID, createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import path from "node:path";

const TRANSIENT_WINDOWS_ERRORS = new Set(["EBUSY", "EPERM", "EACCES"]);
const DEFAULT_RETRIES = 8;

const digest = (content) =>
  `sha256:${createHash("sha256").update(content).digest("hex")}`;

function portable(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function assertRelative(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error("Workspace mutation paths must be non-empty relative paths.");
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Workspace mutation path must be relative: ${relativePath}`);
  }
  const normalized = path.normalize(relativePath);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  return normalized;
}

async function missingOkay(filePath) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function retryRename(from, to, retries = DEFAULT_RETRIES) {
  let attempt = 0;
  while (true) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (
        process.platform !== "win32" ||
        !TRANSIENT_WINDOWS_ERRORS.has(error.code) ||
        attempt >= retries
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
      attempt += 1;
    }
  }
}

export async function canonicalWorkspaceRoot(root, { create = false } = {}) {
  const lexical = path.resolve(root);
  if (create) await mkdir(lexical, { recursive: true });
  const canonical = await realpath(lexical);
  const info = await lstat(canonical);
  if (!info.isDirectory()) throw new Error(`Workspace root is not a directory: ${root}`);
  return canonical;
}

export class UnsafeWorkspacePathError extends Error {
  constructor(relativePath, detail) {
    super(`Unsafe workspace path ${portable(relativePath)}: ${detail}`);
    this.name = "UnsafeWorkspacePathError";
    this.code = "SILVER_UNSAFE_WORKSPACE_PATH";
    this.path = portable(relativePath);
  }
}

export async function inspectWorkspacePath(root, relativePath, { allowLeafLink = false } = {}) {
  const canonicalRoot = await canonicalWorkspaceRoot(root);
  const relative = assertRelative(relativePath);
  const parts = relative.split(path.sep).filter(Boolean);
  let cursor = canonicalRoot;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    const info = await missingOkay(cursor);
    if (!info) break;
    const leaf = index === parts.length - 1;
    if (info.isSymbolicLink()) {
      if (leaf && allowLeafLink) continue;
      return {
        safe: false,
        root: canonicalRoot,
        path: portable(relative),
        unsafe_at: portable(path.relative(canonicalRoot, cursor)),
        reason: "symbolic-link-or-junction",
      };
    }
    // On Windows, junctions and other reparse points are reported as symbolic
    // links by lstat. The realpath check also catches aliases Node exposes as
    // ordinary directories on a platform-specific filesystem.
    const resolved = await realpath(cursor);
    const prefix = `${canonicalRoot}${path.sep}`;
    if (resolved !== canonicalRoot && !resolved.startsWith(prefix)) {
      return {
        safe: false,
        root: canonicalRoot,
        path: portable(relative),
        unsafe_at: portable(path.relative(canonicalRoot, cursor)),
        reason: "real-path-escape",
      };
    }
  }
  return { safe: true, root: canonicalRoot, path: portable(relative) };
}

export async function createWorkspaceMutator(root, options = {}) {
  const lexicalRoot = path.resolve(root);
  const canonicalRoot = await canonicalWorkspaceRoot(root, {
    create: Boolean(options.createRoot),
  });

  const absolute = (relativePath) => path.join(canonicalRoot, assertRelative(relativePath));

  const relative = (absolutePath) => {
    const resolved = path.resolve(absolutePath);
    for (const base of [canonicalRoot, lexicalRoot]) {
      const candidate = path.relative(base, resolved);
      if (candidate && candidate !== ".." && !candidate.startsWith(`..${path.sep}`) && !path.isAbsolute(candidate)) {
        return candidate;
      }
    }
    throw new Error(`Path is outside the workspace: ${absolutePath}`);
  };

  async function assertSafe(relativePath, inspectOptions = {}) {
    const result = await inspectWorkspacePath(canonicalRoot, relativePath, inspectOptions);
    if (!result.safe) {
      throw new UnsafeWorkspacePathError(relativePath, `${result.reason} at ${result.unsafe_at}`);
    }
    return result;
  }

  async function ensureDirectory(relativePath) {
    const relative = assertRelative(relativePath);
    const parts = relative.split(path.sep).filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? path.join(current, part) : part;
      await assertSafe(current);
      try {
        await mkdir(absolute(current));
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
      const info = await lstat(absolute(current));
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new UnsafeWorkspacePathError(current, "expected a real directory");
      }
      await assertSafe(current);
    }
    return absolute(relative);
  }

  async function atomicWrite(relativePath, content, writeOptions = {}) {
    const relative = assertRelative(relativePath);
    await assertSafe(relative);
    const destination = absolute(relative);
    const previous = await missingOkay(destination);
    if (writeOptions.createOnly && previous) {
      const error = new Error(`EEXIST: refusing to replace existing workspace path: ${portable(relative)}`);
      error.code = "EEXIST";
      throw error;
    }
    if (previous?.isDirectory()) {
      throw new Error(`Refusing to replace directory with file: ${portable(relative)}`);
    }
    if (previous) {
      const current = await readFile(destination);
      if (!writeOptions.expectedIntegrity || digest(current) !== writeOptions.expectedIntegrity) {
        if (writeOptions.expectedIntegrity !== undefined) {
          throw new Error(`Workspace path changed since inspection: ${portable(relative)}`);
        }
      }
    } else if (writeOptions.expectedIntegrity) {
      throw new Error(`Expected workspace path is missing: ${portable(relative)}`);
    }
    const parent = path.dirname(relative);
    if (parent !== ".") await ensureDirectory(parent);
    await assertSafe(relative);
    const temporaryRelative = path.join(
      parent === "." ? "" : parent,
      `.${path.basename(relative)}.silver-${process.pid}-${randomUUID()}.tmp`,
    );
    const temporary = absolute(temporaryRelative);
    let handle;
    try {
      const mode = writeOptions.mode ?? (previous ? previous.mode & 0o777 : 0o644);
      handle = await open(temporary, "wx", mode);
      await handle.writeFile(content, writeOptions.encoding ?? "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      if (options.beforeCommit) {
        await options.beforeCommit({ root: canonicalRoot, path: portable(relative) });
      }
      await assertSafe(parent === "." ? relative : parent);
      await assertSafe(relative);
      await retryRename(temporary, destination, writeOptions.renameRetries);
      await assertSafe(relative);
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
    return { path: portable(relative), integrity: digest(Buffer.from(content)) };
  }

  async function remove(relativePath, removeOptions = {}) {
    const relative = assertRelative(relativePath);
    await assertSafe(relative, { allowLeafLink: Boolean(removeOptions.allowLeafLink) });
    if (removeOptions.expectedIntegrity) {
      const current = await readFile(absolute(relative));
      if (digest(current) !== removeOptions.expectedIntegrity) {
        throw new Error(`Workspace path changed since inspection: ${portable(relative)}`);
      }
    }
    await options.beforeCommit?.({ root: canonicalRoot, path: portable(relative), operation: "remove" });
    await assertSafe(relative, { allowLeafLink: Boolean(removeOptions.allowLeafLink) });
    await rm(absolute(relative), {
      force: removeOptions.force ?? true,
      recursive: removeOptions.recursive ?? false,
    });
  }

  async function copyTree(sourceRoot, destinationRelative, copyOptions = {}) {
    const destination = assertRelative(destinationRelative);
    const created = [];
    async function visit(sourceDirectory, relativeDirectory = "") {
      const entries = await readdir(sourceDirectory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        if (entry.name === ".DS_Store") continue;
        const source = path.join(sourceDirectory, entry.name);
        const nested = path.join(relativeDirectory, entry.name);
        const target = path.join(destination, nested);
        if (entry.isSymbolicLink()) {
          throw new Error(`Payload trees may not contain symbolic links: ${portable(nested)}`);
        }
        if (entry.isDirectory()) {
          await ensureDirectory(target);
          await visit(source, nested);
        } else if (entry.isFile()) {
          const existing = await missingOkay(absolute(target));
          if (existing && !copyOptions.replace) continue;
          const content = await readFile(source);
          await atomicWrite(target, content, {
            encoding: null,
            createOnly: !copyOptions.replace,
            ...(existing && copyOptions.expectedIntegrities?.[portable(nested)]
              ? { expectedIntegrity: copyOptions.expectedIntegrities[portable(nested)] }
              : {}),
          });
          created.push(portable(nested));
        }
      }
    }
    await assertSafe(destination);
    const sourceInfo = await missingOkay(sourceRoot);
    if (!sourceInfo) return created;
    if (!sourceInfo.isDirectory()) throw new Error(`Tree source is not a directory: ${sourceRoot}`);
    await ensureDirectory(destination);
    await visit(sourceRoot);
    return created;
  }

  async function replaceTree(sourceRoot, destinationRelative) {
    const destination = assertRelative(destinationRelative);
    const parent = path.dirname(destination);
    if (parent !== ".") await ensureDirectory(parent);
    await assertSafe(destination);
    const stageRelative = path.join(parent === "." ? "" : parent, `.${path.basename(destination)}.silver-stage-${randomUUID()}`);
    const backupRelative = path.join(parent === "." ? "" : parent, `.${path.basename(destination)}.silver-preimage-${randomUUID()}`);
    await ensureDirectory(stageRelative);
    try {
      await copyTree(sourceRoot, stageRelative, { replace: false });
      await options.beforeCommit?.({ root: canonicalRoot, path: portable(destination), operation: "replace-tree" });
      await assertSafe(destination);
      const existing = await missingOkay(absolute(destination));
      if (existing) await retryRename(absolute(destination), absolute(backupRelative));
      try {
        await retryRename(absolute(stageRelative), absolute(destination));
      } catch (error) {
        if (existing) await retryRename(absolute(backupRelative), absolute(destination));
        throw error;
      }
      if (existing) await rm(absolute(backupRelative), { recursive: true, force: true });
    } catch (error) {
      await rm(absolute(stageRelative), { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  async function managedSkillLink(relativePath, targetRelative) {
    const relative = assertRelative(relativePath);
    if (typeof targetRelative !== "string" || !targetRelative || path.isAbsolute(targetRelative)) {
      throw new Error("Managed link targets must be relative paths.");
    }
    const target = path.normalize(targetRelative);
    if (!/^\.claude[\\/]skills[\\/]silver-[^\\/]+$/.test(relative)) {
      throw new Error("Managed links are limited to .claude/skills/silver-* leaves.");
    }
    const resolvedTarget = path.resolve(path.dirname(absolute(relative)), target);
    const skillsRoot = path.join(canonicalRoot, ".skills");
    if (resolvedTarget !== skillsRoot && !resolvedTarget.startsWith(`${skillsRoot}${path.sep}`)) {
      throw new Error("Managed Claude skill links must resolve into .skills/.");
    }
    await ensureDirectory(path.dirname(relative));
    await assertSafe(relative, { allowLeafLink: true });
    const existing = await missingOkay(absolute(relative));
    if (existing) await remove(relative, { recursive: true, allowLeafLink: true });
    await options.beforeCommit?.({ root: canonicalRoot, path: portable(relative), operation: "managed-link" });
    await assertSafe(path.dirname(relative));
    await assertSafe(relative, { allowLeafLink: true });
    await symlink(target, absolute(relative), "dir");
    const actual = await readlink(absolute(relative));
    if (actual !== target) throw new Error(`Managed link verification failed: ${portable(relative)}`);
    return { path: portable(relative), target: portable(target) };
  }

  return Object.freeze({
    root: canonicalRoot,
    absolute,
    relative,
    assertSafe,
    ensureDirectory,
    create: (relativePath, content, options = {}) =>
      atomicWrite(relativePath, content, { ...options, createOnly: true }),
    replace: (relativePath, content, expectedIntegrity, options = {}) =>
      atomicWrite(relativePath, content, { ...options, expectedIntegrity }),
    write: atomicWrite,
    copyTree,
    replaceTree,
    remove,
    managedSkillLink,
  });
}

export const workspaceContentIntegrity = digest;
export { retryRename as retryWorkspaceRename };
