---
name: ideate
description: Generate meaningfully distinct concepts and testable hypotheses grounded in the current problem frame and canonical constraints, then support explicit human selection. Use for divergent product design exploration and hypothesis generation.
---

# Ideate concepts

## Workflow

1. Pin the current problem frame, evidence, principles, and constraints.
2. Generate alternatives with distinct mechanisms, assumptions, and tradeoffs.
3. Express a falsifiable hypothesis and cheapest useful test for each.
4. Pause for explicit selection; record the choice and rejected tradeoffs.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's permission, guardrail, and output checks.

## Done

- Satisfy: concepts-distinct, hypotheses-testable, selection-explicit.
- Evaluate quality: Alternatives differ in mechanism or product bet, not merely surface treatment.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not select a direction on the user's behalf when human review is required.
- Do not evade design-system constraints through visual novelty.
