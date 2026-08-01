import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse } from "yaml";

import { assertV2 } from "./contracts.mjs";

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceProviderRoot = path.resolve(runtimeRoot, "../providers");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function inside(root, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`Provider script must be package-relative: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Provider path escapes package: ${relativePath}`);
  }
  return resolved;
}

async function providerRootFor(workspaceRoot, explicitRoot) {
  if (explicitRoot) return path.resolve(explicitRoot);
  if (workspaceRoot) {
    const installed = path.join(path.resolve(workspaceRoot), ".silver", "providers");
    if (await exists(installed)) return installed;
  }
  return sourceProviderRoot;
}

// `level` distinguishes what Silver actually established. An MCP transport can
// only ever reach `configured`: the agent host owns the connection, so nothing
// in this process can confirm the server responds. Scripts that omit it are
// treated as `configured` when available, never as proof it works.
const AVAILABILITY_LEVELS = new Set(["configured", "absent", "unknown", "local"]);

async function loadAvailability(packageRoot, manifest, options = {}) {
  const script = inside(packageRoot, manifest.availability.script);
  await access(script);
  const module = await import(`${pathToFileURL(script).href}?silver=${manifest.version}`);
  if (typeof module.checkAvailability !== "function") {
    throw new Error(`Provider ${manifest.id} availability script must export checkAvailability().`);
  }
  const result = await module.checkAvailability({
    packageRoot,
    manifest,
    root: options.root,
    home: options.home,
  });
  if (
    !result ||
    typeof result.available !== "boolean" ||
    (result.reason !== undefined && typeof result.reason !== "string") ||
    (result.level !== undefined && !AVAILABILITY_LEVELS.has(result.level))
  ) {
    throw new Error(`Provider ${manifest.id} returned an invalid availability result.`);
  }
  return {
    ...result,
    level: result.level ?? (result.available ? "configured" : "absent"),
  };
}

export async function discoverProviders(options = {}) {
  const providerRoot = await providerRootFor(options.root, options.providerRoot);
  const entries = (await readdir(providerRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const discovered = [];
  for (const entry of entries) {
    const packageRoot = path.join(providerRoot, entry.name);
    const manifestPath = path.join(packageRoot, "provider.yaml");
    if (!(await exists(manifestPath))) continue;
    const manifest = parse(await readFile(manifestPath, "utf8"));
    await assertV2("provider.schema.json", manifest, options);
    if (manifest.id !== entry.name) {
      throw new Error(`Provider directory ${entry.name} does not match manifest id ${manifest.id}.`);
    }
    for (const operation of manifest.operations) {
      await access(inside(packageRoot, operation.script));
    }
    for (const codec of manifest.codecs ?? []) {
      await access(inside(packageRoot, codec));
    }
    const availability = options.skipAvailability
      ? { available: true, level: "unknown", reason: "Availability check intentionally skipped." }
      : await loadAvailability(packageRoot, manifest, options);
    discovered.push({
      ...manifest,
      packageRoot,
      available: availability.available,
      availability_level: availability.level,
      availability_reason: availability.reason,
    });
  }
  if (discovered.length === 0) {
    throw new Error(`No registered provider packages found at ${providerRoot}.`);
  }
  return discovered;
}

export function selectProvider(providers, capability, preferred = []) {
  const candidates = providers.filter(
    (provider) => provider.available && provider.capabilities.includes(capability),
  );
  candidates.sort((left, right) => {
    const leftRank = preferred.indexOf(left.id);
    const rightRank = preferred.indexOf(right.id);
    const normalizedLeft = leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank;
    const normalizedRight = rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank;
    return normalizedLeft - normalizedRight || left.id.localeCompare(right.id);
  });
  return candidates[0];
}
