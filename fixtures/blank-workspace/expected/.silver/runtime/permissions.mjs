import path from "node:path";

import { activitiesForCapability, skillPerformsActivity } from "./activities.mjs";
import { resolveActivityTransport } from "./transports.mjs";

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

// A capability the skill needs but the catalog has no name for. Empty `actions`
// makes every provider declaring the capability a candidate, which is the
// pre-0.8 behaviour — used only when a caller resolves without a catalog.
function pseudoActivity(capability) {
  return {
    id: capability,
    title: capability,
    capability,
    actions: [],
    status: "served",
    unnamed: true,
  };
}

// Providers named by the invocation rather than installed on disk. They declare
// one capability each and no setup ladder, so they are always treated as
// unrestricted for the capability they claim.
function poolFrom(registeredProviders, availableProviders) {
  const pool = [...registeredProviders];
  const known = new Set(registeredProviders.map((provider) => provider.id));
  for (const entry of availableProviders) {
    if (known.has(entry.provider)) continue;
    pool.push({
      id: entry.provider,
      capabilities: [entry.capability],
      directions: ["portable"],
      available: Boolean(entry.available),
      availability_reason: "Declared by the invocation.",
      setup: [],
    });
  }
  return pool;
}

function activitiesFor(catalog, contract, capability) {
  if (!catalog) return [pseudoActivity(capability)];
  const named = activitiesForCapability(catalog, capability).filter(
    (activity) => skillPerformsActivity(contract, activity).performs,
  );
  return named.length > 0 ? named : [pseudoActivity(capability)];
}

// Resolution is per activity, because pulling designs out of a tool and pushing
// updates into it are different jobs that different transports do well. The
// capability-level record stays for the result contract, and reports the first
// transport that resolved for that capability.
export function resolveCapabilities({
  contract,
  registeredProviders = [],
  availableProviders = [],
  catalog = null,
  sources = [],
  interactive = true,
}) {
  const pool = poolFrom(registeredProviders, availableProviders);
  const providers = [];
  const degradedCapabilities = [];
  const activities = [];
  const questions = [];

  // Detail lives in one place. A capability record names the activity that
  // decided it; `activities` carries the chain, what was removed, and why.
  const resolveCapability = (capability) => {
    const records = activitiesFor(catalog, contract, capability).map((activity) =>
      Object.assign(
        resolveActivityTransport({ activity, providers: pool, sources, interactive }),
        activity.unnamed ? { unnamed: true } : {},
      ),
    );
    activities.push(...records.filter((record) => !record.unnamed));
    return records;
  };

  const capabilityRecord = (capability, status, resolution) => ({
    capability,
    ...(resolution?.selected ? { provider: resolution.selected } : {}),
    status,
    ...(resolution && !resolution.unnamed ? { activity: resolution.activity } : {}),
  });

  for (const capability of contract.capabilities.required) {
    const resolutions = resolveCapability(capability);
    const chosen = resolutions.find((entry) => entry.selected);
    // A question outranks a partial success: nothing runs while the designer
    // still has a choice to make about how it runs.
    const halted = resolutions.find(
      (entry) => entry.decision === "ask" || entry.decision === "stop",
    );

    if (halted) {
      questions.push(halted);
      providers.push(capabilityRecord(capability, "not-run", halted));
      degradedCapabilities.push({
        capability,
        coverage: "not-run",
        reason:
          halted.decision === "ask"
            ? `A transport choice is waiting for you: ${halted.title}.`
            : `No permitted transport for ${halted.title.toLowerCase()}.`,
      });
      continue;
    }
    if (chosen) {
      const fallback = chosen.decision === "fallback";
      providers.push(
        capabilityRecord(capability, fallback ? "local-fallback" : "selected", chosen),
      );
      if (fallback) {
        degradedCapabilities.push({
          capability,
          coverage: "local-fallback",
          reason: `Preferred transport unavailable; used ${chosen.selected}.`,
        });
      }
      continue;
    }
    providers.push(capabilityRecord(capability, "not-run", resolutions[0]));
    degradedCapabilities.push({
      capability,
      coverage: "not-run",
      reason: "No provider is available for a required capability.",
    });
  }

  for (const optional of contract.capabilities.optional) {
    const capability = optional.capability;
    const resolutions = resolveCapability(capability);
    const chosen = resolutions.find((entry) => entry.selected);
    const halted = resolutions.find((entry) => entry.decision === "ask");

    if (halted) {
      questions.push(halted);
      providers.push(capabilityRecord(capability, optional.fallback, halted));
      degradedCapabilities.push({
        capability,
        coverage: optional.fallback,
        reason: `A transport choice is waiting for you: ${halted.title}.`,
      });
      continue;
    }
    if (chosen) {
      const fallback = chosen.decision === "fallback";
      providers.push(
        capabilityRecord(capability, fallback ? "local-fallback" : "selected", chosen),
      );
      if (fallback) {
        degradedCapabilities.push({
          capability,
          coverage: "local-fallback",
          reason: `Preferred transport unavailable; used ${chosen.selected}.`,
        });
      }
      continue;
    }
    providers.push(capabilityRecord(capability, optional.fallback, resolutions[0]));
    degradedCapabilities.push({
      capability,
      coverage: optional.fallback,
      reason: "Optional provider unavailable.",
    });
  }

  return { providers, degradedCapabilities, activities, questions };
}
