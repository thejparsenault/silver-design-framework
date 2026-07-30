---
name: ideate
description: Generate meaningfully distinct concepts and testable hypotheses grounded in the current problem frame and canonical constraints, then support explicit human selection. Use for divergent product design exploration and hypothesis generation.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Ideate concepts

## Workflow

1. Pin the current problem frame, evidence, principles, and constraints.
2. Generate alternatives with distinct mechanisms, assumptions, and tradeoffs.
3. Express a falsifiable hypothesis and cheapest useful test for each.
4. Pause for explicit selection; record the choice and rejected tradeoffs.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold ideate .
.silver/bin/silver invoke ideate <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: concepts-distinct, hypotheses-testable, selection-explicit.
- Evaluate quality: Alternatives differ in mechanism or product bet, not merely surface treatment.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not select a direction on the user's behalf when human review is required.
- Do not evade design-system constraints through visual novelty.
