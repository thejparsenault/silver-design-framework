# Framework Contracts

This directory contains the versioned, agent-neutral contracts used by the
Design Practice Framework. YAML and JSON instances are both supported; JSON
Schema is the validation language.

## V1 Contracts

| Contract | Purpose |
| --- | --- |
| `manifest.schema.json` | Fixed workspace discovery entry point at `design/manifest.yaml` |
| `artifact.schema.json` | Frontmatter for narrative Markdown artifacts |
| `skill.schema.json` | Capabilities, access, effects, and outputs for a project-local skill |
| `permission-policy.schema.json` | One layer in the permission intersection |
| `flow.schema.json` | Portable user, interaction, or component behavior graph |
| `prototype.schema.json` | Prototype identity, state, and explicit constraint profile |
| `lock.schema.json` | Pinned framework release and installed-file ownership state |
| `finding.schema.json` | One normalized conformance finding |
| `check-result.schema.json` | Checker execution status, coverage, and findings |

## Compatibility Rules

- Contract instances identify their contract with a stable `schema` value such
  as `design-practice/manifest/v1`.
- Unknown top-level fields are rejected. Experimental extensions must be placed
  under `extensions` and use a namespaced key such as `acme.example`.
- New optional fields may be added within v1. Removing fields, changing their
  meaning, or narrowing accepted values requires a new contract version and a
  migration.
- Artifact kinds use the v1 vocabulary or an explicitly namespaced `x-` kind.
- Physical file paths are project-relative. Absolute paths and `..` traversal
  are invalid in repository contracts.

The schemas validate shape. Cross-file semantics—unique artifact IDs, existing
paths, permission intersection, freshness, and lock hashes—belong to
deterministic checks rather than JSON Schema.
