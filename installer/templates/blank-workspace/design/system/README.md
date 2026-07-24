---
schema: silver/artifact/v1
id: design-system
kind: design-system
scope: product
status: draft
owner: product-design
updated: {{DATE}}
authority:
  type: local
summary: Semantic design rules and the reference implementation that demonstrates them.
---

# Design system

The editable demonstration system lives in `reference-system/`. It illustrates
the primitive-to-semantic token relationship and is a starting point for
deliberate refinement, not a universal visual identity.

Production-facing work should consume semantic styles. Raw values belong only
in declared token sources. The project-local design-check skill runs the
independent fast suite for artifact contracts, flow structure, semantic style
use, and prototype policy.
