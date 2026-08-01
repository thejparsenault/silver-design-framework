// Writing an MCP server declaration into the agent host's configuration.
//
// This is the one rung of a setup ladder Silver performs itself, and it is the
// same class of act as the `.claude/skills` links and `CLAUDE.md` block already
// generated: a reversible, reviewable, host-specific adapter. Everything above
// it on the ladder — installing software, cloning, building, launching a
// process, authorizing a connection — belongs to the designer, and Silver prints
// the exact steps rather than performing them.
//
// Two hard rules:
//
//   Never a secret. The declaration names environment variables; their values
//   are never read, written, or logged. The existing project-configuration
//   secret scanner gates everything written here.
//
//   Never without asking. Writing requires an explicit `--connect`, the same
//   shape as `--apply` and `--record` elsewhere in this CLI.
import path from "node:path";

import { assertNoSecrets } from "../framework/runtime/representations.mjs";
import { exists, readUtf8, writeUtf8 } from "./lib/files.mjs";

// Claude Code's project-scoped file. Project scope on purpose: a workspace's
// tools belong with the workspace, and a user-scoped write would reach outside
// the project to change how every other project behaves.
export const PROJECT_MCP_PATH = ".mcp.json";

export function connectableTransports(providers) {
  return providers.filter(
    (provider) =>
      provider.connection?.kind === "mcp" &&
      provider.connection.server &&
      provider.connection.config,
  );
}

function manualSteps(provider) {
  return (provider.setup ?? [])
    .filter((step) => step.kind !== "silver-managed")
    .map((step) => ({
      id: step.id,
      kind: step.kind,
      title: step.title,
      ...(step.url ? { url: step.url } : {}),
      ...(step.commands ? { commands: step.commands } : {}),
    }));
}

async function readProjectConfig(root) {
  const absolute = path.join(path.resolve(root), PROJECT_MCP_PATH);
  if (!(await exists(absolute))) return { absolute, document: null };
  try {
    return { absolute, document: JSON.parse(await readUtf8(absolute)) };
  } catch (error) {
    throw new Error(
      `${PROJECT_MCP_PATH} is not valid JSON, so Silver will not rewrite it: ${error.message}`,
    );
  }
}

// What would change, without changing it.
export async function planHostMcpConfig({ root, providers, transport }) {
  if (transport && !providers.some((provider) => provider.id === transport)) {
    throw new Error(`No shipped transport with id ${transport} is installed here.`);
  }
  const candidates = connectableTransports(providers).filter(
    (provider) => !transport || provider.id === transport,
  );
  // A transport Silver knows about but cannot launch is not an error. Silver
  // does not know every server's start command and will not invent one, so it
  // hands back the ladder instead of writing a guess into the host config.
  if (transport && candidates.length === 0) {
    const provider = providers.find((entry) => entry.id === transport);
    return {
      path: PROJECT_MCP_PATH,
      absolute: path.join(path.resolve(root), PROJECT_MCP_PATH),
      additions: [],
      already_present: [],
      manual_only: {
        transport,
        server: provider.connection?.server,
        reason:
          "Silver does not know how this server is started, and will not guess a command into your agent configuration.",
        manual_steps: manualSteps(provider),
      },
    };
  }
  const { absolute, document } = await readProjectConfig(root);
  const existing = document?.mcpServers ?? {};
  return {
    path: PROJECT_MCP_PATH,
    absolute,
    additions: candidates
      .filter((provider) => !(provider.connection.server in existing))
      .map((provider) => ({
        transport: provider.id,
        server: provider.connection.server,
        config: provider.connection.config,
        ...(provider.requires_env ? { requires_env: provider.requires_env } : {}),
        // Rungs Silver will not climb. Printed so the remaining work is visible
        // rather than discovered when the transport does not respond.
        manual_steps: manualSteps(provider),
      })),
    already_present: candidates
      .filter((provider) => provider.connection.server in existing)
      .map((provider) => provider.id),
  };
}

export async function writeHostMcpConfig({ root, providers, transport }) {
  const plan = await planHostMcpConfig({ root, providers, transport });
  if (plan.additions.length === 0) return { ...plan, written: false };

  const { absolute, document } = await readProjectConfig(root);
  const next = { ...(document ?? {}) };
  next.mcpServers = { ...(next.mcpServers ?? {}) };
  for (const addition of plan.additions) {
    next.mcpServers[addition.server] = addition.config;
  }
  // Gate the whole document, not just the additions: if a project file already
  // carries a credential, Silver must not rewrite it and re-bless it.
  assertNoSecrets(next);
  await writeUtf8(absolute, `${JSON.stringify(next, null, 2)}\n`);
  return { ...plan, written: true };
}
