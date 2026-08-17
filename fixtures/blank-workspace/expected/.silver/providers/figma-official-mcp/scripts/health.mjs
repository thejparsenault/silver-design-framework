// Configured, not responding. See figma-console-mcp/scripts/health.mjs.
import { mcpAvailability } from "../../../runtime/host-mcp.mjs";

export async function checkAvailability({ manifest, root, home } = {}) {
  return mcpAvailability(manifest, { root, home });
}
