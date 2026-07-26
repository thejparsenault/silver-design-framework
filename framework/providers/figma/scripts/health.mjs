export async function checkAvailability() {
  return {
    available: false,
    reason: "No live Figma transport is configured; captured fixtures remain usable for deterministic reconciliation.",
  };
}
