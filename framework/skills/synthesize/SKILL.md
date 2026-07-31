---
name: silver-synthesize
description: Convert sanitized evidence, feedback, analytics, briefs, and labeled assumptions into findings, problem frames, opportunities, contradictions, and open questions with provenance. Use after research, feedback, evaluation, analytics, or a seed brief.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Synthesize evidence

## Workflow

1. Confirm every source is sanitized and revision-addressable.
2. Separate observations, analytics, supplied facts, and assumptions.
3. Cluster evidence without erasing contradictions or minority signals.
4. Produce traceable findings and an actionable problem frame.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold synthesize .
.silver/bin/silver invoke synthesize <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: sources-pinned, assumptions-labeled, contradictions-retained.
- Evaluate quality: Findings separate observation, interpretation, confidence, contradiction, and open question.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not fabricate evidence or silently upgrade assumptions into findings.
- Do not rewrite upstream evidence while synthesizing it.
