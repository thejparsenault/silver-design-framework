import path from "node:path";
import { fileURLToPath } from "node:url";

// Source and npm execution read the payload from beside the installer modules.
// A compiled native executable keeps the same directory layout beside itself;
// its entrypoint sets these process-local values before importing the CLI.
export function payloadRoot() {
  if (globalThis.__silverPayloadRoot) {
    return path.resolve(globalThis.__silverPayloadRoot);
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function payloadPath(relativePath) {
  return path.join(payloadRoot(), relativePath);
}

export function nativeExecutablePath() {
  return globalThis.__silverNativeExecutable
    ? path.resolve(globalThis.__silverNativeExecutable)
    : null;
}
