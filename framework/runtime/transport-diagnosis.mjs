// Why a transport is not working, rung by rung.
//
// `silver tools` reports the *first* failing step because it is deciding what to
// use. When something is broken that is not enough: a designer needs the whole
// ladder, which rungs hold, which one does not, who owns it, and what to do —
// otherwise "figma-console-mcp: unavailable" sends them to restart Figma when
// the actual problem is that no host config declares the server at all.
//
// The typed `verify.by` field is what makes this honest. Silver checks the rungs
// it can check and says plainly that the rest are the agent's to confirm, rather
// than reporting an unknown as a failure.
import { findHostMcpServer } from "./host-mcp.mjs";
import { isFresh, readProbe } from "./transport-probes.mjs";

const STATE = {
  held: "held",
  failed: "failed",
  needsAgent: "needs-agent",
  unknown: "unknown",
};

async function verifyStep(step, provider, { root, home, probe }) {
  const by = step.verify?.by;

  if (by === "agent") {
    // Only the agent can call a tool or complete a handshake. If it already
    // did and recorded the answer, that evidence settles the rung.
    if (probe?.outcome === "responded" && isFresh(probe, provider)) {
      return {
        state: STATE.held,
        detail: `The agent confirmed this by calling ${probe.tool ?? "the tool"}.`,
      };
    }
    if (probe && probe.outcome !== "responded") {
      return {
        state: STATE.failed,
        detail: probe.detail ?? `The agent's call ${probe.outcome}.`,
      };
    }
    return {
      state: STATE.needsAgent,
      detail:
        "Only the agent can confirm this. Run `silver tools --probe` and record the result.",
    };
  }

  switch (step.verify?.kind) {
    case "host-mcp-entry": {
      const server = provider.connection?.server;
      if (!server) {
        return { state: STATE.unknown, detail: "This transport names no MCP server." };
      }
      const found = await findHostMcpServer(server, { root, home });
      return found
        ? {
            state: STATE.held,
            detail: `Declared as ${server} in ${found.host} (${found.scope}).`,
          }
        : {
            state: STATE.failed,
            detail: `No MCP server named ${server} is declared in any host configuration Silver can read.`,
          };
    }
    case "path": {
      // A path rung means Silver launches this itself, so its own availability
      // check is the authority on whether the binary is there.
      return provider.available
        ? { state: STATE.held, detail: provider.availability_reason }
        : { state: STATE.failed, detail: provider.availability_reason };
    }
    case "env": {
      const missing = (provider.requires_env ?? []).filter(
        (name) => !process.env[name],
      );
      return missing.length === 0
        ? { state: STATE.held, detail: "Every required environment variable is set." }
        : {
            state: STATE.failed,
            // Names only. Silver never reads, writes, or prints a value.
            detail: `Not set: ${missing.join(", ")}.`,
          };
    }
    default:
      return {
        state: STATE.unknown,
        detail: "Silver has no way to check this rung.",
      };
  }
}

export async function diagnoseTransport(provider, options = {}) {
  const probe = options.root ? await readProbe(options.root, provider.id) : null;
  const steps = [];
  for (const step of provider.setup ?? []) {
    const result = await verifyStep(step, provider, { ...options, probe });
    steps.push({
      id: step.id,
      title: step.title,
      kind: step.kind,
      // Who does this one. Silver climbs only its own rungs and says so, rather
      // than reporting a step it will never perform as merely incomplete.
      owner: step.kind === "silver-managed" ? "silver" : "designer",
      verified_by: step.verify?.by ?? "silver",
      state: result.state,
      detail: result.detail,
      ...(step.url ? { url: step.url } : {}),
      ...(step.commands ? { commands: step.commands } : {}),
      // The answer arrives with the problem rather than living in a wiki.
      ...(result.state === STATE.failed && step.troubleshoot
        ? { troubleshoot: step.troubleshoot }
        : {}),
    });
  }

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
