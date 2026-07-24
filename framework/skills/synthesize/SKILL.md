---
name: synthesize
description: Convert sanitized evidence, feedback, analytics, briefs, and labeled assumptions into findings, problem frames, opportunities, contradictions, and open questions with provenance. Use after research, feedback, evaluation, analytics, or a seed brief.
---

# Synthesize evidence

## Workflow

1. Confirm every source is sanitized and revision-addressable.
2. Separate observations, analytics, supplied facts, and assumptions.
3. Cluster evidence without erasing contradictions or minority signals.
4. Produce traceable findings and an actionable problem frame.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's permission, guardrail, and output checks.

## Done

- Satisfy: sources-pinned, assumptions-labeled, contradictions-retained.
- Evaluate quality: Findings separate observation, interpretation, confidence, contradiction, and open question.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not fabricate evidence or silently upgrade assumptions into findings.
- Do not rewrite upstream evidence while synthesizing it.
