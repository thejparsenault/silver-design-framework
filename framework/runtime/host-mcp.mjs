// Reading the agent host's MCP configuration.
//
// Silver does not own MCP connections. When a transport is an MCP server, the
// agent host owns the process, the credentials, and the lifecycle — Silver never
// opens a socket and never sees a token. What Silver can do is read the host's
// configuration to learn which servers a designer already has, which is the
// difference between "no tool for that" and "you have one, I just didn't know
// what it was for".
//
// This means availability has two levels, and only one of them is Silver's to
// determine:
//
//   configured  Silver can see the server declared in a host config file.
//   responding  Only the agent can confirm, because only the agent can call it.
//
// Nothing here ever claims `responding`. A transport that is configured but dead
// looks identical from this side, which is why setup steps carry `verify.by` and
// why a result verifies the artifacts that came back rather than the transport
// that claimed to produce them.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

// Where each host keeps MCP server declarations. `scope: user` entries live
// outside the project, so any command that reads them has to disclose that.
export const HOST_CONFIG_SOURCES = [
  { host: "claude-code", scope: "project", file: ".mcp.json", key: "mcpServers" },
  { host: "claude-code", scope: "user", home: ".claude.json", key: "mcpServers" },
  { host: "cursor", scope: "project", file: ".cursor/mcp.json", key: "mcpServers" },
  { host: "cursor", scope: "user", home: ".cursor/mcp.json", key: "mcpServers" },
  { host: "vscode", scope: "project", file: ".vscode/mcp.json", key: "servers" },
];

async function readJson(absolute) {
  try {
    return JSON.parse(await readFile(absolute, "utf8"));
  } catch {
    // A missing file is the normal case; a malformed one is the host's problem,
    // not a reason to stop a designer working.
    return null;
  }
}

function serverNames(document, key) {
  const servers = document?.[key];
  if (!servers || typeof servers !== "object") return [];
  return Object.keys(servers);
}

export function userConfigPaths(home = homedir()) {
  return HOST_CONFIG_SOURCES.filter((source) => source.scope === "user").map(
    (source) => path.join(home, source.home),
  );
}

// Every MCP server the host has declared, with where it came from. Read-only.
export async function readHostMcpServers({ root, home = homedir() } = {}) {
  const found = [];
  for (const source of HOST_CONFIG_SOURCES) {
    const absolute =
      source.scope === "user"
        ? path.join(home, source.home)
        : root
          ? path.join(path.resolve(root), source.file)
          : null;
    if (!absolute) continue;
    const document = await readJson(absolute);
    if (!document) continue;

    for (const name of serverNames(document, source.key)) {
      found.push({ name, host: source.host, scope: source.scope, path: absolute });
    }
    // Claude Code also keeps per-project server sets inside the user file.
    if (source.scope === "user" && root && document.projects) {
      const project = document.projects[path.resolve(root)];
      for (const name of serverNames(project, source.key)) {
        found.push({
          name,
          host: source.host,
          scope: "user-project",
          path: absolute,
        });
      }
    }
  }
  return found;
}

export async function findHostMcpServer(name, options = {}) {
  if (!name) return null;
  const servers = await readHostMcpServers(options);
  return servers.find((server) => server.name === name) ?? null;
}

// The availability answer an MCP-backed provider's health script should give:
// configured or not, and never a claim that it responds.
export async function mcpAvailability(manifest, options = {}) {
  const server = manifest.connection?.server;
  if (!server) {
    return {
      available: false,
      level: "unknown",
      reason: `Provider ${manifest.id} declares no MCP server name.`,
    };
  }
  const found = await findHostMcpServer(server, options);
  if (!found) {
    return {
      available: false,
      level: "absent",
      reason: `No MCP server named ${server} is configured in this agent host.`,
    };
  }
  return {
    available: true,
    level: "configured",
    reason: `Configured as ${server} in ${found.host} (${found.scope}). Whether it responds can only be confirmed by the agent.`,
  };
}

// MCP servers the host has that no shipped provider claims. These are the open
// door: Silver knows they exist and nothing more, so it asks the designer what
// they are for rather than guessing.
export async function unmappedHostServers({ root, providers = [], home = homedir() } = {}) {
  const claimed = new Set(
    providers.map((provider) => provider.connection?.server).filter(Boolean),
  );
  const servers = await readHostMcpServers({ root, home });
  const seen = new Set();
  return servers.filter((server) => {
    if (claimed.has(server.name) || seen.has(server.name)) return false;
    seen.add(server.name);
    return true;
  });
}
