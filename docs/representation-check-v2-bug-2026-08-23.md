# Representation checks read v1 field names against v2 artifacts

**Reported** 2026-08-23 · **Affects** 0.9.0 and 0.9.1 · **Component** `framework/skills/design-check/scripts/check-representation-lib.mjs`

## Summary

Three fast design checks — `provider-revision-pins`, `stale-proposals`, and
`synchronization-status` — read the **v1** field names of representation
bindings and reconciliation results. Any workspace whose artifacts are
**v2** (`silver/representation-binding/v2`,
`silver/reconciliation-result/v2`) fails all three unconditionally,
regardless of whether anything is actually wrong.

`stale-proposals` does not merely report a false finding; it throws. It
resolves `path.join(root, undefined)`, so every reconciliation result in the
workspace surfaces as:

```
The "paths[1]" property must be of type string, got undefined
```

This means the check never inspects the thing it exists to inspect. A
genuinely stale proposal would be indistinguishable from this crash, so the
check currently provides **no** protection on v2 workspaces.

## Field mapping

| Check | Reads (v1) | v2 equivalent |
|---|---|---|
| `provider-revision-pins` | `provider.revision`, `last_reconciled.portable_revision`, `last_reconciled.external_revision` | `base.local.revision`, `base.external.revision` |
| `stale-proposals` | `change_set_path`, `change_set_integrity`, `accepted_operations`, `changes[].proposal.*` | `proposal_path`, `proposal_integrity`, `selected_operations`, `operations[].target_*` |
| `synchronization-status` | state list with `view-stale`, no `uninitialized` | `uninitialized`, `local-changed` (renamed from `view-stale`) |

Confirmed against the shipped schemas:

- `representation-binding-v2.schema.json` has no `provider` or
  `last_reconciled`; it uses `counterpart` + `base`, with
  `additionalProperties: false`.
- `reconciliation-result-v2.schema.json` state enum is
  `uninitialized, current, local-changed, external-changed, diverged,
  conflict, unmapped, unverified`. Status enum drops `accepted`; the
  pre-application status is `awaiting-acceptance`.
- `change-set-v2.schema.json` uses `operations`, not `changes`.

## Reproduce

In any workspace with v2 bindings and at least one reconciliation result:

```sh
silver check . --only provider-revision-pins,synchronization-status,stale-proposals
```

Observed on a workspace with two healthy, fully-pinned bindings:

```
provider-revision-pins: fail (2 finding(s))
  design/integrations/figma-components.yaml: Binding is missing a portable or provider revision pin.
  design/integrations/figma-tokens.yaml: Binding is missing a portable or provider revision pin.
stale-proposals: fail (3 finding(s))
  ...: The "paths[1]" property must be of type string, got undefined
synchronization-status: fail (1 finding(s))
  ...: Unknown synchronization state.
```

Both bindings were correctly pinned the whole time (`artifact.revision: r2`,
`base.local.revision: r2`, `base.external.revision: 52f3b9f7…`).

## Related: half-landed v2 support

The same v1 assumption appears elsewhere and should be reviewed together:

- `framework/runtime/representations.mjs` — `validateBinding` early-returns
  for v2 (`if (binding.schema === "silver/representation-binding/v2") return
  binding;`), so **every** semantic rule below it is skipped for v2
  bindings. They receive schema validation only.
- `framework/runtime/representations.mjs` — `synchronizationState` computes
  entirely from `binding.last_reconciled.*`, which v2 bindings do not have.
- `check-representation-lib.mjs` — the `authority` rule reads
  `value.provider?.id`. It currently passes only by luck: it is gated on
  `authority === "external"`, and the observed workspaces use
  `external-authoritative`. It has the same latent defect.

## Fix

`docs/representation-check-v2.patch` in this repo. It branches on the
artifact's `schema` field — the convention `validateBinding` already uses —
so the v1 path is untouched.

```sh
git apply docs/representation-check-v2.patch
```

Verified with `git apply --check`. Notes on the `stale-proposals` port:

- v2 has no `accepted` status, so the drift check is gated on
  `awaiting-acceptance`, the equivalent pre-application state.
- Operations whose `target_identity.state` is not `present` are skipped —
  a create has no prior target to compare.
- The comparison uses `target_identity.integrity`, which is the
  **pre-application** integrity. Checking it against an already-applied
  result would be wrong; `binding_advancement` and the `binding-integrity`
  check cover the post-application state.

## Important: patching files on disk does not change CLI behavior

The installed CLI is a compiled Bun single-file executable:

```sh
file /usr/local/lib/silver/0.9.1/bin/silver
# Mach-O 64-bit executable arm64
```

The check logic is embedded in its `__BUN` section — `strings` finds
`change_set_path` and the `view-stale", "external-changed"` state list
inside the binary. The `.mjs` files under
`/usr/local/lib/silver/<version>/framework/skills/` are **template copies
shipped into workspaces**, not what the CLI runs.

This was verified by elimination: `console.error` markers were injected into
both the workspace copy (`.skills/design-check/scripts/`) and the installed
copy (`/usr/local/lib/silver/0.9.1/framework/skills/`). Running
`silver check` printed **neither**.

Consequences:

- Editing `.skills/design-check/scripts/check-representation-lib.mjs` in a
  workspace has no effect, and marks a framework-managed package as
  modified.
- Editing the installed copy has no effect.
- There is no override directory or env var for this.
- The only route to a working fix is rebuilding the CLI
  (`npm run build:native` / `package:macos`) and reinstalling, which needs
  root for `/usr/local/lib/silver`.

## Suggested regression coverage

`framework/tests/design-check.test.mjs` appears to exercise these rules with
v1 fixtures only. A v2 fixture — one initialized binding and one applied
reconciliation result — would have caught all three. Worth asserting that a
healthy v2 workspace produces **zero** findings, since the current failure
mode is false positives on correct data.
