import { access, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
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
// `responding` and `unresponsive` are never returned by a health script — no
// script in this process can establish either. They are applied afterwards from
// a probe the agent recorded, which is the only party that can call an MCP
// server. See framework/runtime/transport-probes.mjs.
const AVAILABILITY_LEVELS = new Set([
  "configured",
  "responding",
  "unresponsive",
  "absent",
  "unknown",
  "local",
]);

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

// Capabilities that mean writing something Silver is answerable for. A
// declaration is a name and an address — nobody here wrote or reviewed the code
// behind it — so it may describe design work but never be trusted to produce a
// canonical artifact or production source through a Silver operation.
const PACKAGE_ONLY_CAPABILITIES = new Set([
  "canonical-artifact",
  "production-source",
  "artifact-codec",
  // The renderer capabilities (visual/map/prototype/presentation) are
  // deliberately NOT here: 0.9 ships real external declarations for them
  // (Excalidraw, Miro, Canva, Webflow) precisely so a designer has more than
  // silver-portable to choose from. PACKAGE_ONLY is for capabilities where a
  // declaration cannot be trusted to act — writing something Silver is
  // answerable for — not for "only silver-portable happens to do this today."
]);

function assertDeclarationIsHonest(manifest, file) {
  const overreach = manifest.capabilities.filter((capability) =>
    PACKAGE_ONLY_CAPABILITIES.has(capability),
  );
  if (overreach.length > 0) {
    throw new Error(
      `Declared transport ${manifest.id} (${file}) claims ${overreach.join(", ")}, which needs an adapter Silver ships. Remove the capability or contribute a provider package.`,
    );
  }
  if (manifest.codecs?.length) {
    throw new Error(
      `Declared transport ${manifest.id} (${file}) declares codecs, which are scripts Silver runs. A declaration has none.`,
    );
  }
  if (manifest.operations?.length) {
    throw new Error(
      `Declared transport ${manifest.id} (${file}) declares operations, which are scripts Silver runs. A declaration has none.`,
    );
  }
}

// Availability for a transport with no health script of its own. Silver can see
// whether the agent host has the server configured, and that is the whole of
// what it can honestly say — `responding` is the agent's to establish.
async function declaredAvailability(manifest, options = {}) {
  if (manifest.connection?.kind === "mcp") {
    const { mcpAvailability } = await import("./host-mcp.mjs");
    return mcpAvailability(manifest, options);
  }
  if (manifest.connection?.kind === "host-native") {
    return {
      available: false,
      level: "unknown",
      reason: `${manifest.id} is built into an agent host. Only the agent can confirm it is there.`,
    };
  }
  if (manifest.interface?.detection) {
    const { detectInterface } = await import("./tool-detection.mjs");
    const found = await detectInterface(manifest.interface.detection, options);
    const hits = [
      ...found.executables.map((name) => `executable ${name}`),
      ...found.env.map((name) => `env ${name}`),
      ...found.files.map((name) => `file ${name}`),
    ];
    return hits.length > 0
      ? { available: true, level: "configured", reason: `Detected via ${hits.join(", ")}.` }
      : {
          available: false,
          level: "absent",
          reason: `${manifest.id} declares detection for this machine, but none of it was found.`,
        };
  }
  return {
    available: false,
    level: "unknown",
    reason: `${manifest.id} declares no connection Silver can inspect.`,
  };
}

async function loadPackages(providerRoot, options) {
  const entries = (await readdir(providerRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const loaded = [];
  for (const entry of entries) {
    const packageRoot = path.join(providerRoot, entry.name);
    const manifestPath = path.join(packageRoot, "provider.yaml");
    if (!(await exists(manifestPath))) continue;
    const manifest = parse(await readFile(manifestPath, "utf8"));
    await assertV2("provider.schema.json", manifest, options);
    if (manifest.id !== entry.name) {
      throw new Error(`Provider directory ${entry.name} does not match manifest id ${manifest.id}.`);
    }
    for (const operation of manifest.operations ?? []) {
      await access(inside(packageRoot, operation.script));
    }
    for (const codec of manifest.codecs ?? []) {
      await access(inside(packageRoot, codec));
    }
    const availability = options.skipAvailability
      ? { available: true, level: "unknown", reason: "Availability check intentionally skipped." }
      : manifest.availability
        ? await loadAvailability(packageRoot, manifest, options)
        : await declaredAvailability(manifest, options);
    loaded.push({
      ...manifest,
      packageRoot,
      origin: "shipped",
      // Whether Silver runs this or hands it to the agent. Without it, a caller
      // cannot tell an adapter it can invoke from a server only the agent reaches.
      execution: manifest.operations?.length ? "silver" : "agent",
      available: availability.available,
      availability_level: availability.level,
      availability_reason: availability.reason,
    });
  }
  return loaded;
}

// Single-file declarations: the shipped catalog, and whatever this project has
// told Silver about. Neither carries code.
async function loadDeclarations(directory, origin, options) {
  if (!(await exists(directory))) return [];
  const files = (await readdir(directory))
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .sort();
  const loaded = [];
  for (const name of files) {
    const file = path.join(directory, name);
    const source = await readFile(file, "utf8");
    const manifest = parse(source);
    if (!manifest || manifest.schema !== "silver/provider/v1") continue;
    // A scaffold nobody finished describes a transport Silver would otherwise
    // select while knowing nothing about it. Same rule as `invoke --scaffold`.
    if (
      source
        .split("\n")
        .some((line) => !line.trimStart().startsWith("#") && line.includes("TODO"))
    ) {
      throw new Error(
        `${file} still contains TODO placeholders from \`silver tools --declare\`. Fill them in before Silver will read it.`,
      );
    }
    await assertV2("provider.schema.json", manifest, options);
    const expected = name.replace(/\.ya?ml$/, "");
    if (manifest.id !== expected) {
      throw new Error(`Transport file ${name} does not match manifest id ${manifest.id}.`);
    }
    assertDeclarationIsHonest(manifest, file);
    const availability = options.skipAvailability
      ? { available: true, level: "unknown", reason: "Availability check intentionally skipped." }
      : await declaredAvailability(manifest, options);
    loaded.push({
      ...manifest,
      declarationPath: file,
      origin,
      execution: "agent",
      available: availability.available,
      availability_level: availability.level,
      availability_reason: availability.reason,
    });
  }
  return loaded;
}

export async function discoverProviders(options = {}) {
  const providerRoot = await providerRootFor(options.root, options.providerRoot);
  const workspace = options.root ? path.resolve(options.root) : null;
  const home = options.home ?? homedir();

  // Four origins, most-general first, so each later one wins a name clash with
  // an earlier one — the more local answer is the more specific one. This is
  // about which *declaration* wins an id collision, not which *transport a
  // designer prefers*: preference ordering (personal ahead of project ahead of
  // team ahead of framework) is a separate question, answered by `sources` in
  // framework/runtime/transports.mjs, not by this list. My Practice is last
  // here for the same reason project-declared is ahead of the shipped catalog:
  // it is the most locally-scoped place a designer can describe a transport,
  // even though it is the least project-scoped preference source.
  const catalogRoot = workspace
    ? path.join(workspace, ".silver", "transports")
    : path.resolve(runtimeRoot, "../transports");
  const practiceTransportsRoot = path.join(home, "Silver", "My Practice", "transports");
  const discovered = [
    ...(await loadPackages(providerRoot, options)),
    ...(await loadDeclarations(catalogRoot, "catalog", options)),
    ...(workspace
      ? await loadDeclarations(
          path.join(workspace, "design", "tools", "transports"),
          "project-declared",
          options,
        )
      : []),
    ...(await loadDeclarations(practiceTransportsRoot, "personal-declared", options)),
  ];

  const byId = new Map();
  for (const provider of discovered) byId.set(provider.id, provider);
  let unique = [...byId.values()];

  if (unique.length === 0) {
    throw new Error(`No registered provider packages found at ${providerRoot}.`);
  }

  // Availability so far is what Silver could establish on its own, which for an
  // MCP transport stops at `configured`. A recorded probe is the agent's
  // evidence that it actually responds, and it is believed only while fresh.
  if (workspace && !options.skipProbes) {
    const { applyProbe, readProbes } = await import("./transport-probes.mjs");
    const probes = await readProbes(workspace);
    if (probes.size > 0) {
      unique = unique.map((provider) =>
        applyProbe(provider, probes.get(provider.id), options.now),
      );
    }
  }
  return unique;
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
