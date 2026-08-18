# Tasks

## Now — First Iteration

- [x] Define the canonical workspace manifest schema
  - type: design
  - priority: high
  - context: small
  - notes: Include artifact mappings, scope, inheritance, authority, implementation profiles, enabled checks, and external-source metadata without making every field mandatory.

- [x] Define the artifact metadata and generated index contracts
  - type: design
  - priority: high
  - context: small
  - notes: Narrative artifacts use Markdown frontmatter. `design/INDEX.md` is generated, compact, and disposable.

- [x] Define the skill package contract
  - type: design
  - priority: high
  - context: small
  - notes: Declare required artifacts/capabilities, reads, writes, outputs, external effects, permissions, scripts, and context budget.

- [x] Define the tool capability and permission model
  - type: design
  - priority: high
  - context: small
  - notes: Resolve permissions as the intersection of framework defaults, user ceiling, organization/project restrictions, and skill request.

- [x] Define the check protocol
  - type: design
  - priority: high
  - context: small
  - notes: Separate checkers, normalized findings, consistent exit behavior, and an explicit `not-run` result when a required target or provider is unavailable.

- [x] Relocate the existing design-system spike to `reference-system/`
  - type: build
  - priority: high
  - context: small
  - notes: Preserve history, repair paths, then install/build/render before treating it as a valid fixture.

- [x] Implement a blank-workspace installer fixture
  - type: build
  - priority: high
  - context: small
  - notes: Exact-output setup, idempotence, project-edit preservation, refusal of inferred existing-codebase adoption, project-local skill and reference-system installation, deterministic discovery generation, read-only diagnostics, safe repair, and reviewable updates now pass.

- [x] Implement first task-level skills
  - type: build
  - priority: high
  - context: medium
  - notes: Added validated `brand`, `theme`, `prototype`, and `design-check` packages. The prototype skill owns its deterministic metadata initializer and explicit-override guard.

- [x] Define and implement portable flow artifacts
  - type: build
  - priority: high
  - context: medium
  - notes: Added a strict JSON graph contract, project-local `flow` skill, dependency-free initializer, revision-stamped Mermaid renderer, normalized structural checker, and exact revision references for prototypes and future component contracts.

- [x] Validate the first vertical slice
  - type: test
  - priority: high
  - context: medium
  - notes: Verified blank folder → setup → brand refinement → portable flow revision and Mermaid view → constrained static prototype pinned to that flow → four independent fast checks → recommended next actions without automatic execution.

- [x] Prepare a private prerelease
  - type: release
  - priority: medium
  - context: small
  - notes: Prepared and validated the isolated local tarball candidate at 0.1.0-alpha.1 with exact lock versions. Remote private publication awaits a selected package scope or GitHub release destination.

## Completed Release — Silver 0.2 Complete Blank-Workspace Suite

The authoritative requirement list and release evidence rules are in
`docs/silver-0.2-acceptance.md`. A task is not complete until its corresponding
`S02-*` criteria have automated evidence.

- [x] Implement and validate the v2 contract foundation
  - type: design
  - priority: high
  - context: medium
  - notes: Complete. Strict schemas, normalized persisted results, guardrails, layered permissions, provider degradation, tool profiles, v1 skill migration, and reviewable workspace migration pass source and packed release evidence.

- [x] Implement and validate agentic composition
  - type: design
  - priority: high
  - context: medium
  - notes: Complete. The installed default playbook composes real catalog results, pauses and resumes from serialized state, and visibly invalidates downstream work on upstream revision change.

- [x] Implement the complete required skill catalog
  - type: build
  - priority: high
  - context: large
  - notes: Complete. All eighteen packages install locally and are independently invoked in the packed scenario with task-specific outputs, valid persisted results, positive coverage, and a relevant permission, capability, or provider-degradation boundary.

- [x] Complete blank-workspace lifecycle and local baseline support
  - type: build
  - priority: high
  - context: medium
  - notes: Complete. Setup, diagnostics, repair, update, migration, all local renderers, assets, presentation kit, eleven independent fast checks, and real local Chrome checks pass from source and the exact archive.

- [x] Prove the complete blank-workspace release
  - type: test
  - priority: high
  - context: large
  - notes: Complete. `S02-E2E-01` through `S02-E2E-10` and all 32 architecture/skill criteria have direct passing evidence in `docs/silver-0.2-acceptance-audit.md`; final gates are `npm run build` and `npm run test:package`.

## Next Release — Silver 0.3 Portable Tools and Reconciliation

The authoritative requirement list and release evidence rules are in
`docs/silver-0.3-acceptance.md`. A task is not complete until its corresponding
`S03-*` criteria have direct automated evidence.

- [x] Implement registered portable providers and lifecycle migration
  - type: build
  - priority: high
  - context: medium
  - notes: Complete. Provider discovery is package-driven, the portable and Figma providers install and lock independently, and source plus exact-archive tests prove reviewable, idempotent 0.2-to-0.3 migration and conflict preservation.

- [x] Implement portable format and representation-binding contracts
  - type: design
  - priority: high
  - context: medium
  - notes: Complete. Registered codecs cover every skill output, local views carry exact provenance, and strict secret-free bindings record authority, fidelity, provider revisions, and the shared reconciliation base.

- [x] Implement drift detection and safe reconciliation
  - type: build
  - priority: high
  - context: large
  - notes: Complete. All seven synchronization states, shared-base comparison, typed semantic routing, persisted proposals, accepted-operation apply, freshness checks, atomic writes, rollback, and failure preservation have direct tests.

- [x] Implement the first Figma adapter
  - type: build
  - priority: high
  - context: large
  - notes: Complete. The real adapter normalizes captured variables, styles, components, and selected nodes, preserves semantic identity and provider revisions, classifies changes, and guards a narrow semantic-token write with preview, approval, permission, and freshness.

- [x] Prove the packed 0.3 release
  - type: test
  - priority: high
  - context: large
  - notes: Complete. All 22 `S03-*` criteria have direct passing evidence in `docs/silver-0.3-acceptance-audit.md`; the final gates are `npm run build` and `npm run test:package`.

## Completed Release — Silver 0.4 What Now

The authoritative requirement list and release evidence rules are in
`docs/silver-0.4-acceptance.md`.

- [x] Implement evidence-ranked workspace orientation
  - type: build
  - priority: high
  - context: medium
  - notes: Complete. The nineteenth project-local skill inspects manifest, lock, results, playbooks, freshness, and artifact state; ranks three to five evidence-linked options; and never starts them.

- [x] Implement contract-bounded dynamic recommendations
  - type: design
  - priority: high
  - context: medium
  - notes: Complete. Successful invocations may preserve caller ranking only for contract-allowlisted actions, while blocked results emit no recommendations and existing skills retain static defaults.

- [x] Prove source, migration, and exact-package behavior
  - type: test
  - priority: high
  - context: medium
  - notes: Complete. All ten `S04-*` criteria have direct evidence; `npm run build` passes 67 tests and `npm run test:package` passes with reviewable 0.3-to-0.4 migration and all nineteen skills.

- [x] Connect setup to branded orientation
  - type: build
  - priority: medium
  - context: small
  - notes: Complete. Human-facing setup displays the authoritative Ag terminal mark in a contrast-aware silver tone, then runs and records one guarded `what-now` invocation; JSON and non-interactive output remain escape-safe.

## Completed Release — Silver 0.5 Traceable Practice and Context

The authoritative requirements and evidence are in
`docs/silver-0.5-acceptance.md` and
`docs/silver-0.5-acceptance-audit.md`.

- [x] Implement agent-led guided setup and repository topology
  - type: build
  - priority: high
  - context: large
  - notes: `setup inspect` returns a revisioned, state-locked recommendation and `setup apply` idempotently applies only the reviewed integrated or separate plan.

- [x] Implement My Practice and manually linked guidance
  - type: build
  - priority: high
  - context: large
  - notes: My Practice is a visible local Git workspace; sanitized practice changes and selected local-guidance snapshots are revisioned without copying private paths into product results.

- [x] Implement multi-context design work and portable maps
  - type: build
  - priority: high
  - context: large
  - notes: Design contexts compose brands, systems, shared catalogs, expression mappings, surfaces, assets, presentation kits, and codebases; the map skill validates and renders journeys and service blueprints.

- [x] Implement universal provenance, effects, and Git checkpoints
  - type: design
  - priority: high
  - context: large
  - notes: Durable results pin practice, guidance, context, and sources; `silver trace` renders the chain; effects replace active Silver permission intersection; accepted changes checkpoint only their own paths and never push.

- [x] Implement and prove reviewable 0.4-to-0.5 migration
  - type: test
  - priority: high
  - context: large
  - notes: Migration preserves project work and edited legacy policies, bootstraps unknown legacy provenance by exact integrity, installs 21 skills, and passes source and exact-package gates.

## Completed Release — Silver 0.7 One Good Step

The authoritative requirements and evidence are in
`docs/silver-0.7-acceptance.md`. This release answers the 22-issue field report
from the first real product session.

- [x] Make check results mean something
  - type: build
  - priority: high
  - context: large
  - notes: Invocations run their own required checks and persist evidence; a
    claimed pass without resolvable evidence is degraded to `not-run` with a
    reason; `complete-awaiting-verification` separates generated from verified;
    `silver check` added.

- [x] Make accepted canonical work activate atomically
  - type: build
  - priority: high
  - context: medium
  - notes: Artifact, manifest, index, and lock move in one checkpoint with an
    in-place manifest edit. `repair` and migration reconcile existing drift.

- [x] Make accepted invocations recoverable
  - type: build
  - priority: high
  - context: medium
  - notes: Git writability is confirmed before canonical writes; a post-write
    failure leaves a resumable request with fresh integrity hashes.

- [x] Ship the one-skill-then-stop rule into workspaces
  - type: design
  - priority: high
  - context: medium
  - notes: Generated AGENTS.md and CLAUDE.md carry it, recipes are `offered`,
    playbooks honour `single-step`, and the README presents the loop as a map.

- [x] Separate tone from skills with a studio voice layer
  - type: design
  - priority: medium
  - context: medium
  - notes: Framework default plus personal practice override, resolved through
    an ordered source list with a workspace layer designed in. Personal content
    is materialized untracked and never enters a committed file. No skill prose
    changed.

- [x] Fix the installed-path and false-signal defects
  - type: build
  - priority: high
  - context: large
  - notes: Portable launcher, namespaced adapter skills, honest `allowed-tools`,
    post-install guidance, one shared artifact-kind classifier, dependency and
    build directories excluded from traversal, deduplicated effects, explained
    setup questions, and a fresh workspace with zero diagnostics.

## Completed Release — Silver 0.8 Tools That Are Actually There

- [x] Name tool-using work as activities, derived from existing contracts
  - type: build
  - priority: high
  - context: medium
  - notes: `silver/activity-catalog/v1` names a capability, its actions, and
    optionally artifact kinds. Provider and skill support is derived from their
    contracts, never declared, and drift fails the contract gate in both
    directions. Skills gained effect declarations for their optional
    capabilities, without which pull and push are indistinguishable.

- [x] Split Figma into transports with typed setup ladders
  - type: build
  - priority: high
  - context: medium
  - notes: `target`, `variant`, `aliases`, `connection`, `requires_env`, and a
    `setup` ladder whose steps declare who owns them and who can verify them.
    Availability distinguishes configured from responding, because only the
    agent can call an MCP server. Migration retires the superseded package.

- [x] Make provider selection real
  - type: build
  - priority: high
  - context: large
  - notes: One order — personal, project, team, framework — and two filters,
    availability and veto. `selectProvider` gets its first caller, the
    unreachable `local-fallback` branch becomes reachable, and pulling from and
    pushing to one tool can resolve to different transports.

- [x] Never narrow a designer's options silently
  - type: build
  - priority: high
  - context: medium
  - notes: A chain is an offer list. Removals carry reason, source, failing
    setup step, and who can lift them. Non-interactive runs stop with a
    resumable request rather than choosing. Now a PROJECT.md constraint.

- [x] Declare tools without installing them
  - type: build
  - priority: high
  - context: medium
  - notes: `silver tools` and `silver tools --connect`. Silver writes a host MCP
    declaration for an installed tool and nothing else — no install, no clone,
    no credential, no process. Secret-gated, and honest where it does not know
    a launch command.

- [x] Fix the studio-voice practice-change path
  - type: fix
  - priority: high
  - context: small
  - notes: `practice apply` wrote prose into `PRACTICE.md`, which the resolver
    never reads. It now writes `studio-voice.md` and pins it in the manifest.

## Next Release — Silver 0.9 Meet the Work Where It Is

The authoritative requirement list and release evidence rules are in
`docs/silver-0.9-acceptance.md`. A task is not complete until its
corresponding `S09-*` criteria have automated evidence — except the items
marked manual below, which `docs/silver-0.9-acceptance.md` excludes from the
automated gate by design.

### Done

- [x] W1 Adopt an existing folder instead of only a blank one
  - type: build
  - priority: high
  - context: large
  - notes: `silver adopt inspect | apply`, `silver/adoption-plan/v1`, six
    additive-only dispositions. Setup no longer refuses non-blank folders.
    `S09-ADOPT-*`.

- [x] W2 Provider provenance and guidance
  - type: build
  - priority: medium
  - context: small
  - notes: `source`/`guidance` on the provider contract; `compare_to` drift
    fails the gate. `S09-PROV-*`.

- [x] W3 Declared transports
  - type: build
  - priority: medium
  - context: medium
  - notes: Three discovery origins, optional `operations`, placeholder
    refusal. `S09-TRANSPORT-*`.

- [x] W4 Split browser inspection from browser driving
  - type: build
  - priority: medium
  - context: medium
  - notes: `inspect-in-browser` / `drive-browser`, portable local Chrome,
    chrome-devtools-mcp, playwright-mcp. `S09-BROWSER-*`.

- [x] W5 Make troubleshooting a real diagnostic ladder
  - type: build
  - priority: medium
  - context: medium
  - notes: `--diagnose` walks the whole ladder; live-verified against a real
    Figma MCP. `S09-TROUBLESHOOT-*`.

- [x] W9a Publish the semantic role vocabulary
  - type: design
  - priority: high
  - context: medium
  - notes: `silver/semantic-roles/v1`; filled `action.*` states, `type.*`,
    `icon.*`, `elevation.*`. `S09-VOCAB-*`.

- [x] W9b-f Workspace-owned `design/system/`, retire `reference-system/`
  - type: build
  - priority: high
  - context: large
  - notes: Authored token source vs. generated index/CSS, var()-chained
    output with an oklch wide-gamut block, `showcase.html` pre-generated at
    setup, `alongside` renamed `with-existing-work`. Committed as `f5b4a6c`.
    `S09-SYSTEM-*`.

### Automated — safe to run as one unattended pass

- [x] Make `checks.policy_profile` real
  - type: build
  - priority: high
  - context: small
  - notes: `semantic-styles`, `accessibility`, and `responsive-behavior` all
    read the manifest's actual profile now; `adoption` downgrades
    `semantic-styles` findings to `severity: info` with the reason stated,
    and reports `not-run` with a reason when there's no
    `design/system/tokens.json` yet to check against. `S09-CONFORM-*`, done.

- [x] Fix the pack-time version-normalization defect
  - type: fix
  - priority: high
  - context: small
  - notes: `sourcePackages()` now stamps every skill/provider with the
    release version instead of each file's own `version:`; a second stale
    `design/system/catalog.html` reference (pre-W9b-f rename) in
    `complete-blank.mjs` was also blocking the packed smoke test. Both
    `npm run build` and `npm run test:package` are green. `S09-MIGRATE-03`,
    done ahead of the rest of W8.

- [x] W9g `silver link` and doctor link diagnostics
  - type: build
  - priority: high
  - context: medium
  - notes: Registers a codebase as a pinned `linked-source` relative to the
    workspace; doctor reports an unresolved or moved link; `adopt --source`
    now resolves a linked-source id. Fixed a latent root-resolution bug in
    `inspectLinkedSources`/`verifyLinkedSource` along the way. `S09-LINK-*`,
    done.

- [x] W9h Figma pull fidelity
  - type: build
  - priority: high
  - context: large
  - notes: `framework/providers/figma-console-mcp/tokens.mjs` —
    alias-preserving parse of `VARIABLE_ALIAS` into DTCG `{reference}`
    (bottom-up, cycle-guarded), proposed collection classification from
    alias direction, per-property style binding. Fixture-only tests, no
    live calls. `S09-FIGMA-PULL-*`, done.

- [x] W9i Figma push fidelity
  - type: build
  - priority: high
  - context: large
  - notes: `previewSemanticTokenWrite` writes a `VARIABLE_ALIAS` when a
    value is still a reference; new `previewStyleWrite` mirrors it per
    property; `change-set.schema.json` gained `value_kind` so a structural
    edit (alias -> literal) is classified distinctly. Reuses the existing
    revision-staleness and approval gates unchanged. `S09-FIGMA-PUSH-*`,
    done.

- [x] Shared adapter round-trip harness
  - type: test
  - priority: medium
  - context: medium
  - notes: `framework/testing/adapter-round-trip.mjs` — pull∘push identity
    on a no-op, structural edit produces a distinct write — parameterized
    by `framework/tests/figma-round-trip.test.mjs`. Corrected the plan's
    `round_trip: full` to the schema's real `lossless` value.
    `S09-ROUNDTRIP-*`, done.

- [x] W5e Personal `tools.yaml`, resolve, and bind
  - type: build
  - priority: medium
  - context: medium
  - notes: `My Practice/tools.yaml` read as the personal ordering source;
    `silver tools --resolve "<phrase>"` and `--bind <activity> <transport>`.
    `S09-PRACTICE-*`, done.

- [x] W6 References collection
  - type: build
  - priority: medium
  - context: medium
  - notes: `silver/reference-collection/v1` at `design/references/`, required
    `description` and `rights`, `reference-integrity` check, never
    auto-loaded — cited explicitly (`skill-invocation.references`) and
    pinned in provenance. `S09-REF-*`, done.

- [x] W8 (remaining automatable part): 0.8→0.9 migration
  - type: build
  - priority: high
  - context: medium
  - notes: Reviewable migration preserving any hand-edited
    `reference-system/` content and installing `design-system-tokens-seed`
    without overwriting it, done. Surfaced and fixed four real defects along
    the way, the sharpest being `lock.schema.json` having dropped
    `"reference-system"` from its type enum entirely — which would have
    made every real 0.8 workspace's own lock file fail validation before
    migration could even start. `S09-MIGRATE-01`, done. (`S09-MIGRATE-02`
    and `S09-MIGRATE-03` were already done.) All of W8's automatable scope
    is now complete; only `S09-MIGRATE-04` (manual end-to-end) remains.

- [x] W10 Skill taxonomy: `visualize`, `collect`, `structure`, `measure`
  - type: build
  - priority: high
  - context: large
  - notes: Added mid-release once 0.9's own thesis exposed a
    producer-less required input (`evidence`, required by `synthesize`,
    produced by no skill). `sketch` renamed `visualize` end to end
    (skill id, artifact kind, output path, capability, activity), with
    `sketch` kept valid-but-deprecated so pre-0.9 artifacts and migration
    never rewrite project-owned content. New `collect` (research → collect
    → synthesize) outputs the existing `evidence` kind with a new required
    `source_pin`, surfacing and fixing a real gap: `evidence` was missing
    from `check-evidence.mjs`'s own kind set, so it was never actually
    validated. New `structure` (`silver/structure/v1`, modeled on `map`)
    gives information architecture a home distinct from `flow` and `map`.
    New `measure` (implement → measure → synthesize) closes the loop after
    production, with a new `product-analytics` named-gap capability
    matching the existing `research-evidence` pattern. W10 produced 24 skills;
    the synchronization hardening subsequently added `reconcile` as the 25th.
    `S10-*`, done.

### Release hardening found by the 2026-08-16 audit

- [x] Audit code, executable reachability, tests, package, and native paths
  - type: test
  - priority: high
  - context: large
  - notes: Fixed bounded defects in check invocation, selective checking,
    browser completion, built-in WebSocket support, transport probes, real
    `0.6.1` migration, Git subprocesses, Node engine metadata, and test
    cleanup. Updated two vulnerable bundled transitives within compatible
    ranges; the production dependency audit reports zero vulnerabilities.
    Full coverage passes 201/201 with no skips or todos. Evidence and
    recommendations are in `docs/code-and-test-audit-2026-08-16.md`.

- [x] Make every Silver-managed mutation symlink-safe
  - type: architecture
  - priority: high
  - context: large
  - notes: Added the canonical relative-path-only workspace mutation runtime,
    immediate ancestor/realpath checks, constrained Claude adapter links,
    doctor diagnostics, safe renderers and evidence writers, and adversarial
    linked-path/race tests. A symlinked workspace root is canonicalized; links
    beneath it are rejected.

- [x] Make migration apply transactional and recoverable
  - type: architecture
  - priority: high
  - context: large
  - notes: Migration and update now render into lifecycle staging and activate
    through a flushed durable journal with preimages, per-operation state,
    lock-last ordering, validation, automatic rollback, and explicit
    `silver recover` resume/rollback. Generated Claude links participate in the
    transaction; process-death gaps and contention have direct tests.

- [x] Expose reconciliation and codecs through a stable synchronization surface
  - type: design
  - priority: medium
  - context: medium
  - notes: `silver link inspect|apply`, `silver sync status|inspect|apply`, and
    the 25th `reconcile` skill now exercise artifact codecs and reconciliation
    for linked repositories and captured Figma tokens. Playbooks and browser-
    evidence ownership remain separate findings rather than synchronization
    blockers.

- [x] Implement linked-source and Figma synchronization
  - type: build
  - priority: high
  - context: large
  - notes: Strict v2 source/binding/snapshot/change/result/adapter contracts,
    explicit partial acceptance, structural and honest whole-file adapters,
    authority and shared-base drift handling, source-native bounded checks,
    transactional imports, two-pass Figma writes, recoverable external Git
    sagas, and reviewed `design/system` symlink conversion are implemented.

- [x] Separate browser mechanism errors from completed design findings
  - type: quality
  - priority: high
  - context: medium
  - notes: Added the four terminal check outcomes (`pass`, `fail`, `not-run`,
    `error`), typed browser stage/process diagnostics, Chrome-owned debugging
    port allocation, one launch/readiness retry, bounded stderr, verified
    cleanup, distinct exit codes, and repeated real/injected browser coverage.

- [x] Rewrite the public README for the Silver 0.9 release
  - type: docs
  - priority: high
  - context: medium
  - notes: Reoriented the README to product designers and local agents: signed
    macOS package first, a copyable chat-first install path second, then the
    workspace model, 25 skill groups, included adapters, linked-source/Figma
    reconciliation, and the safety/recovery boundary. Claude Cowork is named
    accurately as unsupported.

- [x] Produce signed and notarized macOS 0.9 installer packages
  - type: release
  - priority: high
  - context: medium
  - notes: Complete locally on 2026-08-17: both native payloads were signed
    with Developer ID Application, both packages with Developer ID Installer,
    notarized and stapled by Apple, accepted by `spctl`, and verified against
    final SHA-256 checksums. The final packages, checksum manifest, exact npm
    tarball, and its checksum are published on GitHub as `v0.9.0`. See
    `docs/native-macos-distribution.md`.

- [ ] Publish `silver-design-framework@0.9.0` to npm
  - type: release
  - priority: high
  - context: small
  - notes: GitHub `v0.9.0` is public. This release Mac must first authenticate
    with `npm login`; then publish the already verified exact tarball with
    `npm publish --access public` and verify it with a fresh `npx` invocation.

- [ ] Restore or exceed the pre-hardening branch and function coverage percentages
  - type: quality
  - priority: medium
  - context: medium
  - notes: The final 226-test run improves line coverage from 83.16% to 83.30%
    and directly covers the new high-risk recovery states, but aggregate branch
    coverage is 74.41% (baseline 75.04%) and function coverage is 88.83%
    (baseline 90.09%). Add targeted tests for the remaining transaction,
    recovery CLI, source-adapter, and synchronization error branches.

### Manual — needs the user directly, run after the automated pass

- [x] W7 Tool registry and capability vocabulary
  - type: design
  - priority: medium
  - context: large
  - notes: Closed through a direct working session with the user, as
    designed — `S09-CURATE-01` was never meant to be automatable. Grew into
    the largest workstream in the release: the activity catalog went from 20
    to 67 namespaced entries, each with a `fallback` guaranteeing a native
    answer; provider support moved from derived to declared
    (`provider.activities`); `interface.detection` makes CLI-only transports
    visible for the first time; authored `setup` ladders were replaced by
    generically derived diagnosis plus freeform `post_setup` notes; `silver
    tools --for "<phrase>"` resolves a task description to an activity and
    what will serve it; and nine new declarations shipped
    (`figma-official-desktop-mcp`, `excalidraw-mcp`, `miro-mcp`,
    `canva-connect-api`, `webflow-mcp`, `v0-api`, `lighthouse-cli`,
    `axe-core-cli`, `chromatic-cli`), plus corrections to `figma-official-mcp`
    (it reads and writes, not read-only) and `figma-console-mcp`'s publisher
    metadata. `S09-CURATE-01`, `S09-TOOLS-01` through `S09-TOOLS-07`, done.

- [ ] Manual end-to-end: blank workspace
  - type: test
  - priority: high
  - context: small
  - notes: `npm install` → `silver setup .` → flow → prototype → open it,
    confirm it is visibly styled. `S09-MIGRATE-04`.

- [ ] Manual end-to-end: adjacent/adopted workspace
  - type: test
  - priority: high
  - context: medium
  - notes: Set up in a copy of a real product, adopt its tokens and
    components, render a prototype, confirm it uses the product's own
    classes and CSS. `S09-MIGRATE-04`.

- [x] Manual live Figma round trip
  - type: test
  - priority: medium
  - context: small
  - notes: Passed 2026-08-17 in `Test File`. A primitive and semantic alias
    survived pull, no-op push, primitive propagation, a deliberate literal
    structural edit, and alias restoration. Canvas swatch `5:11` is bound to
    semantic variable `VariableID:5:4`, which aliases primitive
    `VariableID:5:3`; section `5:5` remains as visible evidence. Interactive
    only, never a CI step. `S09-MIGRATE-04`.

## Following Milestone — Existing Codebase Adoption

W1 (0.9) already built the generic mechanism this milestone describes:
`silver adopt inspect | apply` discovers existing docs, tokens, components,
and source roots and proposes one of six additive-only dispositions per
entry, without reorganizing the repository or rewriting production code.
What remains here is running it for real, which is why it stays a manual
0.9 to-do (`S09-MIGRATE-04` in `docs/silver-0.9-acceptance.md`) rather than a
separate milestone.

- [ ] Adopt one representative existing product repository, for real
  - type: test
  - priority: high
  - context: medium
  - notes: Pick a real repository, run `silver adopt inspect | apply`
    against it, and confirm the proposed dispositions and generated
    adoption report are actually correct and useful — a human judgment
    call, not a mechanism gap.

## Backlog

See `BACKLOG.md` for all functionality intentionally deferred beyond the first iteration.

## Done

- [x] Name the project The Silver Design Framework and align its repository, package, CLI, schema, lock-directory, fixture, and documentation identities
- [x] Reframe the product as a design-practice framework rather than a design system
- [x] Define organization, product, and codebase scopes
- [x] Set project-local skill installation and project-owned update policy
- [x] Separate setup/update tooling from daily skill workflows
- [x] Establish prototype constraint and explicit suspension policy
- [x] Establish provider-neutral tool capability and permission concepts
- [x] Establish external authority and default notify-based synchronization
- [x] Separate deterministic checks behind a thin orchestration command
- [x] Choose blank-workspace validation before existing-codebase adoption
- [x] Define installer hosting and distribution recommendation
- [x] Define independently runnable skills and optional artifact-driven playbooks as the general workflow model
- [x] Separate skill execution, acceptance, and downstream readiness
- [x] Define pitch, portable change-case, branded presentation-view, and project-owned presentation-kit concepts
