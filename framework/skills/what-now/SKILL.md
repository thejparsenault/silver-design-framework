---
name: what-now
description: Inspect a Silver workspace and recommend several evidence-based next actions without starting them. Use when work is resuming, context is missing, priorities are unclear, or the user asks what to do next.
---

# Decide what to do next

## Workflow

1. Inspect the manifest, lock, skill and check results, playbook runs, bindings, reconciliation records, and declared artifact paths.
2. Prefer invalid or incomplete workspace state, pending checkpoints, failures, stale work, and freshness blockers over new work.
3. Use semantic timestamps only to order otherwise equivalent choices; use filesystem modification time only when structured time is unavailable.
4. Present three to five ranked choices with evidence and leave selection to the user.

Run `node scripts/analyze-workspace.mjs --root <workspace> --now <iso-time>` first. Copy its `invocation_recommendations` into a guarded invocation request as `recommended_next_actions`, then run `node scripts/invoke.mjs <request.json> --root <workspace>` to persist the normalized read-only result.

## Done

- Satisfy: workspace-state-inspected, recommendations-evidence-linked, structured-state-prioritized, no-action-started.
- Evaluate quality: Recommendations are ranked, actionable, traceable to current workspace evidence, and never substitute timestamps for readiness or acceptance.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not edit workspace files, repair state, resume a playbook, reconcile artifacts, run checks, or start another skill.
- Do not infer readiness from file recency when acceptance, checks, or freshness say otherwise.
