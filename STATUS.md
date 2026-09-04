# Status

## Current Focus

Silver `0.9.2`, **One Representation Model**, is prepared on the working tree
as a corrective release. Live representation binding, state calculation,
repository synchronization, captured-Figma synchronization, provider
operations, and reconciliation application now use the v2 contracts end to
end. Historical v1 reconciliation records remain readable by the design
checks; live v1 bindings stop with migration and re-inspection guidance.

The representation checks now evaluate v2 revision identities, states,
semantic mappings, authority, proposal pins, local sources, workspace targets,
linked-source targets, and provider capture boundaries without interpreting
pre-application identities as post-application state. Direct regression tests
cover uninitialized, present, missing, drifted, applied, authority-blocked, and
legacy-rejected paths.

Artifact source pins are now immutable historical provenance rather than live
dependencies. Revision drift is reported as a non-blocking advisory, archived
or stale artifacts do not generate provenance noise, and current invocation
inputs are validated before any output is written. Playbook resume also
invalidates downstream work when a previously observed artifact disappears.

Visualization records now support one or more typed review surfaces. A surface
may be a guarded local companion in any declared format or an external HTTPS
location such as Figma. External surfaces become verified only through a
current v2 representation binding whose provider identity matches the URL;
raw URLs remain visible but do not satisfy downstream readiness. Visualize
handoffs require at least one verified surface without making HTML mandatory.

Traceability now has shared write/read contracts. Fast and browser check passes
are bound to a deterministic checker-visible workspace snapshot; mixed-state,
legacy, malformed, substituted, or stale evidence cannot satisfy an invocation.
Doctor, checks, and invocation preflight share managed-file integrity. New
results use one acceptance lifecycle and integrity-pinned provenance, while the
audit checker reports historical contradictions and drift. Trace and what-now
join exact output revisions, and generated launchers select a lock-compatible
runtime without silently preferring an older workspace dependency.

Browser checking now separates Silver's deterministic evaluation from its
transport. Chrome/Chromium is the local default; an explicitly selected CLI,
MCP, or host-native browser completes a versioned, state-bound inspection plan
with a unique run ID and normalized observations. The optional Ego Lite
transport uses its isolated task-space CLI and is neither required nor treated
as a Chrome executable. MCP and host-native connections remain agent-owned and
complete through the prepare/complete handoff.

Historical audit enforcement is now explicit in the workspace lock. Migration
adds the 0.9.2 horizon to same-version workspaces; pre-horizon results remain
readable as advisories, while new result records are create-only, reject
duplicate output claims, and require working-artifact source/input parity.

Release preparation is green: 248 serialized source tests, 54 v2 schemas, 25
v2 skills, and the exact packed-package scenario pass. The rebuilt 2026-09-03
tarball contains 5,871 files and is 12,630,800 bytes
(`sha256:d2e3587c23656dfdd328c4bfb1de882eb43779040f7838ffcfdd6a4ac4943049`).
Both native executables report `0.9.2`;
the arm64 binary is
`sha256:203792e01c66023deb1b728c14db2fa190b037357eaf43723edd49e326b22272`
and the x64 binary is
`sha256:628584b2e2cf61854e170bb70ac2b663c58200a91fe161667881127361b19872`.
The unsigned macOS packages are prepared with matching `SHA256SUMS`: arm64
`sha256:8f4e0571a0bfbdf93d6b97cbf7975eebc117497eae6c53c50e79cb6d4495bb04`
and x64
`sha256:dd92bc03b139e1fa6588d3575a914efb5a4a0082bac6d9bac56f355cc5230328`.
Each package contains 1,027 payload entries and `pkgutil` confirms that neither
is signed. Signing, notarization, publication, and installation remain separate
actions.

The final macOS release artifacts were built locally on 2026-08-17. Both
architecture-specific native executables carry hardened Developer ID
Application signatures; both installer packages carry Developer ID Installer
signatures with trusted timestamps, accepted Apple notarization tickets, and
stapled tickets. Gatekeeper accepts each as a Notarized Developer ID installer,
and `dist/pkg/SHA256SUMS` verifies both final artifacts. The public
[`v0.9.0` GitHub release](https://github.com/thejparsenault/silver-design-framework/releases/tag/v0.9.0)
contains both packages, their checksum manifest, and the exact npm tarball with
its checksum. `silver-design-framework@0.9.0` is also published to npm as
`latest`; a fresh `npx --yes silver-design-framework@0.9.0 version` resolves
and reports `0.9.0`.

The two release-blocking findings from the 2026-08-16 audit are implemented on
the working tree. Managed writes now use one symlink-aware mutation interface;
migration and update activate staged deltas through durable recoverable
transactions; and `silver recover` handles both workspace journals and cross-
repository synchronization sagas. Adversarial linked-path, race, rollback,
process-death, contention, lock-order, and Git forward-recovery tests pass.

The reconciliation foundation is now stable 0.9 product surface:
`silver link inspect|apply`, `silver sync status|inspect|apply`, strict v2
source/representation contracts, repository and captured-Figma adapters, and
the 25th installed skill, `reconcile`. A shared repository remains an external
linked source with no Silver install; validated imports remain ordinary local
artifacts. Explicit exports touch only mapped paths, run bounded declared
checks, never push, and advance the shared base only after success. A reviewed
import can convert a legacy `design/system` symlink by replacing only the link
leaf and leaving its external target untouched.

Final automated verification is green: 228 serialized source tests, 54 v2
schemas, 25 v2 skills, exact packed-package smoke, both native macOS binaries,
both macOS installer packages, and a production dependency audit with zero
vulnerabilities. The release tarball contains 5,861 files and its sidecar pins
`sha256:69cb20ad928b29296da61a82ecd76ce01994928ab11ba76ceb8d4033bfbd55dd`.
Line coverage is 83.30%, slightly above the audit baseline; branch and function
percentages are 74.41% and 88.83%, below the percentage baseline after adding
the new state machines, and remain explicit follow-up coverage work.

Browser checks now distinguish unavailable prerequisites (`not-run`), checker
mechanism failures (`error`), and completed conformance findings (`fail`). The
local runner removes the debugging-port race, retries only launch/readiness
once, captures bounded process evidence, diagnoses navigation/protocol/
inspection stages separately, and verifies cleanup without leaving inherited
Chrome pipes holding a test worker open.

Silver `0.9.0`, **Meet the Work Where It Is**, is in progress on
`release/silver-0.8-tools`. The release version is now declared consistently
in the package and framework metadata, per `docs/silver-0.9-acceptance.md`.
The thesis:
Silver meets work it did not author — existing repositories, tools it does
not ship, references from outside, and a design system that belongs to the
team rather than to Silver.

Every automated `S09-*` criterion in `docs/silver-0.9-acceptance.md` is now
done and gate-green, committed and pushed through `8a92437`: adoption of an
existing folder, provider provenance and guidance, declared transports,
split browser inspection from driving, a real troubleshooting ladder, a
published semantic role vocabulary, a workspace-owned `design/system/`
retiring `reference-system/`, `checks.policy_profile` made real for the
`adoption` profile, `silver link` for codebase binding with doctor
diagnostics, personal `tools.yaml` with `--resolve`/`--bind`, a references
collection that no skill reads implicitly, Figma pull/push alias fidelity
with a shared adapter-round-trip harness, and a reviewable `0.8 → 0.9`
migration.

A W10 pass was added mid-release, on top of that commit: 0.9's own thesis
exposed a producer-less required input (`evidence`, required by
`synthesize`, produced by no skill), so the skill taxonomy grew four
entries. `sketch` is renamed `visualize` end to end (kept valid-but-
deprecated for pre-0.9 artifacts); new `collect` closes
research → collect → synthesize; new `structure` gives information
architecture a home distinct from `flow` and `map`; new `measure` closes
implement → measure → synthesize with a new `product-analytics` named-gap
capability. The catalog now totals 25 skills with `reconcile`. Every automated `S10-*` criterion is also done
and gate-green, uncommitted on top of `8a92437` — next action is review and
commit.

A W7 pass followed, also on top of that commit: `S09-CURATE-01`'s guided
transport-curation pass happened directly with the user, and grew into the
largest workstream in the release — the activity catalog went from 20 to 67
namespaced entries, each carrying a `fallback` that guarantees a Silver-native
answer; provider support moved from derived to declared
(`provider.activities`); `interface.detection` makes CLI-only transports
detectable for the first time; the authored `setup` ladder was replaced by
generically derived diagnosis plus freeform `post_setup` notes; `silver tools
--for "<phrase>"` resolves a task description to what will serve it; and nine
new declarations shipped alongside corrections to `figma-official-mcp` (reads
and writes, not read-only) and `figma-console-mcp`'s publisher metadata.
`S09-TOOLS-01` through `S09-TOOLS-07` are done and gate-green.

Only one `S09-*` criterion remains, explicitly out of automated scope:
`S09-MIGRATE-04` (manual end-to-end verification against blank and adopted
workspaces). Its live Figma write-to-canvas subtask is now verified.

Silver `0.8.0`, **Tools That Are Actually There**, is the previous release,
also unpublished, and made the provider selection layer real: activities
derived from existing contracts, Figma split into transports, one resolution
order with two filters, and `silver tools --connect` writing a host MCP
declaration for an already-installed tool and nothing else. Verified against
a copy of the reported workspace: migrates `0.6.1 → 0.8.0` with zero
conflicts and zero doctor diagnostics. `docs/silver-0.8-acceptance.md`
records what shipped and what was deferred (all now underway in 0.9 above).

Silver `0.7.0`, **One Good Step**, is two releases back, also unpublished. It
answers the 22-issue field report from the first real session against a product
(`~/Projects/exploring/task-tracker`), recorded in that repository's
`SILVER_DESIGN_FRAMEWORK_BUG_REPORT.md`.

The shape of the release: an invocation now runs its own required checks and
writes their evidence, a claimed pass without evidence is not believed, accepted
canonical work activates across artifact/manifest/index/lock in one checkpoint,
an accepted invocation confirms Git can commit before writing, and the generated
agent instructions say plainly to run one skill and stop. Tone became its own
layer — a studio voice set once in the framework default or a personal practice,
composed with skills that stay precise and independently upgradeable.

Verified end to end against a copy of the reported workspace: it migrates from
`0.6.1` with zero conflicts and reports zero doctor diagnostics afterward, with
the manual manifest edits, repair runs, and checker exclusions from the original
session no longer needed.

Silver `0.6.1` added npm as the primary distribution channel with no behaviour
change. `0.6.0` shipped as an immutable GitHub release before the npm channel
existed, so its artifact pins the release tarball URL in the launchers it
generates; that artifact stays valid and the version was bumped rather than
republished.

Silver `0.6.0`, Agent Hosts and Guarded Invocation, is implemented and validated
from source and as an exact offline archive. An installed workspace can now run
its own skills: guarded invocation routes through `silver invoke`, and
`silver invoke --scaffold` supplies identifiers, timestamps, provenance, context
pins, required checks, and `expected_integrity` so the agent supplies only
content and reasons. A workspace is discoverable to Claude Code through a
generated adapter layer while `.skills/` and `AGENTS.md` stay canonical.

The next milestones are the Node-free durable-output path that Claude Cowork
support depends on, external-source synchronization, and deep existing-codebase
adoption.

## Recent Progress

- 2026-08-17: Public README rewritten for Silver 0.9
  - Replaced the developer-first install guide (including stale 0.6.1 commands)
    with a designer- and agent-first release guide. It leads with the signed
    macOS package, supplies a copyable inspect-before-apply prompt, explains
    the single-folder workspace, groups all 25 skills by outcome, lists shipped
    adapters, and makes synchronization, safety, and recovery understandable
    without hiding their boundaries.
  - The GitHub-rendered `Ag` brand mark remains at the top. The README describes
    Codex, Claude Code, and comparable local agents without preferring a host;
    it correctly calls Claude Cowork unsupported rather than implying the
    installed CLI alone makes it work.

- 2026-08-17: Live Figma round-trip verification
  - Desktop Bridge probed healthy against `Test File`, page `Page 1`.
  - Created a primitive color and a semantic alias, pulled the alias, no-op
    pushed it, changed the primitive, deliberately changed the semantic value
    to a literal, restored the alias, and independently read each state back.
  - A visible swatch bound to the semantic variable resolves through the
    updated primitive. Section `Silver Roundtrip Audit — PASS` remains in the
    file as reviewable evidence; the manual Figma task is complete.

- 2026-08-16: Full working-tree code and test audit
  - Added executable reachability coverage and removed one dead runtime module;
    three tested architecture libraries without a product caller are now named
    exceptions pending a product decision.
  - Made `design-check` execute and persist all 22 fast checks through both the
    CLI and installed skill shim; unknown or empty selections no longer pass.
  - Bounded browser, Git, build, package, release, and test subprocesses; fixed
    Node's EventTarget WebSocket fallback and hardened transport probes.
  - Migrated a clean copy of the real task-tracker `0.6.1` commit through 0.9,
    fixed its legacy component-expression upgrade, and passed doctor, all fast
    checks, live Chrome at mobile and desktop viewports, and repeat migration.
  - Full coverage: 201 passed, 0 failed/skipped/todo; 83.16% lines, 75.04%
    branches, 90.09% functions. Two high-severity bundled transitive
    advisories were updated within compatible ranges; the production audit now
    reports zero vulnerabilities. Live Figma subsequently passed on 2026-08-17.
  - Open high-severity recommendations: one symlink-aware mutation boundary
    and staged/journaled transactional migration.

- 2026-08-16: Native macOS distribution proof for Silver `0.9.0`
  - Added repeatable builds for compiled Bun executables targeting Apple Silicon
    and Intel Macs, plus versioned payloads that preserve framework integrity
    without requiring Node.js or npm at runtime.
  - Added macOS 13+ `.pkg` builds that install `silver` at
    `/usr/local/bin/silver` and keep each payload under
    `/usr/local/lib/silver/<version>/`.
  - Local unsigned packages and a no-Node native setup/doctor smoke test pass.
    Public release still requires Developer ID signing and Apple notarization;
    `docs/native-macos-distribution.md` records the handoff.

- 2026-08-16: Added `docs/brand/silver-logo.jpg` as the repository logo and
  displayed it at the top of the GitHub README.

- 2026-08-12: Silver 0.9 W10 — skill taxonomy
  - `sketch` renamed `visualize` end to end: skill id, artifact kind
    (`sketch` → `visualization`), output path, capability (`sketch-renderer`
    → `visual-renderer`), activity (`render-sketch` → `render-visualization`).
    `sketch` stays valid-but-deprecated in both schemas so a pre-0.9 artifact
    keeps validating and migration never rewrites project-owned content;
    `evaluate` accepts both kinds as input.
  - New `collect` skill (modeled on `synthesize`) closes
    research → collect → synthesize, outputting the existing `evidence` kind
    at `design/evidence/**` rather than inventing a parallel one. Surfaced
    and fixed a real gap while tracing where evidence goes: `evidence` was
    missing from `check-evidence.mjs`'s own kind set, so the one artifact
    kind with no producer was also the one kind nothing validated. Added a
    required `payload.source_pin` (source, query, retrieved_at, sanitized)
    and seeded `design/evidence/README.md`, which previously only
    materialized silently on first write.
  - New `structure` skill and `silver/structure/v1` schema (modeled on
    `map`) give information architecture — entities, relationships,
    hierarchy — a home distinct from `flow` (sequences) and `map` (broader
    relational views). `check-structure.mjs` catches duplicate entity ids,
    dangling relationship targets, and parent cycles.
  - New `measure` skill (modeled on `evaluate`) closes
    implement → measure → synthesize, requiring `hypothesis`, `metrics`,
    `instrumentation`, `observed`, and `limitations` in its `measurement`
    payload so weak instrumentation gets written down rather than smoothed
    over. New `product-analytics` capability and `read-product-analytics`
    activity (`status: planned`) follow the same named-gap pattern as
    `research-evidence`.
  - New `framework/tests/skill-taxonomy.test.mjs` asserts every artifact
    kind required as an input by some skill is produced as an output by at
    least one skill — the property whose absence caused this whole pass.
  - Deferred to 0.10 (W11), recorded in `BACKLOG.md`: the evidence import
    model — storing and drift-guarding raw pulls from research tools,
    analytics, or chat, which needs freshness-based staleness rather than
    the integrity/revision pinning `linked-source` already does.
  - `npm run build` passes 174 tests; `npm run test:package` passes.

- 2026-08-11: Silver 0.9 automated pass — CONFORM through MIGRATE-01
  - `checks.policy_profile`: `semantic-styles`, `accessibility`, and
    `responsive-behavior` now read the workspace's actual profile;
    `adoption` downgrades `semantic-styles` findings to informational with
    the reason stated, and reports `not-run` (not a flood of failures) when
    there is no token index yet to check against.
  - `silver link <path> [--as <id>]`: registers a codebase as a pinned,
    workspace-relative `linked-source`, records it on the active design
    context, and `doctor` reports an unresolved or moved link. Fixed a
    latent bug along the way — linked-source drift inspection resolved a
    relative reference against `process.cwd()` instead of the workspace
    root, which would have silently broken the moment anyone actually used
    a relative link.
  - Personal `tools.yaml`: read as the first ordering source;
    `silver tools --resolve "<phrase>"` matches a conversational reference
    against declared provider aliases; `--bind <activity> <transport>`
    writes a durable personal binding.
  - References collection: `silver/reference-collection/v1` under
    `design/references/`, a `reference-integrity` check, and
    `references[]` on both `skill-invocation` (citation intent) and
    `provenance` (the pinned record) — never read implicitly.
  - Figma pull/push fidelity: `VARIABLE_ALIAS` parses into a DTCG
    `{reference}` (bottom-up, cycle-guarded); collection classification is
    proposed from alias direction, never assumed; per-property style
    binding splits bound vs. literal; pushing a still-referenced value
    writes a `VARIABLE_ALIAS`, never a flattened literal; a shared
    `framework/testing/adapter-round-trip.mjs` harness proves pull∘push
    identity on a no-op and that a structural edit is classified distinctly
    — all fixture-only, no live Figma call anywhere.
  - Reviewable `0.8 → 0.9` migration: preserves hand-edited
    `reference-system/` untouched, installs `design-system-tokens-seed`.
    Building its test surfaced four real defects: `lock.schema.json` had
    dropped `"reference-system"` from its type enum entirely (would have
    made every real 0.8 workspace's lock fail validation before migration
    could even start), stale manifest/design-context pointers weren't
    repointed, `tokens.json`/`showcase.html` were never rebuilt after the
    package installed, and `components.json`/the references README weren't
    seeded. All four fixed.
  - `npm run build` passes 166 tests; `npm run test:package` passes.
    Uncommitted on top of `f5b4a6c` — next action is review and commit.

- 2026-08-11: Silver 0.9 W1-W5, W9a, W9b-f
  - W1-W5 (`50ad656`): additive-only `silver adopt inspect | apply`; provider
    `source`/`guidance` with `compare_to` drift on the gate; declared Figma
    transports with typed setup ladders; `inspect-in-browser` split from
    `drive-browser` with portable local Chrome, chrome-devtools-mcp, and
    playwright-mcp providers; `--diagnose` walks the full ladder, live-verified
    against a real Figma MCP. Setup no longer refuses a folder that already
    has work in it.
  - W9a (`4ee428e`): published `silver/semantic-roles/v1`, filling
    interaction states, typography, icon, and elevation roles so an adopted
    system has somewhere real to map its hover states and text styles.
  - W9b-f (`f5b4a6c`): retired `reference-system/` for a workspace-owned
    `design/system/` — authored DTCG token source separate from a generated,
    var()-chained, hex-plus-oklch stylesheet; a schema-validated component
    index; `showcase.html` pre-generated on every fresh install; `alongside`
    renamed `with-existing-work`.
  - Reconciled `TASKS.md`/`STATUS.md` with the actual 0.9 scope and wrote
    `docs/silver-0.9-acceptance.md` with `S09-*` criteria, split into done,
    automated-remaining, and manual-remaining so the tracker and the plan
    stop disagreeing.
  - Found, unrelated to this work: `npm run test:package` fails because
    package versions aren't normalized at pack time — noted, not yet fixed.
  - `npm run build` passes 128 tests.

- Entries for Silver 0.2 through 0.7 (2026-06-15 through 2026-07-31) have
  been trimmed from this log. Most of those releases have their own
  `docs/silver-0.X-acceptance.md` with the full detail (0.6 does not);
  `git log` has the rest.

## Next 3 Actions

1. Review the uncommitted W10 and W7 passes (everything in `git status` on
   top of `8a92437`) and commit them as the next checkpoint(s).
2. Finish the remaining manual end-to-end verification (`S09-MIGRATE-04`):
   blank install and adjacent/adopted workspace. The live Figma round trip is
   complete.
3. Select one representative existing product repository and run
   `silver adopt inspect | apply` against it for real (also
   `S09-MIGRATE-04`), then decide on publishing `0.9.0`.

## Known Gaps

- Browser checks remain unverifiable where a browser cannot reach a local URL
  — an environment fact, not a missing capability. 0.9's W4 shipped
  `inspect-in-browser` providers (portable local Chrome, chrome-devtools-mcp,
  playwright-mcp), closing the "no shipped provider" gap 0.8 named here.
- Only one shipped transport is verified against a live server.
  `figma-console-mcp` was developed against one; `figma-official-mcp` is declared
  from Figma's published remote endpoint and has not been exercised here.
- The default transport ordering heuristic — prefer configured, prefer no local
  build, then alphabetical — is deliberately thin. It is not a claim about which
  tool is better, and it needs real use rather than more guessing.
- Silver cannot confirm that any MCP transport responds, only that it is
  configured. That is a consequence of the agent host owning the connection, and
  it is why results verify artifacts rather than transports.

## Blockers

- Private remote publication still needs a package scope or GitHub release destination; the local prerelease is fully validated without it.

## Last Updated

2026-08-17
