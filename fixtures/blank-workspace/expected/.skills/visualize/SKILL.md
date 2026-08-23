---
name: silver-visualize
description: Create static visual representations of a proposed product experience from a brief, concept, specification, structure, flow, or existing screen, at whatever fidelity is useful — rough sketches through polished interface designs — while recording fidelity separately from artifact type and honoring the constraint profile. Use for screen or component exploration before prototyping.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Visualize a design

## Workflow

1. Declare the question, fidelity, active constraint profile, and pinned inputs.
2. Generate alternatives that vary consequential structure or interaction.
3. Render locally with semantic styles or the declared constrained subset.
4. Record tradeoffs and request lightweight human review.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold visualize .
.silver/bin/silver invoke visualize <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: fidelity-declared, alternatives-distinguishable, constraint-profile-honored.
- Evaluate quality: Visualizations make consequential structure and behavior choices
  reviewable without overstating fidelity.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not invent raw styles, even for rough wireframes; use an approved subset.
- Static only. Interactive or testable behavior belongs to `prototype`, not here.
