export const RENDER_PROVENANCE_ATTRIBUTES = Object.freeze([
  "data-source-id",
  "data-source-revision",
  "data-renderer-version",
  "data-assets-revision",
  "data-design-system-revision",
]);

function attributeValue(html, name) {
  return html.match(new RegExp(`${name}="([^"]+)"`))?.[1] ?? null;
}

export function inspectRenderProvenance(html, expected = {}) {
  const findings = [];
  if (typeof html !== "string" || !html.includes("data-silver-target=")) {
    findings.push("Generated render is missing data-silver-target.");
    return findings;
  }
  for (const attribute of RENDER_PROVENANCE_ATTRIBUTES) {
    if (!attributeValue(html, attribute)) {
      findings.push(`Generated render is missing ${attribute}.`);
    }
  }
  for (const [attribute, value] of [
    ["data-silver-target", expected.target],
    ["data-source-id", expected.id],
    ["data-source-revision", expected.revision],
  ]) {
    if (value !== undefined && attributeValue(html, attribute) !== value) {
      findings.push(`Generated render ${attribute} does not match ${value}.`);
    }
  }
  return findings;
}
