import path from "node:path";

const rank = new Map([
  ["allow", 0],
  ["ask", 1],
  ["deny", 2],
  ["missing", 3],
]);

function patternToRegExp(pattern) {
  const escaped = pattern
    .split("/")
    .map((part) => {
      if (part === "**") {
        return ".*";
      }
      return part
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replaceAll("*", "[^/]*");
    })
    .join("/");
  return new RegExp(`^${escaped}$`);
}

export function matchesPathPattern(pattern, value) {
  return patternToRegExp(pattern).test(safeRelativePath(value));
}

function safeRelativePath(value) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.split(path.sep).join("/");
  if (
    path.isAbsolute(value) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`Permission path escapes workspace: ${value}`);
  }
  return normalized.replace(/^\.\//, "");
}

function matchesRule(rule, request) {
  if (
    rule.capability !== request.capability ||
    !rule.actions.includes(request.action)
  ) {
    return false;
  }
  if (!rule.paths || rule.paths.length === 0) {
    return true;
  }
  if (!request.path) {
    return false;
  }
  return rule.paths.some((pattern) =>
    patternToRegExp(pattern).test(request.path),
  );
}

function layerDecision(layer, request) {
  const matches = layer.rules.filter((rule) => matchesRule(rule, request));
  if (matches.length === 0) {
    return "missing";
  }
  return matches
    .map(({ decision }) => decision)
    .sort((left, right) => rank.get(right) - rank.get(left))[0];
}

export function resolvePermissions({ layers, requests }) {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error("Permission resolution requires at least one policy layer.");
  }
  const decisions = requests.map((request) => {
    const normalized = {
      ...request,
      path: safeRelativePath(request.path),
    };
    const sources = layers.map((layer) => ({
      layer: layer.id,
      decision: layerDecision(layer, normalized),
    }));
    const strictest = sources
      .map(({ decision }) => decision)
      .sort((left, right) => rank.get(right) - rank.get(left))[0];
    return {
      capability: normalized.capability,
      action: normalized.action,
      ...(normalized.path ? { path: normalized.path } : {}),
      decision: strictest === "missing" ? "deny" : strictest,
      sources,
    };
  });
  return {
    schema: "silver/capability-resolution/v2",
    layers: layers.map(({ id, layer }) => ({ id, layer })),
    decisions,
    providers: [],
    degraded_capabilities: [],
  };
}

export function resolveCapabilities({
  contract,
  registeredProviders = [],
  availableProviders = [],
}) {
  const byCapability = new Map();
  for (const provider of registeredProviders) {
    if (!provider.available) continue;
    for (const capability of provider.capabilities) {
      if (!byCapability.has(capability)) {
        byCapability.set(capability, provider.id);
      }
    }
  }
  for (const provider of availableProviders) {
    if (provider.available && !byCapability.has(provider.capability)) {
      byCapability.set(provider.capability, provider.provider);
    }
  }
  const providers = [];
  const degradedCapabilities = [];

  for (const capability of contract.capabilities.required) {
    if (byCapability.has(capability)) {
      providers.push({
        capability,
        provider: byCapability.get(capability),
        status: "selected",
      });
    } else {
      providers.push({ capability, status: "not-run" });
      degradedCapabilities.push({
        capability,
        coverage: "not-run",
        reason: "No provider is available for a required capability.",
      });
    }
  }

  for (const optional of contract.capabilities.optional) {
    const capability = optional.capability;
    if (byCapability.has(capability)) {
      providers.push({
        capability,
        provider: byCapability.get(capability),
        status: "selected",
      });
      continue;
    }
    if (optional.fallback === "local" && byCapability.has(capability)) {
      providers.push({
        capability,
        provider: byCapability.get(capability),
        status: "local-fallback",
      });
      degradedCapabilities.push({
        capability,
        coverage: "local-fallback",
        reason: "Preferred provider unavailable; declared local fallback used.",
      });
      continue;
    }
    providers.push({ capability, status: optional.fallback });
    degradedCapabilities.push({
      capability,
      coverage: optional.fallback,
      reason: "Optional provider unavailable.",
    });
  }

  return { providers, degradedCapabilities };
}
