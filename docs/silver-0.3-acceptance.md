# Silver 0.3 Release Acceptance

## Release

**Version:** `0.3.0`

**Working name:** Portable Tools and Reconciliation

**Status:** Complete

This document is the authoritative release boundary for Silver `0.3.0`. The
release is complete only when every required criterion below has passing,
repository-recorded evidence. Backlog priorities, prose-only designs, and
provider-specific demonstrations do not override this gate.

## Outcome

Starting with a Silver 0.2 blank workspace, a designer can run every general
design skill through a bundled project-local baseline, create portable
artifacts and reviewable local views without external tools, bind selected
artifacts to Figma through a provider-neutral adapter contract, detect and
classify drift, stage a three-way reconciliation proposal, explicitly apply
accepted changes, and generate downstream work from exact accepted revisions.
Provider failures, ambiguous mappings, stale proposals, and denied writes leave
accepted artifacts unchanged.

## Goal Pass Objective

Use the following objective verbatim for a goal-directed implementation pass:

> Implement Silver `0.3.0`, Portable Tools and Reconciliation, exactly as
> specified by `docs/silver-0.3-acceptance.md`. Complete every required
> `S03-ARC-*` and `S03-E2E-*` criterion without substituting prose, inert
> schemas, or canned mocks for executable behavior. Work from the current
> repository state, preserve Silver 0.2 behavior and project-owned files, stay
> within the document's explicit exclusions, and update project state as work
> progresses. Continue until the exact packed release candidate proves every
> general skill has a useful offline portable baseline; provider packages are
> registered rather than hard-coded; canonical artifacts, local views, and
> external views have explicit authority and revision provenance; Figma-shaped
> changes can be read, normalized, classified, reconciled three ways, and
> applied only after acceptance and permission; failure and divergence cannot
> corrupt accepted work; and `docs/silver-0.3-acceptance-audit.md` records
> direct passing evidence for all 22 criteria. Do not mark the goal complete
> while any criterion is unchecked, failed, supported only by prose, dependent
> on an unrecorded manual step, or represented as passing when its required
> result is `not-run`. Do not commit, push, publish, modify a live external
> file, send, present, or create a pull request unless separately authorized.

## Meaning of Implemented

A required capability is implemented only when it:

1. has a strict versioned contract and deterministic semantic validation;
2. is packaged in the exact release archive and installed or migrated
   reviewably;
3. performs executable work through the guarded runtime;
4. records stable artifact IDs, revisions, authority, providers, and
   provenance;
5. distinguishes portable artifacts from generated local and external views;
6. enforces permissions, expected integrity, no-silent-mutation, and
   recommended-only follow-ups;
7. reports partial, degraded, ambiguous, stale, denied, and `not-run` outcomes
   honestly;
8. has positive, divergence, conflict, unavailable-provider, invalid-payload,
   and permission-boundary fixtures where applicable; and
9. contributes direct automated evidence to the `0.3.0` acceptance audit.

Captured provider-shaped fixtures are permitted for deterministic tests.
Tests must execute the real adapter, normalization, comparison, validation,
proposal, and apply code paths. Merely returning a canned expected result does
not satisfy a criterion. Live credentials and live-provider availability are
not required for the deterministic release gate.

## Required Architecture

- [x] **S03-ARC-01 — Reviewable 0.2-to-0.3 lifecycle.** A packed `0.3.0`
  release can initialize a blank workspace and preview, apply, and re-run an
  idempotent migration from a valid `0.2.0` workspace. Project-owned artifacts
  and edited managed packages are preserved or surfaced as conflicts.
- [x] **S03-ARC-02 — Registered portable providers.** Bundled baseline
  capabilities are declared by installed provider packages with versions,
  capabilities, availability checks, permissions, scripts, supported
  artifact kinds, and fidelity. Capability resolution discovers these
  packages from framework source at `framework/providers/<id>/` and installed
  state at `.silver/providers/<id>/`; it no longer depends on a hard-coded
  local-capability list.
- [x] **S03-ARC-03 — Universal skill baseline.** Every general design skill
  in the eighteen-skill Silver 0.2 catalog has a useful repository-only
  execution path from the exact offline archive. A skill that performs an
  inherently external or production effect identifies that effect separately
  and does not claim the baseline performed it.
- [x] **S03-ARC-04 — Portable format profiles.** Artifact contracts declare
  canonical serialization separately from view formats. Prose-first artifacts
  support Markdown with Silver frontmatter; flows remain structured graphs;
  tokens remain DTCG JSON; manifests and state use declared JSON or YAML
  contracts. A migration or compatibility codec preserves valid 0.2 working
  artifacts without creating two canonical representations.
- [x] **S03-ARC-05 — Local visual baseline.** Self-contained semantic HTML is
  available as the default visual view for sketches, prototypes, presentation
  views, and system catalogs. Flows render both a compact Mermaid view and a
  self-contained HTML view from the same graph. Generated views use approved
  semantic styles and pin all source, renderer, asset, and design-system
  revisions.
- [x] **S03-ARC-06 — Representation-binding contract.** A strict contract
  binds a portable artifact revision to a local or external view, recording
  provider object and revision, adapter and version, mapping profile,
  authority, round-trip fidelity, and last reconciled base. Credentials and
  secrets are prohibited. Project-owned bindings live under
  `design/integrations/<binding-id>.yaml`.
- [x] **S03-ARC-07 — Explicit authority.** Each binding resolves to one
  authoritative side, `local` or a named external provider. Multiple authoring
  surfaces never imply equal authority. A portable baseline cannot bypass a
  stale or unavailable externally authoritative artifact for readiness that
  requires current canonical input.
- [x] **S03-ARC-08 — Synchronization states.** Silver deterministically reports
  `current`, `view-stale`, `external-changed`, `diverged`, `unmapped`,
  `unverified`, and `conflict`. Default `notify` reports state without
  mutation; no state is inferred as pass when provider or revision evidence is
  unavailable.
- [x] **S03-ARC-09 — Three-way comparison.** Synchronization compares the last
  reconciled portable base, current portable revision, and current normalized
  external snapshot. Concurrent changes cannot be reduced to last-write-wins
  or a two-way overwrite.
- [x] **S03-ARC-10 — Normalized change sets.** An adapter emits inspectable,
  schema-valid changes with affected artifact identity and kind, base/local/
  external revisions, semantic classification, proposed operation,
  confidence, mapping fidelity, dependencies, unresolved data, required
  checks, and required approval. External snapshots never mutate canonical
  artifacts during inspection. Generated operation records, snapshots, and
  proposals live under `.silver/results/reconciliation/`.
- [x] **S03-ARC-11 — Semantic change routing.** Reconciliation distinguishes
  presentation-only changes from proposed changes to content, specifications,
  flows, components, assets, and semantic styles. A change to one artifact
  kind never silently updates another; unknown styles or components become
  findings or explicit proposals.
- [x] **S03-ARC-12 — Safe reconciliation apply.** Accepted proposals apply only
  approved operations. Local writes are atomic and guarded by expected
  integrity; external writes require a fresh provider revision and explicit
  permission. Stale proposals, partial extraction, failed validation,
  interruption, or denial leave accepted artifacts and views unchanged.
- [x] **S03-ARC-13 — Adapter contract and Figma package.** A provider-neutral
  adapter contract covers discovery, health, capabilities, versions,
  permissions, supported directions, fidelity, snapshot normalization,
  proposal generation, and apply. The release includes a Figma adapter that
  reads representative variables, styles, components, and selected design
  nodes; preserves semantic names and provider revisions; and prepares one
  narrow, previewable semantic-token write path.
  The required contract namespaces are `silver/provider/v1`,
  `silver/artifact-codec/v1`, `silver/representation-binding/v1`,
  `silver/provider-operation/v1`, `silver/external-snapshot/v1`,
  `silver/change-set/v1`, and `silver/reconciliation-result/v1`.
- [x] **S03-ARC-14 — Provider configuration boundary.** User-global tool
  profiles select provider preferences and permission ceilings. Project
  bindings declare artifact authority, object IDs, mappings, and sync policy.
  Neither location stores credentials, and project policy can tighten but not
  broaden the user's ceiling.
- [x] **S03-ARC-15 — Skill-result and playbook integration.** Skill results
  distinguish core portable completion from optional projection coverage,
  record baseline and external providers actually used, and expose freshness
  or reconciliation blockers in named readiness states. Accepted upstream
  revisions invalidate dependent playbook nodes using the existing visible
  checkpoint behavior.
- [x] **S03-ARC-16 — Independent representation checks.** Separate checks
  validate binding integrity, provider revision pins, generated-view
  provenance, synchronization status, semantic mapping, stale proposals,
  authority, and secret-free configuration. Browser-dependent view checks
  remain separate and report `not-run` when genuinely unavailable.

## Required End-to-End Evidence

- [x] **S03-E2E-01 — Offline portable suite.** The exact packed release
  installs in an empty directory and independently invokes all eighteen Silver
  0.2 skills through their registered baselines without external credentials,
  a hosted service, or a global workflow skill.
- [x] **S03-E2E-02 — Portable formats and local views.** One complete fixture
  produces prose-first portable artifacts, a structured flow, Mermaid and HTML
  flow views, HTML sketches, a runnable local prototype, and an HTML pitch
  view with valid revision and semantic-style evidence.
- [x] **S03-E2E-03 — Local-to-Figma binding.** A portable artifact and local
  view produce a valid Figma binding and provider operation plan with the
  expected base revision, semantic mapping, capability resolution, and
  permission decision. No external write occurs implicitly.
- [x] **S03-E2E-04 — Figma-to-prototype reconciliation.** Starting from a flow
  and Figma design derived from it, a captured later Figma revision is read
  through the real adapter, normalized, and classified. Accepted visual
  changes revise the sketch; accepted behavioral changes create separate flow
  or specification proposals; the regenerated prototype pins only accepted
  revisions.
- [x] **S03-E2E-05 — Concurrent divergence.** A fixture changes both the
  portable artifact and the external design after their shared base. Silver
  reports `diverged` or `conflict`, preserves both sides, blocks stale apply,
  and produces a reviewable reconciliation result without choosing a winner.
- [x] **S03-E2E-06 — Authority reversal.** Equivalent fixtures prove
  local-authoritative and Figma-authoritative bindings. Local authority treats
  Figma edits as proposals; external authority blocks freshness-sensitive
  readiness when the provider cannot be refreshed.

## Required Acceptance Audit

Before declaring `0.3.0` complete, create
`docs/silver-0.3-acceptance-audit.md`. For every `S03-*` criterion it must
record:

- `pass` or `fail`;
- direct paths to implementation and automated tests;
- the exact validation command;
- any optional live-provider result separately from deterministic fixture
  evidence;
- any intentionally degraded or `not-run` optional coverage; and
- confirmation that no live external mutation, stakeholder acceptance,
  production impact, or publication is being inferred.

The release is not complete while any required criterion is unchecked,
failed, supported only by prose, dependent on an unrecorded manual step, or
represented as passing when its required result is `not-run`.

## Explicit Exclusions

The following are not release blockers for `0.3.0`:

- a live Figma account, credentials, or live-provider CI availability;
- pixel-perfect or lossless round-tripping of arbitrary Figma files;
- broad Figma component generation, interactive editing, or library
  publishing beyond the required narrow token-write preview;
- adapters for FigJam, Paper, Canva, Google Slides, PowerPoint, or other
  providers;
- automatic polling, background watchers, scheduled synchronization, or
  silent regeneration;
- a graphical conflict-resolution interface;
- automatic adoption of arbitrary existing repositories;
- organization-foundation inheritance or multi-product synchronization;
- production recipes beyond the existing local baseline;
- automatic commits, pushes, pull requests, publishing, sending, presenting,
  or external writes; and
- stakeholder approval, production deployment, or measured business impact.

A configured user may run a separately authorized live Figma smoke test, but
its result cannot substitute for any deterministic required criterion.

## Release Completion Statement

Silver `0.3.0` may be called complete only when:

> The exact packed release preserves the complete Silver 0.2 blank-workspace
> suite, gives every general skill a registered portable baseline, distinguishes
> canonical artifacts from local and external views, detects representation
> drift through explicit authority and three-way revision comparison, safely
> reconciles Figma-shaped changes into accepted portable revisions without
> silent mutation, and has direct passing evidence for all 22 required
> criteria.
