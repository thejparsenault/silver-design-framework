// Generic detection for CLI/API/SDK transports that declare `interface.detection`
// instead of a `connection` block Silver can inspect directly.
//
// This is what makes a CLI tool visible at all: before this, `declaredAvailability()`
// returned "declares no connection Silver can inspect" for anything without an MCP or
// host-native connection, which made every CLI-only transport permanently undetectable.
//
// `pathEntries` and `env` are always injectable rather than read from `process.env`
// directly, so a test can make availability deterministic instead of depending on
// whatever happens to be on the machine running it.
import { access } from "node:fs/promises";
import path from "node:path";

function pathEntriesFrom(options = {}) {
  if (options.pathEntries) return options.pathEntries;
  const raw = options.env?.PATH ?? process.env.PATH ?? "";
  return raw.split(path.delimiter).filter(Boolean);
}

const WINDOWS_EXTENSIONS = [".exe", ".cmd", ".bat", ""];

export async function detectExecutable(name, options = {}) {
  const entries = pathEntriesFrom(options);
  const extensions = process.platform === "win32" ? WINDOWS_EXTENSIONS : [""];
  for (const dir of entries) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${name}${extension}`);
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Not here; keep looking.
      }
    }
  }
  return null;
}

export function detectEnv(names = [], options = {}) {
  const env = options.env ?? process.env;
  return names.filter((name) => env[name] !== undefined);
}

export async function detectFiles(names = [], options = {}) {
  if (!options.root) return [];
  const found = [];
  for (const name of names) {
    try {
      await access(path.join(path.resolve(options.root), name));
      found.push(name);
    } catch {
      // Not here; keep looking.
    }
  }
  return found;
}

export async function detectInterface(detection = {}, options = {}) {
  const executables = [];
  for (const name of detection.executables ?? []) {
    if (await detectExecutable(name, options)) executables.push(name);
  }
  return {
    executables,
    env: detectEnv(detection.env, options),
    files: await detectFiles(detection.files, options),
  };
}
