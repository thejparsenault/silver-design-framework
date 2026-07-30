---
name: system
description: Define or maintain semantic tokens, color ramps, typography roles, modes, component and pattern registries, deprecations, and migration proposals. Use for design-system maintenance, component catalogs, semantic token changes, or canonical system decisions.
---

# Maintain system

## Workflow

1. Inspect the active token, component, pattern, and deprecation registries.
2. Classify the request as maintenance, extension, deprecation, or migration.
3. Propose semantic changes and affected-consumer migration before applying them.
4. Request approval and record canonical decisions.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's effect, guardrail, and output checks.

## Done

- Satisfy: semantics-before-primitives, deprecations-migratable, canonical-change-approved.
- Evaluate quality: Changes preserve named intent, document affected consumers, and include a migration path.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not disguise product-specific compositions as shared primitives.
- Do not silently widen the design system during another task.
