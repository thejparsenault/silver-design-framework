// One classifier for how a declared artifact kind is stored on disk.
//
// Three places used to answer this independently and disagree: `what-now`
// pushed every declared path through a file reader and reported the
// directory-backed component catalog as missing; `doctor` fell through to a
// "not Markdown" warning for the two JSON artifacts every workspace ships; and
// `check-artifacts` was the only one that got both right. A fresh, healthy
// workspace could therefore be simultaneously healthy, blocked, and suspect.
//
// This module is deliberately dependency-free and holds no I/O, so every
// consumer can import it directly. The relative path from one skill's scripts
// directory to this one is the same in the source tree and in an installed
// workspace (`../../design-check/scripts/artifact-kinds.mjs`), so no resolution
// fallback is needed.

// Backed by a directory of files rather than a single document. The catalog's
// contract is the set of contracts it contains, not frontmatter.
const DIRECTORY_KINDS = new Set(["component-catalog"]);

// Structured documents validated against a JSON Schema. These are intentionally
// not Markdown and have no frontmatter to check.
const STRUCTURED_KINDS = new Map([
  ["asset-catalog", "asset-catalog.schema.json"],
  ["presentation-kit", "presentation-kit.schema.json"],
  ["x-component-expression", "component-expression.schema.json"],
  ["x-design-context", "design-context.schema.json"],
]);

// Structured registries that wrap a list of schema-validated entries.
const REGISTRY_KINDS = new Map([
  [
    "x-guidance-source",
    {
      schema: "silver/guidance-registry/v1",
      entrySchema: "guidance-source.schema.json",
      label: "Guidance registry",
    },
  ],
  [
    "x-linked-source",
    {
      schema: "silver/source-registry/v1",
      entrySchema: "linked-source.schema.json",
      label: "Linked source registry",
    },
  ],
]);

// Carried for migration and external-provider compatibility, but inactive since
// 0.5. Nothing validates it and nothing should warn about it.
const INACTIVE_KINDS = new Set(["permission-policy"]);

export function isDirectoryKind(kind) {
  return DIRECTORY_KINDS.has(kind);
}

export function isInactiveKind(kind) {
  return INACTIVE_KINDS.has(kind);
}

export function isStructuredKind(kind) {
  return STRUCTURED_KINDS.has(kind) || REGISTRY_KINDS.has(kind);
}

export function structuredSchemaFor(kind) {
  return STRUCTURED_KINDS.get(kind) ?? null;
}

export function registryContractFor(kind) {
  return REGISTRY_KINDS.get(kind) ?? null;
}

// A narrative artifact records intent and judgement in Markdown with
// frontmatter. Everything that is not a directory, a structured document, or an
// inactive legacy file is one.
export function isMarkdownNarrativeKind(kind) {
  return (
    !isDirectoryKind(kind) && !isStructuredKind(kind) && !isInactiveKind(kind)
  );
}

// What a consumer should do with a declared artifact, as one value.
export function artifactStorage(kind) {
  if (isDirectoryKind(kind)) return "directory";
  if (isInactiveKind(kind)) return "inactive";
  if (isStructuredKind(kind)) return "structured";
  return "narrative";
}
