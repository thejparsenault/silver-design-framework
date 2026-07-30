---
name: product
description: Define or revise product audience, jobs, desired outcomes, constraints, and product-specific positioning. Use for product foundations, audience framing, jobs-to-be-done, outcome definition, or canonical product guidance.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Define product

## Workflow

1. Inspect existing product facts, decisions, and evidence.
2. Clarify audiences, contexts, jobs, desired outcomes, constraints, and credible positioning.
3. Label assumptions and unresolved product questions.
4. Request approval before changing product.md.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold product .
.silver/bin/silver invoke product <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: audience-specific, jobs-observable, outcomes-distinct-from-features.
- Evaluate quality: Product guidance distinguishes audience, job, outcome, constraint, and positioning.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not imply market validation or research that did not occur.
- Do not turn a feature list into an audience or outcome model.
