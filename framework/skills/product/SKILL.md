---
name: product
description: Define or revise product audience, jobs, desired outcomes, constraints, and product-specific positioning. Use for product foundations, audience framing, jobs-to-be-done, outcome definition, or canonical product guidance.
---

# Define product

## Workflow

1. Inspect existing product facts, decisions, and evidence.
2. Clarify audiences, contexts, jobs, desired outcomes, constraints, and credible positioning.
3. Label assumptions and unresolved product questions.
4. Request approval before changing product.md.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's permission, guardrail, and output checks.

## Done

- Satisfy: audience-specific, jobs-observable, outcomes-distinct-from-features.
- Evaluate quality: Product guidance distinguishes audience, job, outcome, constraint, and positioning.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not imply market validation or research that did not occur.
- Do not turn a feature list into an audience or outcome model.
