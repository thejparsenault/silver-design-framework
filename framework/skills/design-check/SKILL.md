---
name: design-check
description: Discover and run applicable independent design checks for a declared target and policy, preserve every result, and summarize coverage. Use for conformance, browser, accessibility, responsive, interaction, provenance, asset, presentation, and production readiness checks.
---

# Check design

## Workflow

1. Discover checks applicable to the declared target and policy profile.
2. Run each checker independently and preserve its normalized result.
3. Report unavailable required targets or providers as not-run.
4. Summarize coverage and recommend corrections without performing design work.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's effect, guardrail, and output checks.

## Done

- Satisfy: checks-independent, results-preserved, not-run-never-pass.
- Evaluate quality: The summary names requested, completed, failed, and unavailable coverage without changing the target.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not fix designs or code as part of a check invocation.
- Never collapse failed or not-run results into a passing suite.
