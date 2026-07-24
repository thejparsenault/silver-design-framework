---
name: implement
description: Assess production readiness and rebuild accepted design intent into the local production recipe under production policy. Use when accepted specifications, flows, component proposals, or evaluation findings are ready for reviewable production code.
---

# Implement design

## Workflow

1. Assess readiness from accepted, revision-pinned intent and list missing or conflicting requirements.
2. Stop with findings rather than inventing intent when readiness is incomplete.
3. Rebuild against the static production recipe, semantic styles, and approved component contracts.
4. Run all production-required checks and present a reviewable implementation handoff.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's permission, guardrail, and output checks.

## Done

- Satisfy: accepted-intent-required, missing-intent-reported, prototype-reference-only, production-checks-required.
- Evaluate quality: The implementation reflects accepted intent, semantic styles, approved components, repository conventions, and all required states.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not copy prototype code into production by default.
- Do not commit, push, open a pull request, or deploy automatically.
