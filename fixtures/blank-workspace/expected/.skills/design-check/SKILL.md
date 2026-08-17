---
name: silver-design-check
description: Discover and run applicable independent design checks for a declared target and policy, preserve every result, and summarize coverage. Use for conformance, browser, accessibility, responsive, interaction, provenance, asset, presentation, and production readiness checks.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Check design

## Workflow

1. Discover checks applicable to the declared target and policy profile.
2. Run each checker independently and preserve its normalized result.
3. Report unavailable required targets or providers as not-run.
4. Summarize coverage and recommend corrections without performing design work.

Run the guarded fast suite through the CLI. It executes every declared fast
checker, persists one evidence file per checker, and records the normalized
design-check skill result:

```sh
.silver/bin/silver invoke --scaffold design-check .
.silver/bin/silver invoke design-check <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

When a declared render target also needs live browser verification, run the
browser suite separately after the fast suite:

```sh
node .skills/design-check/scripts/run-browser.mjs --root .
```

The browser suite reports `not-run` rather than pass when Chrome or a target is
unavailable.

## Done

- Satisfy: checks-independent, results-preserved, not-run-never-pass.
- Evaluate quality: The summary names requested, completed, failed, and unavailable coverage without changing the target.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not fix designs or code as part of a check invocation.
- Never collapse failed or not-run results into a passing suite.
