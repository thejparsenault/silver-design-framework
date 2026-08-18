// Why a transport is not working, rung by rung.
//
// `silver tools` reports the *first* failing step because it is deciding what to
// use. When something is broken that is not enough: a designer needs the whole
// ladder — which rungs hold, which one does not, and what to do — otherwise
// "figma-console-mcp: unavailable" sends them somewhere unhelpful when the actual
// problem is that no host config declares the server at all.
//
// 0.9 replaced the authored `setup` ladder with rungs *derived* from what a
// provider already declares — host-config presence, required env vars,
// executable/env/file detection, and probe freshness. Nothing here can drift out
// of agreement with the manifest, because nothing here is a second copy of it.
// What cannot be derived (a one-time command, a mode to enable in the tool
// itself) lives in `post_setup`, shown separately and never "checked".
import { findHostMcpServer } from "./host-mcp.mjs";
import { detectEnv, detectExecutable, detectFiles } from "./tool-detection.mjs";
import { isFresh, readProbe } from "./transport-probes.mjs";

const STATE = {
  held: "held",
  failed: "failed",
  needsAgent: "needs-agent",
  unknown: "unknown",
};

async function connectionStep(provider, options) {
  if (provider.connection?.kind === "mcp") {
    const server = provider.connection.server;
    const found = server ? await findHostMcpServer(server, options) : null;
    return {
      id: "host-config",
      title: `Declare the ${provider.id} MCP server in this agent host`,
      owner: "silver",
      verified_by: "silver",
      state: found ? STATE.held : STATE.failed,
      detail: found
        ? `Declared as ${server} in ${found.host} (${found.scope}).`
        : `No MCP server named ${server} is declared in any host configuration Silver can read. Run \`silver tools --connect ${provider.id}\`, then restart your agent host.`,
    };
  }
  if (provider.connection?.kind === "host-native") {
    return {
      id: "host-native",
      title: "Confirm your agent has this built in",
      owner: "designer",
      verified_by: "agent",
      state: STATE.unknown,
      detail: "Silver cannot see an agent's built-in tools. Only the agent can confirm this exists.",
    };
  }
  if (provider.interface?.detection) {
    const detection = provider.interface.detection;
    const executables = [];
    for (const name of detection.executables ?? []) {
      if (await detectExecutable(name, options)) executables.push(name);
    }
    const env = detectEnv(detection.env, options);
    const files = await detectFiles(detection.files, options);
    const found = executables.length > 0 || env.length > 0 || files.length > 0;
    return {
      id: "interface-detection",
      title: `Detect ${provider.id} on this machine`,
      owner: "designer",
      verified_by: "silver",
      state: found ? STATE.held : STATE.failed,
      detail: found
        ? `Found ${[...executables.map((n) => `executable ${n}`), ...env.map((n) => `env ${n}`), ...files.map((n) => `file ${n}`)].join(", ")}.`
        : `None of the declared detection (${[...(detection.executables ?? []), ...(detection.env ?? []), ...(detection.files ?? [])].join(", ") || "none declared"}) was found.`,
    };
  }
  return null;
}

function envStep(provider) {
  if (!provider.requires_env?.length) return null;
  const missing = provider.requires_env.filter((name) => !process.env[name]);
  return {
    id: "env",
    title: "Required environment variables",
    owner: "designer",
    verified_by: "silver",
    state: missing.length === 0 ? STATE.held : STATE.failed,
    // Names only. Silver never reads, writes, or prints a value.
    detail: missing.length === 0 ? "Every required environment variable is set." : `Not set: ${missing.join(", ")}.`,
  };
}

async function probeStep(provider, probe) {
  if (!provider.probe) return null;
  if (probe?.outcome === "responded" && isFresh(probe, provider)) {
    return {
      id: "probe",
      title: "Confirm it actually responds",
      owner: "designer",
      verified_by: "agent",
      state: STATE.held,
      detail: `The agent confirmed this by calling ${probe.tool ?? "the tool"}.`,
    };
  }
  if (probe && probe.outcome !== "responded") {
    return {
      id: "probe",
      title: "Confirm it actually responds",
      owner: "designer",
      verified_by: "agent",
      state: STATE.failed,
      detail: probe.detail ?? `The agent's call ${probe.outcome}.`,
    };
  }
  return {
    id: "probe",
    title: "Confirm it actually responds",
    owner: "designer",
    verified_by: "agent",
    state: STATE.needsAgent,
    detail: "Only the agent can confirm this. Run `silver tools --probe` and record the result.",
  };
}

export async function diagnoseTransport(provider, options = {}) {
  const probe = options.root ? await readProbe(options.root, provider.id) : null;
  const steps = [
    await connectionStep(provider, options),
    envStep(provider),
    await probeStep(provider, probe),
  ].filter(Boolean);

  const failed = steps.filter((step) => step.state === STATE.failed);
  const pending = steps.filter((step) => step.state === STATE.needsAgent);

  return {
    transport: provider.id,
    ...(provider.target ? { target: provider.target } : {}),
    origin: provider.origin,
    execution: provider.execution,
    available: provider.available,
    level: provider.availability_level,
    reason: provider.availability_reason,
    ...(probe
      ? {
          probe: {
            outcome: probe.outcome,
            recorded_at: probe.recorded_at,
            fresh: isFresh(probe, provider),
            ...(probe.detail ? { detail: probe.detail } : {}),
          },
        }
      : {}),
    steps,
    ...(provider.post_setup?.length ? { post_setup: provider.post_setup } : {}),
    // The summary a designer acts on. "Silver cannot tell" is a real answer and
    // is kept distinct from "broken", because they need different next moves.
    verdict:
      failed.length > 0
        ? "blocked"
        : pending.length > 0
          ? "needs-agent"
          : provider.available
            ? "working"
            : "unknown",
    ...(failed.length > 0 ? { blocked_at: failed[0].id } : {}),
    ...(provider.probe && !probe
      ? { next: `Run \`silver tools --probe ${provider.id}\` to confirm it actually responds.` }
      : {}),
  };
}
