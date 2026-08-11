---
schema: silver/artifact/v1
id: design-system
kind: design-system
scope: product
status: draft
owner: product-design
updated: 2026-07-23
authority:
  type: local
summary: Semantic design rules and the reference implementation that demonstrates them.
---

# Design system

This is your design system — seeded with a starting set of tokens and
components, not a universal visual identity. Refine it deliberately with the
`theme` and `system` skills as your brand takes shape.

- `tokens/` — authored source, in three layers (primitive, semantic,
  component). Edit here, or through the `theme` skill.
- `tokens.json` — generated. The resolved, implementation-agnostic index;
  never hand-edited.
- `components.json` — the component index: roles, variants, states, slots.
  No markup or class names — that's an expression's job.
- `expressions/html/` — the default HTML/CSS realization of this system.
  `styles/tokens.css` is generated alongside `tokens.json`; the rest is
  hand-authored structural CSS.
- `showcase.html` — generated. This workspace's own system, rendered. Open it
  any time to see what your tokens and components currently produce. Safe to
  delete; regenerates the next time `system` or `theme` runs.

Production-facing work should consume semantic styles. Raw values belong only
in declared token sources. The project-local design-check skill runs the
independent fast suite for artifact contracts, flow structure, semantic style
use, and prototype policy.
