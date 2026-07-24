---
name: flow
description: Create, render, inspect, or revise a portable user flow, interaction flow, or component behavior flow before or alongside prototyping. Use when a user asks to map a journey, diagram screens or states, tweak a flow, enumerate transitions and decisions, prepare a prototype structure, or define component behavior without committing to a particular design tool.
---

# Create or revise a flow

Treat `flow.json` as the portable design model and generated diagrams or design
canvases as views. Preserve stable node and transition IDs so revisions remain
traceable.

## Workflow

1. Read `design/INDEX.md`, `design/manifest.yaml`, and only the product,
   research, component, or prototype artifacts needed for the request.
2. Choose the narrowest useful flow:
   - `user-flow` for a person’s end-to-end task;
   - `interaction-flow` for behavior across screens or surfaces;
   - `component-flow` for one component’s states and transitions.
3. For a new flow, run `scripts/init-flow.mjs` with a concrete purpose and
   desired outcome. Use a root declared by `flow_policy`.

   ```sh
   node .skills/flow/scripts/init-flow.mjs \
     --id campaign-setup \
     --title "Campaign setup" \
     --purpose "Decide the shortest understandable setup path" \
     --outcome "A valid campaign is ready for review"
   ```
4. Replace the starter nodes with observable states, actions, decisions, and
   outcomes. Capture important alternatives and unresolved questions without
   inventing unsupported product requirements.
5. When revising:
   - retain IDs when a node or transition keeps the same meaning;
   - create a new ID when its meaning changes;
   - increment `revision` and update `updated` for every meaningful change;
   - identify prototypes or component contracts that reference an older
     revision, but do not rewrite them automatically.
6. Run `scripts/check-flow.mjs <flow.json>`. Resolve invalid references,
   unreachable nodes, incomplete decisions, and missing terminal outcomes.
7. Run `scripts/render-flow.mjs <flow.json>` to generate `flow.mmd`. If the
   workspace has an approved canvas adapter, render or synchronize the same
   model there only within resolved permissions and authority.
8. Recommend a prototype, product composition, component contract, research
   question, or another revision when useful. Never start that work
   automatically.

## Boundaries

- Do not require a flow before prototyping or impose a lifecycle stage.
- Do not make a generated view authoritative unless the manifest explicitly
  declares its external source and synchronization policy.
- Do not silently change canonical product, component, or design-system
  artifacts while editing a flow.
- Do not treat structural validation as evidence that the experience is good.
