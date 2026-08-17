// Availability for an MCP-backed transport is "is it configured", never "does it
// respond". Silver cannot call an MCP server — the agent host owns that
// connection — so claiming anything stronger here would be exactly the kind of
// unbacked assertion 0.7 spent a release removing.
import { mcpAvailability } from "../../../runtime/host-mcp.mjs";

export async function checkAvailability({ manifest, root, home } = {}) {
  return mcpAvailability(manifest, { root, home });
}
