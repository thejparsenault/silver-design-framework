---
name: flow
description: Create, revise, validate, and render portable user, interaction, and component-behavior graphs with stable identities, state coverage, and revision-aware references. Use for task flows, interaction flows, and component state machines.
---

# Develop flow

## Workflow

1. Choose user, interaction, or component behavior scope explicitly.
2. Reuse stable actor, node, and transition identifiers across revisions.
3. Cover start states, decisions, alternate paths, failures, and outcomes.
4. Validate the graph and render a revision-stamped local view.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's permission, guardrail, and output checks.

## Done

- Satisfy: stable-node-identities, outcomes-reachable, states-covered.
- Evaluate quality: The graph exposes decisions, alternate outcomes, system actions, and missing states without depending on one renderer.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Treat Mermaid, Figma, and other views as projections unless authority says otherwise.
- Do not silently rewrite prototypes or specs when a flow revision changes.
