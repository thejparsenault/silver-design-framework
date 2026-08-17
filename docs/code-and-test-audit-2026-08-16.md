# Code and Test Audit — 2026-08-16

## Result

The working-tree audit found and fixed the bounded execution, migration,
browser, Git, probe, packaging, and test-completion defects described below.
The final coverage run passes all 201 tests with no skips or todos.

The audit originally did **not** conclude that the release was ready without
further work. Two high-severity findings required architectural changes:

1. a pre-existing symlink at a Silver-managed directory can redirect writes
   outside the workspace; and
2. migration apply is not transactional, so a mid-apply failure can leave a
   partially upgraded workspace that the same migration cannot resume.

Both were remediated in the subsequent Silver 0.9 safety and synchronization
work on 2026-08-17. The original findings and recommendations remain below as
the historical basis for the implementation.

The remediation verification passes 226/226 source tests and the exact packed
package, native binaries, macOS packages, and production dependency audit. Its
expanded coverage is 83.30% lines, 74.41% branches, and 88.83% functions; the
small branch/function percentage regression is tracked explicitly in
`TASKS.md` rather than being treated as closed acceptance evidence.

## Scope and method

The audit covered the working tree on `release/silver-0.8-tools` from
`ff05caa`, including:

- all package scripts, CLI commands, skill and provider declarations, runtime
  modules, installer paths, checks, migrations, native builders, and tests;
- source, packed-archive, installed-workspace, and native-executable paths;
- declared-script existence and a static production-module reachability graph;
- direct skill shims as well as `silver invoke` and `silver check`;
- success, failure, not-run, malformed-input, timeout, stale-state, and retry
  behavior;
- a clean copy of the `0.6.1` commit from
  `/Users/jp/Projects/exploring/task-tracker` (the original repository was not
  modified); and
- fixture-based Figma adapter round trips, followed on 2026-08-17 by a live
  pull/no-op-push/structural-edit/restore round trip in the authorized Figma
  `Test File` after Desktop Bridge was connected.

No architecture was materially changed. The fixes remain within existing
command, skill, migration, and packaging boundaries.

## Fixed findings

### 1. `design-check` could complete without running checks

`design-check` declared no required checks, and its direct installed shim used
the low-level runtime rather than the integrated invocation path. Both paths
could therefore complete with no check evidence.

The skill now declares all 22 registered fast checks. Direct shims delegate to
the same integrated runner as `silver invoke` when installed from the package,
and package smoke tests assert that every check runs and passes.

### 2. Selective checks accepted impossible selections

`silver check --only <unknown>` filtered an already-completed suite and exited
success with zero results. Selection is now validated before execution, an
empty or unknown selection is rejected, and only the requested checks run.
Exit codes are distinct: pass `0`, fail `1`, and not-run `2`.

### 3. Browser checks could wait forever

DevTools WebSocket open and request operations had no deadlines. They now have
bounded open, command, and fetch waits, reject pending work when the connection
closes, and safely clean up. Build, package, native, release, and package-smoke
child processes also have explicit watchdogs.

### 4. Installed browser checks failed without a local `ws` package

The fallback to Node's built-in WebSocket used EventTarget semantics while the
client assumed the `ws` package's EventEmitter API. The client now supports
both interfaces and normalizes `MessageEvent.data`. A workspace outside any
`node_modules` tree and the migrated task-tracker copy both pass live Chrome
checks.

### 5. Transport probes trusted malformed, mismatched, or impossible evidence

Probe reads now validate the complete v2 schema, require the probe transport to
match its filename, reject future timestamps as non-current, and apply
freshness before interpreting success or failure. Stale failed probes no
longer disable a provider indefinitely.

### 6. Real `0.6.1` migration failed on the retired component expression shape

The copied task-tracker workspace failed because its component expression had
no `stylesheet` and still pointed at `reference-system/html-contracts`.
Migration now adds the current stylesheet, repoints the catalog to
`design/system/components.json`, validates the upgraded expression before
writing it, and reports the change in preview.

### 7. Git operations could prompt or hang

Normal installer/runtime Git calls now share a bounded noninteractive runner:
terminal prompting and credential-manager interaction are disabled, output is
bounded, and the process is killed after 30 seconds. Silver-created checkpoint
commits explicitly disable GPG signing so a user's signing policy cannot turn
an unattended framework check into a prompt.

### 8. Declared Node support was lower than a direct dependency's support

Silver declared Node 20 while Style Dictionary 5 requires Node 22. The package
engine, launcher guard, lockfile, README, and installed-package smoke assertion
now agree on Node `>=22.0.0`. Node 26 is verified locally; the exact Node 22
minimum still needs a CI matrix job.

### 9. A transient Git-directory cleanup could fail an otherwise passing run

The coverage suite exposed an `ENOTEMPTY` race while deleting a temporary
`.git/objects` directory. Temporary-workspace cleanup now uses bounded retry.
The formerly failing test passed five consecutive focused runs and the final
full coverage run.

### 10. Two bundled transitive dependencies had high-severity advisories

The production dependency audit identified denial-of-service risk in
`brace-expansion` 5.0.8 and host-confusion risk in `fast-uri` 3.1.4. Both are
transitively bundled through direct runtime dependencies. They were updated
within their existing compatible ranges to 5.0.9 and 3.1.5 respectively.
`npm audit --omit=dev` now reports zero vulnerabilities.

### 11. Stale generated fixture and dead YAML wrapper

The blank-workspace lock fixture was regenerated against the current payload.
The unreferenced `framework/runtime/yaml.mjs` wrapper was removed.

## Follow-up status

- **Resolved:** every production workspace write now routes through the
  canonical, symlink-aware mutation interface or, for migration/update direct
  implementations, executes only inside lifecycle staging before activation.
  Doctor and adversarial tests cover linked ancestors, leaves, dangling links,
  root aliases, sibling prefixes, and a check-to-write swap.
- **Resolved:** migration and update prepare their complete file delta in a
  disposable workspace and activate it through a durable locked journal with
  preimages, lock-last ordering, validation, automatic caught-failure rollback,
  and `silver recover resume|rollback` after process death.
- **Resolved in product surface:** artifact codecs and reconciliation now route
  through `silver sync` and the `reconcile` skill. Playbooks remain the only
  explicit reachability exception.

## Original findings and recommendations

### High — Silver-managed writes can escape through symlinks

Reproduction: create a workspace whose `.silver` path is a symlink to a
directory outside the workspace, then run setup. Setup succeeds and writes the
managed tree through that symlink; the audit observed 119 paths created outside
the workspace.

Recommendation: introduce one canonical mutation boundary used by setup,
update, repair, migration, invocation, rendering, and checkpoints. It should
resolve the real workspace root, reject symlink traversal for every managed
ancestor, and perform a final containment check immediately before mutation.
Add adversarial tests for symlinked files and directories at every managed
top-level path. Lexical `path.resolve` checks alone are insufficient.

### High — Migration apply is not transactional or resumable

The first real-repository migration reached a newly exposed validation error
after already replacing packages and project metadata. Retrying then failed
because the old lock integrity no longer matched the partially upgraded files.

Recommendation: stage the complete migrated tree and validate it before
activation, then use an atomic directory/file swap where possible. If a full
staging model is impractical, persist a migration journal with preimages and a
resume/rollback command. Test injected failure after every mutation phase.

### Medium — Architecture libraries had no normal product entrypoint

Static reachability found no CLI, package-script, skill, provider, or codec
route to:

- `framework/runtime/artifact-codecs.mjs`
- `framework/runtime/playbooks.mjs`
- `framework/runtime/reconciliation.mjs`

Artifact codecs and reconciliation are now exercised by the synchronization
coordinator and `reconcile` skill. Playbooks remain the one deliberate
exception, separately tracked; new unreachable production modules still fail
the reachability suite.

### Medium — Live-browser evidence is separate from invocation evidence

`design-check` now runs all deterministic fast checks, including static
responsive and interaction inspections. The live browser suite also uses the
responsive and interaction identifiers, but its results are not persisted and
merged into the evidence written by `silver invoke`.

Recommendation: give static and live evidence distinct identities or phases,
then define how an invocation upgrades readiness when current browser evidence
exists. Do not let the static pass imply that a browser was exercised.

### Medium — Important error branches have thin coverage

Overall coverage is healthy enough to guide maintenance, but risk is uneven:
`installer/cli.mjs` is at 46.14% lines, `installer/doctor.mjs` at 56.98%, and
`installer/tools.mjs` at 65.18%. Several artifact, asset, flow, and structure
checker error branches are also below the project average.

Recommendation: prioritize table-driven negative tests for command routing,
doctor diagnostic combinations, malformed tool preferences, and checker path
boundaries. Avoid a global percentage gate until generated/declarative and
platform-only paths are classified; use per-module risk targets instead.

### Passed manually — Live Figma round trip

On 2026-08-17 the Desktop Bridge live probe succeeded against Figma `Test File`
(`GPUqqrfmZQk2EvTorfs58r`), page `Page 1`. The test created collection
`Silver Roundtrip Audit 2026-08-17` and proved the following through separate
transport writes and fresh readbacks:

1. `action/primary/bg` pulled as a `VARIABLE_ALIAS` to `color/blue/500`.
2. A no-op push wrote the alias again without flattening it.
3. Changing the primitive from `#3355FF` to `#1122AA` propagated to the
   semantic variable while preserving the alias.
4. A deliberate semantic alias-to-`#112233` literal edit read back as a
   literal, proving the structural distinction was observable.
5. Restoring the alias read back as `VARIABLE_ALIAS` again.
6. Canvas swatch `5:11` was bound to semantic variable `VariableID:5:4`; the
   semantic variable remained bound to primitive `VariableID:5:3`.

Visible evidence remains in section `5:5`, `Silver Roundtrip Audit — PASS`.
This is interactive release evidence and remains intentionally outside CI.

### Release infrastructure limitations

- Node 26 passed; Node 22 and Node 24 should be explicit CI matrix entries.
- Native Apple Silicon and Intel executables were built and exercised, but
  public macOS packages remain unsigned and unnotarized by design.
- The Intel binary ran under Rosetta on the audit machine; native Intel-host
  execution was not available.

## Final automated evidence

| Gate | Result |
| --- | --- |
| Contract validation | 9 v1 schemas, 43 v2 schemas, 24 v2 skills, 67 activities, and 93 semantic roles valid |
| Full source + coverage suite | 201 passed, 0 failed, 0 skipped, 0 todo; 93.6 seconds |
| Coverage | 83.16% lines, 75.04% branches, 90.09% functions |
| Production dependency audit | 0 vulnerabilities after two compatible transitive updates |
| Complete blank scenario | Passed, including every installed skill and the full local loop |
| Installed package smoke | Passed, including direct design-check invocation with all 22 checks |
| Real 0.6.1 repository copy | Migration, doctor, 22 fast checks, and repeat migration passed |
| Live local browser | Passed on the real-repository copy at 375×812 and 1440×900 |
| Native Apple Silicon | Setup, doctor, check, and invoke passed with Node excluded from `PATH` |
| Native Intel | Version command passed under Rosetta |
| macOS package structure | Both architectures valid; checksums and install layout verified |
| Live Figma | Passed in `Test File`: alias pull, no-op push, primitive propagation, literal structural edit, alias restore, and semantic canvas binding |
| Release archive | 5,841 files, 12,578,862 bytes; SHA-256 `0c8e6993dae3a46b7181272161e4f7dae78ef45078d8e7775e751e7853f32aec` |

The release archive checksum was independently matched against its sidecar.
