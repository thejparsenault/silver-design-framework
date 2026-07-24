---
name: brand
description: Define, refine, or review audience-facing brand foundations and explicitly approved visual implications. Use for brand promise, desired feeling, attributes, anti-attributes, positioning evidence, or canonical brand guidance.
---

# Define brand

## Workflow

1. Read product and existing brand context before asking consequential questions.
2. Separate working hypotheses from accepted canonical guidance.
3. Present tradeoffs and request approval before changing brand.md.
4. Record material redirections as normal design decisions.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's permission, guardrail, and output checks.

## Done

- Satisfy: audience-named, claims-grounded, visual-changes-proposed-only.
- Evaluate quality: Guidance is specific enough to guide product and communication choices.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not silently change themes, tokens, components, or production source.
- Do not replace product facts with generic brand language.
