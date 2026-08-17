---
name: silver-system
description: Define or maintain semantic tokens, color ramps, typography roles, modes, component and pattern registries, deprecations, and migration proposals. Use for design-system maintenance, component catalogs, semantic token changes, or canonical system decisions.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Maintain system

## Workflow

1. Inspect the active token, component, pattern, and deprecation registries.
2. Classify the request as maintenance, extension, deprecation, or migration.
3. Propose semantic changes and affected-consumer migration before applying them.
4. Request approval and record canonical decisions.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold system .
.silver/bin/silver invoke system <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: semantics-before-primitives, deprecations-migratable, canonical-change-approved.
- Evaluate quality: Changes preserve named intent, document affected consumers, and include a migration path.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not disguise product-specific compositions as shared primitives.
- Do not silently widen the design system during another task.
