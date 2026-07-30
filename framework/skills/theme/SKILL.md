---
name: theme
description: Generate, compare, apply, or revise semantic themes, modes, and mappings without silently introducing raw or unapproved styles. Use for color ramps, semantic mappings, light or dark modes, and approved theme changes.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Generate or apply theme

## Workflow

1. Inspect current semantic roles, modes, brand intent, and approved primitives.
2. Compare proposed ramps and mappings at the semantic layer.
3. Run applicable contrast checks before proposing application.
4. Apply canonical changes only after approval and record the decision.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold theme .
.silver/bin/silver invoke theme <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: semantic-mappings-only, contrast-considered, canonical-change-approved.
- Evaluate quality: Themes preserve semantic meaning across modes and document perceptual and accessibility tradeoffs.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not introduce raw style values directly into product or prototype code.
- Do not infer authority to create a new mode or canonical palette.
