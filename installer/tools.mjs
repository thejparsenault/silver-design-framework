// `silver tools` — what will actually be used, and why.
//
// A resolver with an order and two filters is undebuggable without this. For
// every activity it reports the transport chosen, which source ordered it, every
// transport removed with the reason and who can fix it, and which rung of a
// setup ladder did not hold. A veto that is not attributed looks exactly like a
// tool being down, and a designer who cannot tell those apart cannot act.
//
// Read-only. It reads the host's MCP configuration, which lives outside the
// project, and says so.
import path from "node:path";

import { parse } from "yaml";

import {
  loadActivityCatalog,
  providersForActivity,
  skillPerformsActivity,
} from "../framework/runtime/activities.mjs";
import { unmappedHostServers, userConfigPaths } from "../framework/runtime/host-mcp.mjs";
import { discoverProviders } from "../framework/runtime/providers.mjs";
import { resolveActivityTransport } from "../framework/runtime/transports.mjs";
import { exists, readUtf8 } from "./lib/files.mjs";

async function projectPreferences(root) {
  const manifestPath = path.join(root, "design", "manifest.yaml");
  if (!(await exists(manifestPath))) return null;
  try {
    return parse(await readUtf8(manifestPath))?.tool_preferences ?? null;
  } catch {
    return null;
  }
}

async function installedSkills(root) {
  const skillsRoot = path.join(root, ".skills");
  if (!(await exists(skillsRoot))) return [];
  const { readdir } = await import("node:fs/promises");
  const entries = (await readdir(skillsRoot, { withFileTypes: true })).filter((entry) =>
    entry.isDirectory(),
  );
  const skills = [];
  for (const entry of entries) {
    const contractPath = path.join(skillsRoot, entry.name, "skill.yaml");
    if (!(await exists(contractPath))) continue;
    try {
      skills.push(parse(await readUtf8(contractPath)));
    } catch {
      // A malformed contract is doctor's finding, not this command's.
    }
  }
  return skills;
}

export async function inspectTools(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const catalog = await loadActivityCatalog({ root });
  const providers = await discoverProviders({ root, home: options.home });
  const skills = await installedSkills(root);

  const sources = [];
  const project = await projectPreferences(root);
  if (project) sources.push({ source: "project", preferences: project });

  const activities = [];
  for (const activity of catalog.activities) {
    // Only report activities this workspace's skills can actually perform.
    // Listing a transport choice for work nobody here does is noise.
    const performers = skills.filter(
      (skill) => skillPerformsActivity(skill, activity).performs,
    );
    if (skills.length > 0 && performers.length === 0) continue;

    const resolution = resolveActivityTransport({
      activity,
      providers,
      sources,
      interactive: options.interactive ?? true,
    });
    activities.push({
      ...resolution,
      status: activity.status,
      supported_by: providersForActivity(providers, activity).map(({ id }) => id),
      skills: performers.map(({ id }) => id),
    });
  }

  return {
    root,
    activities,
    transports: providers.map((provider) => ({
      id: provider.id,
      ...(provider.target ? { target: provider.target } : {}),
      kind: provider.kind,
      available: provider.available,
      level: provider.availability_level,
      reason: provider.availability_reason,
      setup: (provider.setup ?? []).map((step) => ({
        id: step.id,
        kind: step.kind,
        verified_by: step.verify?.by,
        ...(step.url ? { url: step.url } : {}),
      })),
      ...(provider.requires_env ? { requires_env: provider.requires_env } : {}),
    })),
    // Servers the host has that no shipped adapter claims. Silver knows they
    // exist and nothing more, so it says so rather than guessing what they do.
    unmapped: await unmappedHostServers({ root, providers, home: options.home }),
    external_paths: userConfigPaths(options.home),
  };
}
