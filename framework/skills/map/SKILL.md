---
name: map
description: Create or revise evidence-linked journey maps, service blueprints, experience maps, and ecosystem maps as portable structured artifacts with local or external views.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*), Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)
---

# Map an experience or service

1. Name the question, map type, current/future state, actors, and active design context.
2. Build stages, lanes, items, and relationships; link evidence or label assumptions.
3. Show pain points and opportunities without upgrading interpretations into facts.
4. Validate and render the portable map, then request review.

Journey maps require actor actions and touchpoints. Service blueprints require
actor actions, frontstage, backstage, support, and system lanes.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold map .
.silver/bin/silver invoke map <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- The portable map validates and pins its design context and provenance.
- Every substantive item has evidence or is explicitly marked as an assumption.
- The local HTML view records the map and context revision.
- Follow-ups are recommended rather than started.
