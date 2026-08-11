// Making `responding` knowable without Silver owning a connection.
//
// The bind: only the agent can call an MCP server, so Silver can establish that
// a transport is *configured* and never that it works. A designer whose tool is
// configured-but-dead gets the same report as one whose tool is fine, which is
// precisely the situation `silver tools` exists to prevent.
//
// The way out is not for Silver to start opening sockets. It is to ask the agent
// to make one call and write down what happened. Silver then treats that record
// exactly as 0.7 taught it to treat a check result: believed while its evidence
// resolves and agrees, and degraded with a reason when it does not.
//
// A probe goes stale on purpose. "It answered yesterday" is not "it answers".
import path from "node:path";

import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";

import { assertV2 } from "./contracts.mjs";

export const PROBE_DIR = ".silver/results/transports";
const DEFAULT_FRESHNESS_HOURS = 24;

export function probePath(root, transportId) {
  return path.join(path.resolve(root), PROBE_DIR, `${transportId}.json`);
}

export async function readProbe(root, transportId) {
  try {
    const probe = JSON.parse(await readFile(probePath(root, transportId), "utf8"));
    return probe?.schema === "silver/transport-probe/v1" ? probe : null;
  } catch {
    return null;
  }
}

export async function readProbes(root) {
  const directory = path.join(path.resolve(root), PROBE_DIR);
  let files;
  try {
    files = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  } catch {
    return new Map();
  }
  const probes = new Map();
  for (const name of files) {
    const probe = await readProbe(root, name.replace(/\.json$/, ""));
    if (probe) probes.set(probe.transport, probe);
  }
  return probes;
}

export function probeAge(probe, now = new Date()) {
  const recorded = Date.parse(probe.recorded_at);
  if (Number.isNaN(recorded)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - recorded) / 3_600_000;
}

export function isFresh(probe, provider, now = new Date()) {
  const limit = provider?.probe?.freshness_hours ?? DEFAULT_FRESHNESS_HOURS;
  return probeAge(probe, now) <= limit;
}

// What a recorded probe does to a transport's availability.
//
// Only ever an upgrade from `configured` to `responding`, or an explanation of
// why it is not. A probe never makes an absent transport present: if the host
// has no such server, a stale note claiming it answered is describing a
// different world, not this one.
export function applyProbe(provider, probe, now = new Date()) {
  if (!probe || provider.availability_level === "absent") return provider;

  if (probe.outcome !== "responded") {
    return {
      ...provider,
      available: false,
      availability_level: "unresponsive",
      availability_reason: `${provider.id} is configured but did not work when the agent called it${
        probe.detail ? `: ${probe.detail}` : "."
      }`,
      probe_state: probe.outcome,
    };
  }

  if (!isFresh(probe, provider, now)) {
    const hours = Math.round(probeAge(probe, now));
    return {
      ...provider,
      availability_level: provider.availability_level,
      availability_reason: `${provider.availability_reason} Last confirmed responding ${hours} hours ago, which is past its freshness window.`,
      probe_state: "stale",
    };
  }

  return {
    ...provider,
    available: true,
    availability_level: "responding",
    availability_reason: `${provider.id} responded when the agent called ${probe.tool ?? "it"}.`,
    probe_state: "fresh",
  };
}

// The instruction handed to the agent. Silver names the tool; the agent calls
// it. Nothing here reaches the network.
export function probeRequest(provider) {
  if (!provider.probe) {
    return {
      transport: provider.id,
      supported: false,
      reason: `${provider.id} declares no probe, so there is no single call that proves it works.`,
    };
  }
  return {
    transport: provider.id,
    supported: true,
    call: provider.probe.tool,
    expects: provider.probe.expects,
    freshness_hours: provider.probe.freshness_hours ?? DEFAULT_FRESHNESS_HOURS,
    instructions: [
      `Call ${provider.probe.tool} yourself. Silver cannot: it never opens a connection.`,
      `A working answer looks like: ${provider.probe.expects}.`,
      "Then record what happened with `silver tools --record-probe <file.json>`.",
      "Record a failure as readily as a success. An unrecorded failure is indistinguishable from never having looked.",
    ],
    record_shape: {
      schema: "silver/transport-probe/v1",
      transport: provider.id,
      tool: provider.probe.tool,
      outcome: "responded | failed | refused",
      detail: "what came back, or what went wrong",
      recorded_at: "<ISO 8601 timestamp>",
      recorded_by: "<which agent called it>",
    },
  };
}

export async function recordProbe({ root, probe, providers = [] }) {
  await assertV2("transport-probe.schema.json", probe);

  // A probe for a transport nobody has heard of records an observation about
  // nothing, and would sit in the results directory looking like evidence.
  if (providers.length > 0 && !providers.some(({ id }) => id === probe.transport)) {
    throw new Error(
      `No transport named ${probe.transport} is installed here, so there is nothing for this probe to be evidence about.`,
    );
  }

  const file = probePath(root, probe.transport);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(probe, null, 2)}\n`, "utf8");
  return { path: path.relative(path.resolve(root), file), probe };
}
