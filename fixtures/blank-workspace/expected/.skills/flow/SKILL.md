---
name: silver-flow
description: Create, revise, validate, and render portable user, interaction, and component-behavior graphs with stable identities, state coverage, and revision-aware references. Use for task flows, interaction flows, and component state machines.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Develop flow

## Workflow

1. Choose user, interaction, or component behavior scope explicitly.
2. Reuse stable actor, node, and transition identifiers across revisions.
3. Cover start states, decisions, alternate paths, failures, and outcomes.
4. Validate the graph and render a revision-stamped local view.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold flow .
.silver/bin/silver invoke flow <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: stable-node-identities, outcomes-reachable, states-covered.
- Evaluate quality: The graph exposes decisions, alternate outcomes, system actions, and missing states without depending on one renderer.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Treat Mermaid, Figma, and other views as projections unless authority says otherwise.
- Do not silently rewrite prototypes or specs when a flow revision changes.
