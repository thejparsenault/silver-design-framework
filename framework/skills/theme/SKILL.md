---
name: theme
description: Generate, compare, apply, or revise semantic themes, modes, and mappings without silently introducing raw or unapproved styles. Use for color ramps, semantic mappings, light or dark modes, and approved theme changes.
---

# Generate or apply theme

## Workflow

1. Inspect current semantic roles, modes, brand intent, and approved primitives.
2. Compare proposed ramps and mappings at the semantic layer.
3. Run applicable contrast checks before proposing application.
4. Apply canonical changes only after approval and record the decision.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's permission, guardrail, and output checks.

## Done

- Satisfy: semantic-mappings-only, contrast-considered, canonical-change-approved.
- Evaluate quality: Themes preserve semantic meaning across modes and document perceptual and accessibility tradeoffs.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not introduce raw style values directly into product or prototype code.
- Do not infer permission to create a new mode or canonical palette.
