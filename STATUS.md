# Status

## Current Focus

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

- 2026-07-31: Silver 0.7 One Good Step
  - Made check results mean something. A guarded invocation runs its own
    required checks and writes evidence to `.silver/results/checks/`; a claimed
    `pass` whose evidence is missing or disagrees is degraded to `not-run` with
    the reason, in completed and blocked results alike. Added
    `complete-awaiting-verification` so "generated" and "verified" stop being
    the same word, and `silver check` as an on-demand surface.
  - Made accepted canonical work activate atomically. The artifact, manifest,
    generated index, and lock move together in one Git checkpoint, with the
    manifest edited in place so flipping a status is a one-line diff. `repair`
    and the migration reconcile a workspace that already disagrees with itself.
  - Made accepted invocations recoverable: Git writability is confirmed before
    canonical files are touched, and a post-write failure leaves a resumable
    request with fresh integrity hashes instead of a state needing hand-rebuild.
  - Shipped the stop-and-offer rule into workspaces. Generated `AGENTS.md` and
    `CLAUDE.md` now say to run one skill, report what its checks said, offer two
    or three moves, and wait. Recipes carry `offered | selected`, playbooks
    honour the previously-dead `single-step` autonomy mode, and the README
    presents the loop as a map rather than a script.
  - Added the studio voice: a framework default plus a personal override in My
    Practice, rendered into generated instructions and materialized as an
    untracked workspace file so personal content never lands in a committed one.
    Skill prose was deliberately left untouched — tone and skills are now
    separate layers.
  - Fixed the installed-path defects: portable launcher resolution with no
    absolute path on the npm install path, `silver-` namespaced adapter skills,
    `allowed-tools` advertising only what works, and a post-install next command.
  - Fixed the false-signal defects: one shared artifact-kind classifier so
    `what-now`, `doctor`, and `design-check` agree; dependency, build, and cache
    directories excluded from check traversal and from installer snapshots;
    effect deduplication; and a fresh workspace that produces zero diagnostics
    and no self-repair recommendation.
  - Made setup explain itself — structured questions with per-option effects,
    external paths, reversibility, an explicit Git preflight, and the reference
    system's separate install step.
  - `npm run build` passes 99 tests and `npm run test:package` passes for the
    exact 1,084-file, 643,764-byte archive.

- 2026-07-30: Silver 0.6.1 npm channel
  - Added npm as the primary distribution channel with no behaviour change. The
    generated launcher pins the published package spec rather than a release
    tarball URL, and `installer/version.mjs` derives the spec, tag, artifact
    name, and download URL from one version constant so the channels cannot
    drift.
  - Bumped rather than republished: `0.6.0` was already an immutable GitHub
    release, and publishing different bytes under that version would have left
    one version naming two artifacts. Verified the published `0.6.0` asset still
    installs anonymously and generates a working launcher.
  - Added `npm run release`, which runs both gates, writes the artifact and its
    checksum to `dist/`, and prints publish and verification commands for both
    channels.
  - Fixed two bugs found by `npm publish --dry-run`: the packaged smoke relied
    on `npm install --prefix` creating its consumer directory, which does not
    hold nested inside an npm lifecycle script, and `prepublishOnly` nested an
    `npm pack` inside an `npm publish`.
  - Added `0.6.0`-to-current migration coverage; `npm run build` passes 91 tests.

- 2026-07-30: Silver 0.6 Agent Hosts and Guarded Invocation
  - Audited 0.5 against Claude Code and Claude Cowork; recorded findings and
    evidence in `docs/silver-0.5-audit.md`.
  - Fixed the blocker that left an installed workspace unable to run its own
    runtime: `.silver/runtime/` imports `ajv` and `yaml` as bare specifiers that
    do not resolve outside a `node_modules` tree, so every guarded invocation
    failed on the documented install path. Execution now routes through
    `silver invoke` and `silver what-now`, with a generated `.silver/bin/silver`
    launcher and an actionable failure from the per-skill shim.
  - Added `silver invoke --scaffold`, which emits a schema-valid request and
    refuses to be submitted with its placeholders intact.
  - Added the Claude Code adapter layer — `CLAUDE.md` importing `@AGENTS.md`,
    `.claude/skills/` symlinks, and `allowed-tools` on all twenty-one skills —
    wired into setup, repair, doctor, and a reviewable 0.5-to-0.6 migration.
    Agent instruction files no longer make setup refuse a blank target.
  - Retired the skill-catalog generator, which had drifted two releases behind
    and would have downgraded every contract to `0.4.0`, plus the superseded
    Python contract validator and its requirements file.
  - Ran a Bun standalone-binary spike: interpreted execution works completely,
    but `--compile` is blocked on the payload layer and 28 collapsed CLI
    main-guards. Deferred with evidence in `DECISIONS.md`.
  - Specified Claude Cowork support rather than assuming it in
    `docs/agent-host-compatibility.md`; `npm run build` passes 86 source tests
    and `npm run test:package` passes for the exact release archive.

- 2026-07-30: Silver 0.5 Traceable Practice and Context
  - Added revisioned contracts and runtime support for setup plans, My Practice,
    method overlays, practice changes, guidance links, component expressions,
    design contexts, maps, provenance, migration bootstrap records, effects,
    and Git checkpoints.
  - Added agent-led `setup inspect`/`setup apply`, local-Git My Practice,
    reviewed practice application, local and Git guidance freshness inspection,
    exact-pinned design-system/component/codebase source inspection,
    multi-context resolution, portable journey/service maps, and `silver trace`.
  - Replaced active Silver permission intersection with declared/observed effect
    findings while preserving path escape, stale overwrite, secret, fabricated
    evidence, destructive ambiguity, and no-silent-mutation protections.
  - Added reviewable 0.4-to-0.5 migration that preserves edited legacy policy
    files as inactive and indexes existing artifacts by exact integrity without
    rewriting them.
  - Expanded the complete offline loop to all twenty-one skills and added
    context-pinned map → pitch → implementation → QA provenance plus setup,
    guidance drift, practice revision, multi-context, checkpoint, and migration
    fixtures.
  - Recorded direct evidence in `docs/silver-0.5-acceptance-audit.md`;
    `npm run build` passes all 82 source tests and `npm run test:package`
    passes for the 1,071-file, 608,354-byte exact offline archive.

- 2026-07-28: Branded setup handoff
  - Added the authoritative Ag terminal mark to human-facing `silver setup`
    output with dark, light, unknown-ground, reduced-colour, `NO_COLOR`, and
    non-interactive handling.
  - Setup now finishes by analyzing the initialized workspace and recording one
    guarded `what-now` invocation before printing its ranked, non-automatic
    recommendations.
  - Added source and exact-package coverage for the mark, packed brand asset,
    persisted invocation, and post-setup recommendations.

- 2026-07-28: Silver 0.4 What Now accepted
  - Added the generated `what-now` skill and deterministic read-only workspace
    analyzer with status-first ranking, semantic timestamp tie-breaking,
    filesystem-time fallback, and explicit evidence for three to five choices.
  - Extended guarded invocations with optional ranked recommendations that are
    accepted only from the skill contract allowlist and discarded on blocked
    execution; existing skills retain static follow-ups.
  - Added non-mutation and symlink-safety coverage, representative workspace
    state fixtures, a reviewable 0.3-to-0.4 migration, nineteen-skill complete
    loop evidence, and exact offline archive coverage.
  - Recorded direct evidence for all ten criteria in
    `docs/silver-0.4-acceptance-audit.md`; `npm run build` passes 67 tests and
    `npm run test:package` passes for the 1,030-file `0.4.0` archive.

- 2026-07-26: Newcomer-first README
  - Replaced historical project framing with a practical explanation of
    Silver's agent-first workspace model and portable, local, and external
    representation roles.
  - Added exact source installation and blank-workspace setup commands,
    starter prompts, the optional design loop, the complete skill catalog,
    checks, workspace anatomy, maintenance commands, safety rules, and current
    limitations.

- 2026-07-25: Silver 0.3 Portable Tools and Reconciliation accepted
  - Added installed, versioned `silver-portable` and Figma provider packages,
    registered artifact codecs, and package-driven capability resolution.
  - Added strict binding, provider-operation, external-snapshot, change-set,
    and reconciliation-result contracts with explicit authority and revision
    provenance.
  - Implemented all seven synchronization states, shared-base three-way
    comparison, typed semantic change routing, persisted review proposals, and
    atomic expected-integrity apply with freshness and permission gates.
  - Added a real fixture-testable Figma adapter for variables, styles,
    components, selected nodes, and a narrow previewable semantic-token write.
  - Added portable Mermaid and semantic-HTML views, eight independently
    runnable representation checks, reviewable 0.2-to-0.3 migration, and an
    exact packed reconciliation scenario.
  - Recorded direct passing evidence for all 22 criteria in
    `docs/silver-0.3-acceptance-audit.md`; the source gate passes 56 tests and
    the exact offline `0.3.0` archive passes setup, migration, all-skill,
    reconciliation, provenance, and independent-check smoke evidence.

- 2026-07-25: Silver 0.3 Portable Tools and Reconciliation boundary
  - Defined portable artifacts, generated local views, and external views as
    distinct representation roles with explicit formats, authority, provenance,
    and revisions.
  - Required every generally applicable skill to retain a bundled repository-
    only baseline while treating external or production effects as separately
    permissioned capabilities.
  - Specified binding states, base-pinned three-way comparison, typed semantic
    change routing, reviewable reconciliation proposals, expected-integrity
    apply, and failure-safe behavior.
  - Made a fixture-testable Figma read and narrow semantic-token write adapter
    the first external integration without requiring live credentials for the
    deterministic release gate.
  - Added `docs/silver-0.3-acceptance.md` with an exact goal-pass objective and
    22 required architecture and end-to-end criteria.

- 2026-07-24: Silver 0.2 Complete Blank-Workspace Suite accepted
  - Added a packaged complete-loop scenario that invokes all eighteen skills independently, records a positive result and relevant boundary or degraded result for each, and verifies recommended-only follow-ups.
  - Ran the full foundation → evidence → synthesis → ideation and human selection → specification → flow and sketch → constrained prototype → evaluation → accepted refinement → re-evaluation loop.
  - Exercised branded pitch and production branches, all local render targets, eleven independent fast checks, real headless-Chrome checks, checkpoint serialization and resume, and visible upstream-revision invalidation.
  - Added negative evidence for raw styles, untraceable claims, implicit constraint suspension, stale revisions, permission failures, incomplete production, asset scope leakage, presentation pins, and unavailable browser targets.
  - Recorded direct passing evidence for all 42 criteria in `docs/silver-0.2-acceptance-audit.md`; the final source gate passes 45 tests and the exact offline archive passes its complete package smoke.

- 2026-07-24: Reviewable v1 workspace migration
  - Added `silver migrate` with a read-only default preview and an explicit `--apply` boundary.
  - Migrated legacy locks, installed the full 0.2 framework-managed payload, added only missing 0.2 project templates, upgraded manifest check discovery, and regenerated disposable pointers.
  - Preserved project-owned canonical and copied files, detected edited managed packages and generated files before any write, and made already-current workspaces an idempotent no-op.
  - Added unit fixtures for preview, apply, preservation, conflict safety, and idempotence plus an exact packed-archive migration smoke.
  - The full build now passes 40 tests and the exact offline `0.2.0` package smoke passes setup, fast checks, real browser checks, independent invocation, migration, and post-migration diagnostics.

- 2026-07-24: Local renderers, shared project resources, and independent checks
  - Added strict v2 contracts and installed blank-workspace templates for a portable asset catalog and a project-owned presentation kit with opportunity, proposal, and outcome templates.
  - Added deterministic semantic-HTML renderers for inexpensive sketches, branded change-case presentations, and one production-capable static HTML/CSS/minimal-JavaScript recipe that refuses incomplete design intent.
  - Expanded the independent suite to cover contract and reference integrity, flows, semantic styles, prototype policy, evidence provenance, presentation integrity, production readiness, asset integrity, accessibility, responsive behavior, and critical interactions.
  - Added a real headless-Chrome DevTools suite that checks contrast and structure, horizontal overflow at declared viewports, and observable critical actions against local render targets.
  - The full build passes 38 tests and the exact offline `silver-design-framework-0.2.0.tgz` installs and passes fast, browser, and independent skill-invocation smoke checks.

- 2026-07-24: Complete v2 skill catalog and blank installation
  - Converted the original five skills and added the remaining thirteen required packages, giving Silver all eighteen project-local v2 skills with concise instructions, UI metadata, contracts, local invocation shims, declared capabilities, permissions, guardrails, completion invariants, checks, and handoffs.
  - Added a guarded invocation runtime that validates pinned inputs and declared outputs, resolves layered permissions and provider degradation, enforces guardrail relaxation rules, prevents blind overwrites, writes atomically, and emits normalized results with recommended-only follow-ups.
  - Upgraded setup to install the complete catalog, schemas, guardrails, runtime, and default playbook under a v2 lock that records path, ownership, version, and integrity for every package.
  - Updated diagnostics, repair, reviewable updates, exact-output fixtures, and the packed smoke test; the packed archive now independently invokes an installed skill through the locked runtime.
  - The full build passes 35 tests, the packed 0.2 smoke passes, and all eighteen skill folders pass the skill-authoring validator.

- 2026-07-24: Optional resumable playbook foundation
  - Added strict playbook and playbook-state contracts for version-pinned leaf skills, typed handoffs, optional branches, feedback and retry edges, readiness conditions, stopping rules, checkpoints, and bounded autonomy.
  - Added the optional default synthesis → ideation → human selection → specification ↔ flow/sketch → prototype → evaluation loop, with explicit pitch and permission-gated implementation branches.
  - Implemented serializable playbook state, checkpoint resolution, graph validation, and fresh-session resume handling.
  - Added revision-change detection that preserves recorded inputs and outputs, marks affected nodes stale, and pauses at a visible reconciliation checkpoint instead of silently rewriting derived work.

- 2026-07-24: Silver 0.2 v2 contract foundation
  - Added strict v2 contracts for skills, normalized invocation results, required working-artifact families, guardrail registries, permission layers, capability-resolution evidence, and user-global tool profiles.
  - Implemented reusable contract validation, six-layer permission intersection, provider fallback and degradation reporting, guardrail relaxation enforcement, and a review-required v1 skill-contract migration.
  - Added positive and negative fixtures proving that `not-run` cannot become downstream readiness, missing policy rules cannot grant authority, unsafe paths are rejected, and non-relaxable guardrails stay fixed.
  - Replaced the contract gate's undeclared Python runtime dependency with the packaged Node/AJV/YAML stack and validated every v1 skill through the migration.

- 2026-07-24: Silver 0.2 release boundary
  - Defined the Complete Blank-Workspace Suite as the next release and moved general existing-codebase adoption after it.
  - Added stable architecture, skill, and end-to-end requirement IDs plus an evidence-backed release audit rule.
  - Required every skill to install locally, run independently, emit normalized results, enforce guardrails, and include positive and negative fixture coverage.
  - Kept external providers, broad recipe coverage, organization inheritance, automated version-control effects, and stakeholder outcomes outside the release gate.

- 2026-07-24: Project renamed to The Silver Design Framework
  - Selected `The Silver Design Framework` as the display name, `Silver` as the short name, and `silver-design-framework` as the repository, folder, and package identity.
  - Renamed the CLI to `silver`, the contract namespace to `silver/`, and the installed lock directory to `.silver/`.
  - Updated framework documentation, schemas, fixtures, generated content, tests, and reference-system branding together rather than retaining the prerelease working name.

- 2026-07-24: Agentic design workflow and presentation planning
  - Recast the broader design practice as independently runnable skills composed through optional, artifact-driven playbooks rather than a fixed lifecycle.
  - Defined the recommended synthesis → ideation → selection → specification ↔ flow/sketch → prototype → evaluation loop and kept production as an explicit readiness-gated side path.
  - Separated skill execution, acceptance, and downstream readiness; planned required and optional capabilities, provider fallbacks, shared guardrails, and resumable playbook state.
  - Added the cross-cutting `pitch` skill concept, portable opportunity/proposal/outcome change cases, branded presentation views, and project-owned presentation kits.
  - Added P1 contract/playbook work and detailed P2 design-skill, pitch, presentation-template, adapter, and conformance work to the backlog.

- 2026-07-23: Local prerelease and MVP acceptance audit
  - Pinned the framework, project-local skills, reference system, and generated lock state to `0.1.0-alpha.1`.
  - Added a package smoke test that packs and installs the tarball in an isolated consumer before running setup, doctor, and the installed fast suite.
  - Audited all ten first-iteration acceptance criteria and recorded direct evidence in `docs/mvp-acceptance.md`.
  - Added explicit full-suspension coverage alongside constrained-default and partial-override tests.

- 2026-07-23: Complete blank-workspace vertical slice
  - Added four independent, dependency-free fast checkers for artifact contracts, flow structure, semantic style use, and prototype policy.
  - Added a constrained static prototype renderer that requires an exact pinned flow revision and refuses implicit replacement of edited output.
  - Replaced remaining fixed visual dimensions in authored reference CSS with approved component/layout tokens.
  - Added an end-to-end test that runs the installed skills from blank setup through brand refinement, revised flow, Mermaid view, constrained prototype, and passing conformance results.
  - Added negative coverage for malformed artifacts, raw visual values, and stale prototype flow revisions.

- 2026-07-23: Safe repair and reviewable updates
  - Added `repair` for the generated design index and agent discovery pointer without modifying canonical design work.
  - Added preflighted updates for clean framework-managed skills; local skill edits stop the operation as explicit conflicts.
  - Kept the copied-and-owned reference system untouched and reported changed releases as proposals.
  - Added fixture-release tests proving update preservation, conflict safety, and idempotence.

- 2026-07-23: Complete blank-workspace payload
  - Setup now installs all five project-local skills, the editable reference system with compiled outputs, and a generated agent discovery pointer.
  - Lock state records framework-managed skills separately from the copied-and-owned reference system and generated discovery files.
  - Doctor now verifies installed skill integrity without treating intentional reference-system edits as drift.
  - Corrected the default render target to the bundled static login example and expanded exact-output and ownership tests.

- 2026-07-23: Shared asset model added to the backlog
  - Separated compact asset catalogs from reusable files, prototype-local experiments, and production projections.
  - Assigned organization, product, and codebase ownership while retaining external authority for large or restricted masters.
  - Added promotion, synchronization, provenance, licensing, integrity, and independent conformance work to the P2 backlog.

- 2026-07-23: Portable flow implementation
  - Added the strict v1 JSON graph contract for user, interaction, and component behavior flows.
  - Added a validated project-local `flow` skill with dependency-free initialization, structural checking, and revision-stamped Mermaid rendering.
  - Added stable actor, node, and transition identifiers plus reachability, decision, outcome, and reference checks.
  - Added manifest-declared flow roots, default flow views, repository permissions, blank-workspace documentation, and fast-suite coverage.
  - Extended prototype metadata and initialization to pin exact flow IDs, paths, and revisions without making flows mandatory.

- 2026-07-23: Portable flow requirement
  - Added tool-neutral flows as structured, revisable design inputs for prototypes, product compositions, and component behavior.
  - Distinguished the portable flow model from generated Mermaid, HTML, Figma, Paper, or other visual views.
  - Required derived work to record the flow revision it used while keeping process order optional and preventing silent rewrites.
  - Added a minimal flow contract, skill, renderer, and structural checks to the first vertical slice; deferred rich canvas round trips and advanced state libraries.

- 2026-07-23: First project-local skill packages
  - Added concise, agent-readable `brand`, `theme`, `prototype`, and `design-check` packages with machine-readable authority contracts.
  - Kept brand and theme canonical changes behind explicit permission boundaries and prevented either task from silently starting follow-up work.
  - Made prototype work constrained by default while allowing explicit partial or suspended profiles.
  - Added a self-contained prototype metadata initializer that refuses unconfirmed constraint overrides.
  - Added a v1 prototype metadata schema and contract/runtime tests.
  - Validated all four skill structures with the skill-authoring validator.

- 2026-07-23: Core blank-workspace setup and diagnostics
  - Added the local executable, now named `silver`, with `setup`, `doctor`, and `version` commands.
  - Made setup safe and idempotent: it accepts blank/minimal folders, resumes valid framework workspaces, preserves project edits, and refuses to infer existing-codebase adoption.
  - Added runtime JSON Schema and YAML validation for manifests, artifact frontmatter, permissions, and lock state.
  - Added deterministic index generation plus doctor checks for cross-file metadata agreement, missing artifacts, stale indexes, and managed-file integrity.
  - Added fixture tests for exact output, idempotence, edit preservation, diagnostics, and existing-codebase refusal.

- 2026-07-23: First executable framework slice
  - Added strict v1 schemas for the workspace manifest, artifact frontmatter, skill contracts, permission layers, lock state, findings, and check results.
  - Added permission-resolution and independent-check protocols.
  - Added a realistic blank-workspace fixture with canonical artifacts, generated index, repository permission policy, prototype policy, and lock state.
  - Added positive and negative contract fixtures plus a validator; `npm run validate:contracts` passes.
  - Relocated the prior architecture spike to `reference-system/`.
  - Repaired DTCG 2025.10 transforms for dimensions, durations, colors, and shadows under Style Dictionary 4.4.
  - Changed the Tailwind adapter to expose semantic colors and approved structural scales rather than primitive colors.
  - Removed raw scheme/mode colors from authored CSS by introducing named palette tokens.
  - Built the reference outputs and browser-tested the static login example in light, dark, and 375px-wide layouts with no console errors or horizontal overflow.

- 2026-07-23: Product direction reset
  - Reframed the product as an agent-neutral design-practice meta-system.
  - Defined the first iteration as a blank-workspace vertical slice.
  - Established the organization foundation → product workspace → codebase binding model.
  - Chose project-local, committed skills with reviewable updates.
  - Limited the CLI to setup/update/repair/migration/diagnostics.
  - Defined explicit prototype constraint profiles and non-enforced lifecycle recommendations.
  - Selected GitHub as the canonical source and immutable release host, with a small npm CLI as the recommended convenience channel.
  - Added a prioritized post-MVP backlog.

- 2026-06-15: Portable design-system architecture spike
  - Created DTCG token sources, a Style Dictionary build concept, CSS components, HTML contracts, and a static example.
  - This work is retained as the future `reference-system/` fixture; it has not yet been build- or browser-validated.

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

2026-08-12
