---
name: pitch
description: Produce an evidence-linked opportunity, proposal, or outcome change case and optional branded presentation view using the project presentation kit. Use to show before state, reasons, after state, tradeoffs, decision request, and estimated, proxy, or measured impact.
---

# Build change case

## Workflow

1. Choose opportunity, proposal, or outcome mode and pin accepted evidence and design sources.
2. Structure before state, reasons, after state, impact, tradeoffs, and decision request.
3. Label impact as estimated, proxy, or measured with its source and confidence.
4. Optionally render a branded local HTML view from the pinned presentation kit.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's permission, guardrail, and output checks.

## Done

- Satisfy: sources-pinned, impact-kind-explicit, decision-request-clear, external-publish-separate.
- Evaluate quality: The case distinguishes evidence from inference and makes the requested decision and tradeoffs legible.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not publish, present, or send without separate permission.
- Do not imply stakeholder acceptance, measured impact, or production deployment.
