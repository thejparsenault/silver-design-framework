---
name: silver-reconcile
description: Review and explicitly reconcile a portable artifact with a linked repository or Figma without silent overwrite.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Reconcile representations

1. Run `silver sync status --all . --json` and choose one binding and direction.
2. Capture provider state when the binding requires it, then run `silver sync inspect`.
3. Explain semantic changes separately from opaque whole-file changes. Group each
   mapped change by the skill that owns its artifact kind.
4. Present exact operation ids. Conflicts, binary data, partial extraction, and
   unmapped changes are handoffs; never select them or guess a winner.
5. After explicit approval, call `silver sync apply ... --only <ids>`.
6. If apply returns `external-action-required`, perform only the returned provider
   operation through the resolved transport. Apply again with the external result
   and a fresh capture. Exit code 2 means the action is incomplete, not failed.
7. Report applied operations, checks, transaction state, binding advancement,
   local Git commit if any, and every remaining handoff. Stop.

Synchronization policy never applies a change by itself. `manual`, `notify`, and
`propose` affect when the designer hears about a proposal, not whether it is
accepted.
