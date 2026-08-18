---
name: silver-structure
description: Define and refine information architecture, navigation structure, taxonomy, content models, and object models — what exists, how it is organized, and how things relate. Distinct from flow (sequences over time) and map (broader relational views).
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Structure information architecture

## Workflow

1. Name the question and the structure type: information architecture, navigation,
   content model, taxonomy, or object model.
2. Define entities, their attributes, and parent/child relationships where they exist.
3. Define relationships between entities, including cardinality where it is known.
4. Record structural rules that govern organization; leave genuine ambiguity recorded
   rather than resolved by assumption.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold structure .
.silver/bin/silver invoke structure <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: entities-named, relationships-explicit, ambiguity-recorded.
- Evaluate quality: What exists, how it is organized, and how things relate are
  reviewable without conflating structure with sequence.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not describe sequences, user actions, or transitions; that is `flow`.
- Do not describe journeys, service blueprints, or ecosystem-level relational views;
  that is `map`.
- Do not define detailed reusable interface components; that is `component`.
- Do not define design-system primitives, tokens, or registries; that is `system`.
