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

import { parse, stringify } from "yaml";

import {
  loadActivityCatalog,
  providersForActivity,
  skillPerformsActivity,
} from "../framework/runtime/activities.mjs";
import { assertV2 } from "../framework/runtime/contracts.mjs";
import { unmappedHostServers, userConfigPaths } from "../framework/runtime/host-mcp.mjs";
import { discoverProviders } from "../framework/runtime/providers.mjs";
import { diagnoseTransport } from "../framework/runtime/transport-diagnosis.mjs";
import { probeRequest, recordProbe } from "../framework/runtime/transport-probes.mjs";
import {
  explainSelection,
  resolveActivityTransport,
} from "../framework/runtime/transports.mjs";
import { defaultPracticeRoot } from "./practice.mjs";
import { exists, readUtf8, writeUtf8 } from "./lib/files.mjs";

async function projectPreferences(root) {
  const manifestPath = path.join(root, "design", "manifest.yaml");
  if (!(await exists(manifestPath))) return null;
  try {
    return parse(await readUtf8(manifestPath))?.tool_preferences ?? null;
  } catch {
    return null;
  }
}

// Personal is the first ordering source, read from My Practice rather than
// the project — this is what lets one designer prefer a transport a
// teammate on the same project does not. A malformed file is doctor's
// finding, not a reason to fail everything resolving through it.
async function personalPreferences(practiceRoot) {
  const file = path.join(practiceRoot, "tools.yaml");
  if (!(await exists(file))) return null;
  try {
    const value = parse(await readUtf8(file));
    await assertV2("tool-preferences.schema.json", value);
    return value;
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

export const DECLARED_TRANSPORT_DIR = "design/tools/transports";

const DECLARE_PLACEHOLDER = "TODO";

// Turning an unmapped server into something Silver can use.
//
// Before this, a server the host had and no shipped adapter claimed was a dead
// end: `silver tools` reported it and stopped. That was honest but useless, and
// it left `PROJECT.md`'s promise — what Silver ships plus what the designer
// tells it — with no way to do the telling.
//
// The scaffold refuses to be used with its placeholders intact, the same rule
// `invoke --scaffold` follows. A declaration nobody filled in is a transport
// Silver would select while knowing nothing about it.
export function scaffoldDeclaration({ server, host, toolPrefix }) {
  return [
    `# ${server} — declared by this project, not shipped by Silver.`,
    "#",
    "# Silver knows this server exists because your agent host has it configured.",
    "# It knows nothing else until you say so here. Replace every TODO, then run",
    "# `silver tools --list` to confirm Silver reads it.",
    "#",
    "# There are no scripts here: the agent calls this server's tools directly.",
    "# Silver's job is to resolve it for the right activity and stay out of the way.",
    "schema: silver/provider/v1",
    `id: ${server}`,
    "version: 0.1.0",
    "kind: external",
    `target: ${DECLARE_PLACEHOLDER}   # the system this reaches, such as figma or chrome`,
    `variant: ${DECLARE_PLACEHOLDER}  # which route to that system this is`,
    "aliases:",
    `  - ${DECLARE_PLACEHOLDER}       # what you would call this out loud`,
    "source:",
    `  publisher: ${DECLARE_PLACEHOLDER}`,
    `  repository: ${DECLARE_PLACEHOLDER}`,
    "  evidence: declared",
    "guidance:",
    "  good_at:",
    `    - ${DECLARE_PLACEHOLDER}     # what this is actually good at`,
    "  prefer_when:",
    `    - ${DECLARE_PLACEHOLDER}     # when you would reach for it over another`,
    "# Which activities this can serve is derived from what you declare below.",
    "# See `silver tools` for the activity list.",
    `capabilities: [${DECLARE_PLACEHOLDER}]`,
    "connection:",
    "  kind: mcp",
    `  server: ${server}`,
    ...(toolPrefix ? [`  tool_prefix: ${toolPrefix}`] : []),
    "permissions:",
    `  - capability: ${DECLARE_PLACEHOLDER}`,
    "    actions: [read, inspect]",
    "    default: ask",
    "directions: [read]",
    "setup:",
    "  - id: host-config",
    "    kind: external-app",
    `    title: ${server} is already configured in ${host ?? "your agent host"}`,
    "    verify: { kind: host-mcp-entry, by: silver }",
    "",
  ].join("\n");
}

export function assertDeclarationComplete(content, file) {
  if (content.split("\n").some((line) => !line.trimStart().startsWith("#") && line.includes(DECLARE_PLACEHOLDER))) {
    throw new Error(
      `${file} still contains TODO placeholders. Silver will not select a transport it knows nothing about — fill them in first.`,
    );
  }
}

// Every transport Silver knows about, whether or not this workspace uses it.
// `silver tools` answers "what will be used for my work"; this answers "what
// exists, where does it come from, and when would I pick it" — the question a
// designer has before they have a preference.
export async function listTransports(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const providers = await discoverProviders({ root, home: options.home });
  const catalog = await loadActivityCatalog({ root });

  return {
    root,
    transports: providers
      .map((provider) => ({
        id: provider.id,
        ...(provider.target ? { target: provider.target } : {}),
        ...(provider.variant ? { variant: provider.variant } : {}),
        kind: provider.kind,
        available: provider.available,
        level: provider.availability_level,
        ...(provider.source ? { source: provider.source } : {}),
        ...(provider.guidance ? { guidance: provider.guidance } : {}),
        ...(provider.aliases ? { aliases: provider.aliases } : {}),
        // What this transport could serve here, derived from its contract
        // rather than declared — the same rule the activity catalog follows.
        activities: catalog.activities
          .filter(
            (activity) => providersForActivity([provider], activity).length > 0,
          )
          .map(({ id }) => id),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    unmapped: await unmappedHostServers({ root, providers, home: options.home }),
    external_paths: userConfigPaths(options.home),
  };
}

// Why a transport is not working, whole ladder rather than first failure.
export async function diagnoseTransports(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const providers = await discoverProviders({ root, home: options.home });
  const selected = options.transport
    ? providers.filter((provider) => provider.id === options.transport)
    : providers;
  if (options.transport && selected.length === 0) {
    throw new Error(
      `No transport named ${options.transport} is installed here. Run \`silver tools --list\` to see what is.`,
    );
  }
  return {
    root,
    transports: await Promise.all(
      selected.map((provider) =>
        diagnoseTransport(provider, { root, home: options.home }),
      ),
    ),
    external_paths: userConfigPaths(options.home),
  };
}

// The instruction Silver hands the agent. It names the call and stops; making it
// is the agent's job, because Silver never opens a connection.
export async function requestProbe(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const providers = await discoverProviders({ root, home: options.home });
  const selected = options.transport
    ? providers.filter((provider) => provider.id === options.transport)
    : providers.filter((provider) => provider.probe);
  if (options.transport && selected.length === 0) {
    throw new Error(`No transport named ${options.transport} is installed here.`);
  }
  return { root, probes: selected.map((provider) => probeRequest(provider)) };
}

export async function saveProbe(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const providers = await discoverProviders({ root, home: options.home, skipProbes: true });
  return recordProbe({ root, probe: options.probe, providers });
}

export async function declareTransport(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const providers = await discoverProviders({ root, home: options.home });
  const server = options.server;

  if (providers.some((provider) => provider.id === server)) {
    throw new Error(`${server} is already a transport Silver knows about.`);
  }

  const unmapped = await unmappedHostServers({ root, providers, home: options.home });
  const found = unmapped.find((entry) => entry.name === server);
  if (!found) {
    // Declaring a server the host does not have would produce a transport that
    // is permanently unavailable, and the reason would look like a bug.
    throw new Error(
      `No MCP server named ${server} is configured in this agent host. Silver declares tools that are there; it does not invent them.${
        unmapped.length > 0
          ? ` Unmapped servers here: ${unmapped.map(({ name }) => name).join(", ")}.`
          : ""
      }`,
    );
  }

  const file = path.join(root, DECLARED_TRANSPORT_DIR, `${server}.yaml`);
  if (await exists(file)) {
    throw new Error(`${DECLARED_TRANSPORT_DIR}/${server}.yaml already exists.`);
  }
  const content = scaffoldDeclaration({
    server,
    host: found.host,
    toolPrefix: `mcp__${server}__`,
  });
  await writeUtf8(file, content);
  return {
    path: `${DECLARED_TRANSPORT_DIR}/${server}.yaml`,
    absolute: file,
    server,
    host: found.host,
    scope: found.scope,
    next: "Fill in every TODO, then run `silver tools --list`.",
  };
}

export async function inspectTools(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const catalog = await loadActivityCatalog({ root });
  const providers = await discoverProviders({ root, home: options.home });
  const skills = await installedSkills(root);

  const sources = [];
  const practiceRoot = path.resolve(options.practiceRoot ?? defaultPracticeRoot());
  const personal = await personalPreferences(practiceRoot);
  if (personal) sources.push({ source: "personal", preferences: personal });
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
      why: explainSelection({
        provider: providers.find(({ id }) => id === resolution.selected),
        orderedBy: resolution.ordered_by,
        decision: resolution.decision,
      }),
    });
  }

  return {
    root,
    activities,
    transports: providers.map((provider) => ({
      id: provider.id,
      ...(provider.target ? { target: provider.target } : {}),
      ...(provider.variant ? { variant: provider.variant } : {}),
      kind: provider.kind,
      ...(provider.source ? { source: provider.source } : {}),
      ...(provider.guidance ? { guidance: provider.guidance } : {}),
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

// Resolving "use the official Figma MCP instead" to a transport id. A phrase
// is free text, not an exact match — it contains an alias rather than
// equalling one — so this looks for every declared alias that the phrase
// contains. Two different transports both matching is ambiguous by
// construction: asking beats guessing which one a designer meant.
export function resolveToolAlias(phrase, providers) {
  const normalized = phrase.toLowerCase();
  const matches = [];
  for (const provider of providers) {
    const alias = (provider.aliases ?? []).find((candidate) =>
      normalized.includes(candidate.toLowerCase()),
    );
    if (alias) matches.push({ transport: provider.id, alias });
  }
  if (matches.length === 0) {
    return { status: "unresolved", phrase };
  }
  if (new Set(matches.map(({ transport }) => transport)).size > 1) {
    return { status: "ambiguous", phrase, candidates: matches };
  }
  return { status: "resolved", phrase, transport: matches[0].transport, matched_alias: matches[0].alias };
}

export async function resolveTools(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const providers = await discoverProviders({ root, home: options.home });
  return resolveToolAlias(options.phrase, providers);
}

function nextPreferencesRevision(revision) {
  const value = Number(revision.slice(1));
  return Number.isInteger(value) ? `r${value + 1}` : "r1";
}

// Promoting a resolved choice into something that survives past this one
// conversation. Written directly rather than through the practice-change
// review ceremony: a transport preference is local machine configuration, not
// curated practice content someone else would want to review before it takes
// effect.
export async function bindActivityTransport(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const practiceRoot = path.resolve(options.practiceRoot ?? defaultPracticeRoot());
  const { activity, transport } = options;

  const catalog = await loadActivityCatalog({ root });
  if (!catalog.activities.some(({ id }) => id === activity)) {
    throw new Error(`No activity named ${activity}. See \`silver tools\` for the activity list.`);
  }
  const providers = await discoverProviders({ root, home: options.home });
  if (!providers.some(({ id }) => id === transport)) {
    throw new Error(`No transport named ${transport} is installed here. Run \`silver tools --list\` to see what is.`);
  }

  const file = path.join(practiceRoot, "tools.yaml");
  const preferences = (await exists(file))
    ? parse(await readUtf8(file))
    : { schema: "silver/tool-preferences/v1", revision: "r1", activities: {} };
  const next = {
    ...preferences,
    revision: (await exists(file))
      ? nextPreferencesRevision(preferences.revision)
      : preferences.revision,
    activities: {
      ...preferences.activities,
      [activity]: { use: [transport] },
    },
  };
  await assertV2("tool-preferences.schema.json", next);
  await writeUtf8(file, stringify(next));
  return { activity, transport, path: file, preferences: next };
}
