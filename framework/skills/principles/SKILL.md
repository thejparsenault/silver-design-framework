---
name: principles
description: Create or maintain concrete design decision principles with examples and usable decision tests. Use when a team needs design principles, tradeoff rules, examples, counterexamples, or canonical decision guidance.
---

# Define principles

## Workflow

1. Identify recurring design tensions from product context and decisions.
2. Express each principle as a choice with a reason and decision test.
3. Add examples and counterexamples that expose its boundary.
4. Request approval before changing canonical principles.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's effect, guardrail, and output checks.

## Done

- Satisfy: principles-actionable, tests-falsifiable, examples-concrete.
- Evaluate quality: Each principle helps choose between plausible alternatives rather than stating a platitude.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not encode a mandatory lifecycle as a principle.
- Avoid principles that cannot reject any plausible design.
