---
name: component
description: Inspect the catalog, enumerate states, explore anatomy and behavior, classify composition level, propose a component contract, and document accessibility. Use for new or revised primitives, patterns, product compositions, and component state coverage.
---

# Design component

## Workflow

1. Inspect existing tokens, primitives, patterns, and product compositions first.
2. Classify the proposed component and enumerate anatomy, states, transitions, and content.
3. Document keyboard, focus, semantics, announcements, and responsive behavior.
4. Propose catalog disposition; require approval for canonical registration.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's effect, guardrail, and output checks.

## Done

- Satisfy: catalog-inspected, classification-explicit, states-complete, accessibility-documented.
- Evaluate quality: The proposal separates primitive, reusable pattern, and domain-specific composition with a usable state contract.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not create a duplicate component when an existing contract fits.
- Do not promote a product composition into a shared primitive without evidence.
