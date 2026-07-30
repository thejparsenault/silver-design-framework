---
name: specify
description: Create or revise a living design specification covering outcomes, hypothesis, scope, requirements, states, edge cases, accessibility, success criteria, linked revisions, decisions, and open questions. Use after concept selection or whenever durable design intent is needed.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Specify design

## Workflow

1. Pin the selected concept, hypothesis, product context, and decisions.
2. Define outcomes, scope, non-goals, requirements, content, data, states, and edge cases.
3. Declare accessibility expectations and success criteria before evaluating output.
4. Preserve open questions and revise through explicit new revisions.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold specify .
.silver/bin/silver invoke specify <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: scope-and-nongoals, states-and-edge-cases, success-fixed-before-evaluation.
- Evaluate quality: The specification makes missing intent visible and supports design or implementation without prescribing incidental detail.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not invent requirements to make the specification appear complete.
- Do not turn every implementation detail into canonical design intent.
