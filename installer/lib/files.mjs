import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function integrity(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function resolveInside(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const prefix = `${resolvedRoot}${path.sep}`;
  if (resolved !== resolvedRoot && !resolved.startsWith(prefix)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  return resolved;
}

export async function readUtf8(filePath) {
  return readFile(filePath, "utf8");
}

export async function writeNewFile(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
}

export async function copyNewTree(sourceRoot, destinationRoot) {
  const created = [];

  async function visit(sourceDirectory, relativeDirectory = "") {
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name === ".DS_Store") {
        continue;
      }
      const relativePath = path.join(relativeDirectory, entry.name);
      const source = path.join(sourceDirectory, entry.name);
      const destination = path.join(destinationRoot, relativePath);
      if (entry.isDirectory()) {
        await visit(source, relativePath);
      } else if (entry.isFile() && !(await exists(destination))) {
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(source, destination, 0);
        created.push(relativePath);
      }
    }
  }

  await visit(sourceRoot);
  return created;
}

export async function listTopLevel(root) {
  if (!(await exists(root))) {
    return [];
  }
  return readdir(root);
}

export async function treeIntegrity(root) {
  const hash = createHash("sha256");
  const snapshot = await snapshotFiles(root);
  const entries = [...snapshot.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  for (const [relativePath, content] of entries) {
    hash.update(relativePath.split(path.sep).join("/"));
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

export async function snapshotFiles(root) {
  const output = new Map();

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === ".DS_Store") {
        continue;
      }
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        output.set(path.relative(root, absolute), await readFile(absolute));
      }
    }
  }

  if ((await exists(root)) && (await stat(root)).isDirectory()) {
    await visit(root);
  }
  return output;
}
