---
name: sketch
description: Generate inexpensive alternatives from a brief, concept, specification, flow, or existing screen while recording fidelity separately from artifact type and honoring the constraint profile. Use for quick screen or component exploration before prototyping.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*), Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)
---

# Sketch alternatives

## Workflow

1. Declare the question, fidelity, active constraint profile, and pinned inputs.
2. Generate alternatives that vary consequential structure or interaction.
3. Render locally with semantic styles or the declared constrained subset.
4. Record tradeoffs and request lightweight human review.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold sketch .
.silver/bin/silver invoke sketch <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: fidelity-declared, alternatives-cheap, constraint-profile-honored.
- Evaluate quality: Sketches make consequential structure and behavior choices reviewable without false production fidelity.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not invent raw styles, even for wireframes; use an approved subset.
- Do not equate sketch role with a mandatory visual fidelity.
