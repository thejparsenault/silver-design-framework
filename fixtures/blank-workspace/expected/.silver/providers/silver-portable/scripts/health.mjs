export async function checkAvailability() {
  return {
    available: true,
    reason: "Bundled repository-only provider is available.",
  };
}
