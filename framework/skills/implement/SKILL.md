---
name: silver-implement
description: Assess production readiness and rebuild accepted design intent into the local production recipe under production policy. Use when accepted specifications, flows, component proposals, or evaluation findings are ready for reviewable production code.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Implement design

## Workflow

1. Assess readiness from accepted, revision-pinned intent and list missing or conflicting requirements.
2. Stop with findings rather than inventing intent when readiness is incomplete.
3. Rebuild against the static production recipe, semantic styles, and approved component contracts.
4. Run all production-required checks and present a reviewable implementation
   handoff. Default the proposed engineering handoff to a draft branch or pull
   request when the repository host supports it.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold implement .
.silver/bin/silver invoke implement <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: accepted-intent-required, missing-intent-reported, prototype-reference-only, production-checks-required.
- Evaluate quality: The implementation reflects accepted intent, semantic styles, approved components, repository conventions, and all required states.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not copy prototype code into production by default.
- The accepted local checkpoint does not push or open a pull request.
- An explicitly requested commit, push, draft pull request, merge, or other
  Git/GitHub action may proceed when repository instructions, branch
  protection, permissions, and the agent host allow it.
- Do not deploy automatically.
