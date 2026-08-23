// Locating the framework payload — the schemas, guardrails, activities,
// providers, and transports the runtime reads at invocation time.
//
// Three shapes have to resolve, and they are genuinely different:
//
//   1. Source and npm execution. The payload sits beside the installer and
//      runtime modules, so it is found relative to this file.
//   2. A compiled native executable. Its dependencies are compiled into the
//      binary but the payload stays external, in the same layout beside the
//      executable; `bin/silver-native.mjs` sets the globals below before
//      importing the CLI.
//   3. The runtime mirror at `.silver/runtime/`. A workspace has no
//      `framework/` directory — its copy of the payload is flattened one level
//      up, so `.silver/` holds `schemas/`, `guardrails/`, `activities/`,
//      `providers/`, and `transports/` as siblings of `runtime/`. Passing
//      `import.meta.url` lets a lookup fall back to that layout by dropping the
//      leading `framework/` (or `installer/`) segment and resolving relative to
//      the calling module.
//
// This module lives in `framework/runtime/` rather than `installer/` precisely
// so that the mirror gets a copy of it as a sibling; `installer/payload.mjs`
// re-exports it for the installer's own callers.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function payloadRoot() {
  if (globalThis.__silverPayloadRoot) {
    return path.resolve(globalThis.__silverPayloadRoot);
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

// `moduleUrl` is the caller's `import.meta.url`. It is only consulted when the
// payload-root lookup does not exist, which is the mirror case — never in a
// source, npm, or native install, where the first branch always resolves.
export function payloadPath(relativePath, moduleUrl) {
  const fromRoot = path.join(payloadRoot(), relativePath);
  if (!moduleUrl || existsSync(fromRoot)) {
    return fromRoot;
  }
  const segments = relativePath.split("/");
  if (segments.length < 2) {
    return fromRoot;
  }
  const moduleRelative = path.resolve(
    path.dirname(fileURLToPath(moduleUrl)),
    "..",
    ...segments.slice(1),
  );
  return existsSync(moduleRelative) ? moduleRelative : fromRoot;
}

export function nativeExecutablePath() {
  return globalThis.__silverNativeExecutable
    ? path.resolve(globalThis.__silverNativeExecutable)
    : null;
}
