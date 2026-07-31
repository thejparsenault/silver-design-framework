---
name: silver-evaluate
description: Define an evaluation question and method, prepare tasks, inspect a sketch or prototype, capture sanitized observations, and produce findings and recommendations. Use for usability testing, expert review, or feedback analysis distinct from deterministic conformance.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Evaluate design

## Workflow

1. Define the decision, question, method, participants or reviewers, and tasks.
2. Inspect the pinned sketch or prototype and capture only sanitized observations.
3. Separate observed behavior from interpretation and deterministic check findings.
4. Produce evidence-linked findings and recommendations for explicit acceptance.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold evaluate .
.silver/bin/silver invoke evaluate <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: question-declared, observations-sanitized, interpretation-separated, conformance-distinct.
- Evaluate quality: Observations, interpretations, confidence, and recommendations remain distinguishable and traceable.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not imply participants or sessions existed when performing only a planned or expert review.
- Do not turn conformance failures into fabricated user evidence.
