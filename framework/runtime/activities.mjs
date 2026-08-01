// Activities: the naming layer between designers and capability contracts.
//
// A designer says "build the flow in Figma". A contract says
// `(design-file, [write, update], [flow, sketch])`. An activity is the name
// that connects them, and it is the unit a transport preference binds to.
//
// Nothing here is declared twice. Which providers serve an activity and which
// skills perform one are *derived* from the provider and skill contracts, so
// the catalog cannot quietly disagree with them. Adding a provider changes what
// is served without anyone editing this file.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { assertV2 } from "./contracts.mjs";

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceCatalogPath = path.resolve(runtimeRoot, "../activities/catalog.yaml");

// Which provider `directions` let an action happen. `permissions` is not
// consulted: its `allow | ask | deny` is a prompting default, not a statement
// about what the provider can do.
const READ_ACTIONS = new Set(["read", "inspect", "execute"]);
const WRITE_ACTIONS = new Set([
  "create",
  "write",
  "update",
  "delete",
  "publish",
  "present",
  "send",
  "commit",
  "push",
  "open-pr",
]);

function directionSatisfies(directions, action) {
  if (directions.includes("portable")) return true;
  if (READ_ACTIONS.has(action)) return directions.includes("read");
  if (WRITE_ACTIONS.has(action)) return directions.includes("write");
  return false;
}

async function catalogPathFor(workspaceRoot) {
  if (!workspaceRoot) return sourceCatalogPath;
  const installed = path.join(
    path.resolve(workspaceRoot),
    ".silver",
    "activities",
    "catalog.yaml",
  );
  try {
    await readFile(installed, "utf8");
    return installed;
  } catch {
    return sourceCatalogPath;
  }
}

export async function loadActivityCatalog(options = {}) {
  const catalogPath = await catalogPathFor(options.root);
  const catalog = parse(await readFile(catalogPath, "utf8"));
  await assertV2("activity-catalog.schema.json", catalog, options);
  const ids = new Set();
  for (const activity of catalog.activities) {
    if (ids.has(activity.id)) {
      throw new Error(`Duplicate activity id in the catalog: ${activity.id}.`);
    }
    ids.add(activity.id);
  }
  return catalog;
}

export function findActivity(catalog, id) {
  return catalog.activities.find((activity) => activity.id === id);
}

// A provider serves an activity when it declares the capability, its declared
// directions cover every action the activity needs, and — when the activity
// names artifact kinds — it supports at least one of them.
//
// Every action must be covered rather than any, because an activity is one unit
// of work. A transport that can read but not write has not done "push the
// tokens", and claiming otherwise is the kind of optimistic reporting 0.7 spent
// a release removing.
export function providerSupportsActivity(provider, activity) {
  if (!provider.capabilities?.includes(activity.capability)) return false;
  const directions = provider.directions ?? [];
  if (!activity.actions.every((action) => directionSatisfies(directions, action))) {
    return false;
  }
  if (!activity.artifact_kinds) return true;
  // An absent list means the provider declares no restriction.
  const supported = provider.supported_artifact_kinds;
  if (!supported) return true;
  return activity.artifact_kinds.some((kind) => supported.includes(kind));
}

export function providersForActivity(providers, activity) {
  return providers.filter((provider) => providerSupportsActivity(provider, activity));
}

function declaredCapabilities(skill) {
  return [
    ...(skill.capabilities?.required ?? []),
    ...(skill.capabilities?.optional ?? []).map((entry) => entry.capability),
  ];
}

// A skill performs an activity when it declares the capability and its declared
// effects for that capability overlap the activity's actions.
//
// A skill that declares a capability but no effects for it is reported as
// `unnarrowed` rather than silently matching everything: the contract does not
// say what it does with that tool, and guessing is how `pull` and `push` end up
// indistinguishable.
export function skillPerformsActivity(skill, activity) {
  if (!declaredCapabilities(skill).includes(activity.capability)) {
    return { performs: false };
  }
  const effects = (skill.effects ?? []).filter(
    (effect) => effect.capability === activity.capability,
  );
  if (effects.length === 0) return { performs: true, unnarrowed: true };
  const actions = new Set(effects.flatMap((effect) => effect.actions));
  const performs = activity.actions.some((action) => actions.has(action));
  return { performs, ...(performs ? {} : { reason: "no declared action overlaps" }) };
}

export function skillsForActivity(skills, activity) {
  return skills.filter((skill) => skillPerformsActivity(skill, activity).performs);
}

// The reverse lookup, for reporting: which activities does this skill's use of
// this capability correspond to? Used by `silver tools` and by invocation
// results, so a degraded capability can be described as "could not build flows
// in a design tool" rather than "design-file unavailable".
export function activitiesForSkill(catalog, skill) {
  return catalog.activities.filter(
    (activity) => skillPerformsActivity(skill, activity).performs,
  );
}

export function activitiesForCapability(catalog, capability) {
  return catalog.activities.filter((activity) => activity.capability === capability);
}

// Drift check, run by validate-contracts. `status` is verified in both
// directions so that shipping a provider for a `planned` activity fails until
// the catalog is corrected, and a `served` activity losing its last provider
// fails too. A stale catalog is worse than none: it promises tools that are not
// there.
export function auditActivityCatalog({ catalog, providers, skills }) {
  const findings = [];
  for (const activity of catalog.activities) {
    const serving = providersForActivity(providers, activity);
    const performing = skillsForActivity(skills, activity);

    if (activity.status === "served" && serving.length === 0) {
      findings.push(
        `Activity ${activity.id} is marked served but no shipped provider supports it.`,
      );
    }
    if (activity.status === "planned" && serving.length > 0) {
      findings.push(
        `Activity ${activity.id} is marked planned but ${serving
          .map((provider) => provider.id)
          .join(", ")} supports it. Mark it served.`,
      );
    }
    if (performing.length === 0) {
      findings.push(
        `Activity ${activity.id} is named but no skill declares the capability it needs.`,
      );
    }
  }
  return findings;
}
