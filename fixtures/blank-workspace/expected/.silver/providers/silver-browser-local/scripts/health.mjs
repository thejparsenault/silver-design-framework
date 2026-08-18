// Is there a Chrome on this machine?
//
// Unlike an MCP transport, this one Silver can answer completely: it launches
// the browser itself, so finding the executable is the whole question. That is
// why this reports `local` rather than `configured` — there is no agent host in
// between whose connection Silver cannot see.
import { CHROME_CANDIDATES, findChrome } from "../../../runtime/chrome.mjs";

export async function checkAvailability() {
  const executable = await findChrome();
  if (!executable) {
    return {
      available: false,
      level: "absent",
      reason:
        `No Chrome or Chromium found. Looked in: ${CHROME_CANDIDATES.join(", ")}. ` +
        "Set SILVER_CHROME_PATH if yours is elsewhere.",
    };
  }
  return {
    available: true,
    level: "local",
    reason: `Chrome found at ${executable}.`,
  };
}
