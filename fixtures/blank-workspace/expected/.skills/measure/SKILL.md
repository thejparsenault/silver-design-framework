---
name: silver-measure
description: Close the loop after implementation by determining whether a shipped design or product change achieved its intended outcome — reviewing instrumentation, inspecting analytics, comparing before/after, and stating confidence and limitations. Use after implementation, or whenever an outcome needs to be checked against its original success criteria.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Measure an outcome

## Workflow

1. Restate the hypothesis and success criteria the change was meant to test.
2. State what instrumentation exists and whether it is sufficient to answer the question.
3. Compare before and after, or the experiment result, without treating correlation as causation.
4. Record confidence and limitations; feed observed outcomes back into synthesis.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold measure .
.silver/bin/silver invoke measure <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: metrics-tied-to-hypothesis, instrumentation-stated, data-limits-recorded.
- Evaluate quality: Observed outcomes stay traceable to the success criteria they test,
  with instrumentation and data limits stated rather than implied.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not define success criteria; that is `specify`.
- Do not interpret mixed research evidence broadly; that is `synthesize`.
- Do not fabricate analytics or claim measurement occurred without actual data.
- Do not treat correlation as causation without evidence, or overstate confidence when
  instrumentation or sample quality is weak.
