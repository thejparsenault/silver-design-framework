---
name: silver-principles
description: Create or maintain concrete design decision principles with examples and usable decision tests. Use when a team needs design principles, tradeoff rules, examples, counterexamples, or canonical decision guidance.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Define principles

## Workflow

1. Identify recurring design tensions from product context and decisions.
2. Express each principle as a choice with a reason and decision test.
3. Add examples and counterexamples that expose its boundary.
4. Request approval before changing canonical principles.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold principles .
.silver/bin/silver invoke principles <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: principles-actionable, tests-falsifiable, examples-concrete.
- Evaluate quality: Each principle helps choose between plausible alternatives rather than stating a platitude.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not encode a mandatory lifecycle as a principle.
- Avoid principles that cannot reject any plausible design.
