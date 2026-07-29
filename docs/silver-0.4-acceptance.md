# Silver 0.4 What Now acceptance

**Version:** `0.4.0`

## Goal

Install a project-local `what-now` skill that can recover context from a Silver
workspace and recommend several evidence-based next actions without performing
any of them.

## Required criteria

- [x] **S04-ARC-01 — Project-local package.** `what-now` is the nineteenth
  generated v2 skill and is installed, locked, diagnosed, repaired, updated,
  migrated, and packaged with the rest of Silver.
- [x] **S04-ARC-02 — Read-only analysis.** The analyzer reads only declared
  workspace state, refuses path escapes and symlink traversal, and creates no
  workspace files.
- [x] **S04-ARC-03 — Evidence precedence.** Invalid workspace state, pending
  checkpoints, failed or unavailable checks, stale work, reconciliation
  blockers, accepted handoffs, incomplete foundations, and new starts are
  ranked in that order.
- [x] **S04-ARC-04 — Timestamp restraint.** Semantic timestamps order otherwise
  equivalent candidates; filesystem modification time is only a fallback and
  never overrides readiness, acceptance, checks, or freshness.
- [x] **S04-ARC-05 — Reviewable choices.** Analysis returns three to five
  ranked choices with reasons, evidence paths, confidence, timestamp source,
  and `automatic: false`.
- [x] **S04-ARC-06 — Contract-bounded recommendations.** A successful
  invocation may preserve caller-ranked recommendations only when every action
  is declared by `recommend_after`; undeclared actions block and emit no
  recommendations.
- [x] **S04-ARC-07 — Backward compatibility.** Existing skills retain their
  static contract-derived recommendations when an invocation does not provide
  a dynamic list.
- [x] **S04-E2E-01 — Representative states.** Automated fixtures cover fresh
  foundations, pending review, paused and stale playbooks, failed checks,
  accepted ready handoffs, semantic timestamp ordering, malformed or missing
  state, and unsafe paths.
- [x] **S04-E2E-02 — Reviewable 0.3 migration.** Preview is read-only, apply
  installs `what-now` without changing project-owned artifacts, and repeat
  migration is a no-op.
- [x] **S04-E2E-03 — Exact package evidence.** The offline archive installs all
  nineteen skills, migrates a representative 0.3 workspace, invokes the full
  loop including `what-now`, and passes local checks.

## Release gates

Silver `0.4.0` is complete when both commands pass:

```sh
npm run build
npm run test:package
```
