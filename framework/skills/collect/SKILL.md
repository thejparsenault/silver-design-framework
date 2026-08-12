---
name: silver-collect
description: Gather evidence from declared sources — web research, competitor products, live sites, browser inspection, repositories, linked documentation, or supplied material — while preserving provenance and separating direct observation from interpretation. Use between planning research and synthesizing evidence.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Collect evidence

## Workflow

1. Name the source, what was asked of it, and when it was retrieved.
2. Capture only what was directly observed; do not draw conclusions yet.
3. Sanitize before it is written; never carry unsanitized material forward.
4. Record the source pin so provenance holds without the source itself.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold collect .
.silver/bin/silver invoke collect <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: sources-declared, observation-separated-from-interpretation, collection-occurred.
- Evaluate quality: Evidence preserves where it came from and keeps direct observation
  distinguishable from interpretation.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not define research questions, methods, participants, or scripts; that is `research`.
- Do not turn evidence into findings, themes, or implications; that is `synthesize`.
- Do not claim evidence was gathered when nothing was actually collected.
- Do not capture inspiration, prior art, or competitor screenshots here; use
  `design/references/` instead, cited explicitly where relevant.
