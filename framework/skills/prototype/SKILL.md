---
name: prototype
description: Create or revise a testable simulation for a declared question, constrained by semantic styles by default and pinned to accepted inputs. Use for interaction prototypes, feedback-driven refinement, or explicit partial and suspended experiments.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*), Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)
---

# Build prototype

## Workflow

1. Declare the test question, fidelity, constraint profile, and pinned inputs.
2. Default to constrained; require explicit recorded approval for partial or suspended profiles.
3. Implement only the behavior and states needed to answer the question.
4. Revise only from explicitly accepted findings and rerun applicable checks.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold prototype .
.silver/bin/silver invoke prototype <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: test-question-declared, inputs-pinned, constraint-profile-explicit, accepted-feedback-traced.
- Evaluate quality: The simulation is only as complete as needed to answer its test question and exposes meaningful states.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Treat prototype code as reference material, not production source.
- Do not silently change the design system when the prototype needs a new style.
