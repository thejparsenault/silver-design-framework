---
name: specify
description: Create or revise a living design specification covering outcomes, hypothesis, scope, requirements, states, edge cases, accessibility, success criteria, linked revisions, decisions, and open questions. Use after concept selection or whenever durable design intent is needed.
---

# Specify design

## Workflow

1. Pin the selected concept, hypothesis, product context, and decisions.
2. Define outcomes, scope, non-goals, requirements, content, data, states, and edge cases.
3. Declare accessibility expectations and success criteria before evaluating output.
4. Preserve open questions and revise through explicit new revisions.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's permission, guardrail, and output checks.

## Done

- Satisfy: scope-and-nongoals, states-and-edge-cases, success-fixed-before-evaluation.
- Evaluate quality: The specification makes missing intent visible and supports design or implementation without prescribing incidental detail.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not invent requirements to make the specification appear complete.
- Do not turn every implementation detail into canonical design intent.
