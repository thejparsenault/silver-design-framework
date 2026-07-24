# Silver 0.2 Release Acceptance

## Release

**Version:** `0.2.0`

**Working name:** Complete Blank-Workspace Suite

**Status:** Complete

This document is the authoritative release boundary for Silver `0.2.0`. The
release is complete only when every criterion marked **required** below has
passing, repository-recorded evidence. Backlog priority labels and partial
implementations do not override this gate.

## Outcome

Starting with an empty folder, a designer can install Silver, establish the
project's design foundations, and use independently runnable agent skills or an
optional resumable playbook to move from evidence and ideas through
specification, flows, sketches, prototypes, evaluation, pitching, and one
production-capable local implementation. The resulting work remains
revision-linked, permission-bounded, design-system-aware, and independently
checkable without requiring a hosted service or external design-tool provider.

## Goal Pass Objective

Use the following objective verbatim for a goal-driven implementation pass:

> Implement Silver `0.2.0`, the Complete Blank-Workspace Suite, exactly as
> specified by `docs/silver-0.2-acceptance.md`. Complete every required
> `S02-ARC-*`, `S02-SKL-*`, and `S02-E2E-*` criterion without substituting
> documentation or mocks for executable behavior. Work from the current
> repository state, preserve project-owned changes, stay within the document's
> explicit exclusions, and update project state as work progresses. Continue
> until the exact packed release candidate passes all required contract, skill,
> playbook, migration, conformance, browser, and end-to-end checks and
> `docs/silver-0.2-acceptance-audit.md` records direct passing evidence for all
> 42 criteria. Do not mark the goal complete while any criterion is unchecked,
> failed, supported only by prose, dependent on an unrecorded manual step, or
> represented as passing when its result is `not-run`. Do not commit, push,
> publish, send, present, or create a pull request unless separately authorized.

## Meaning of Implemented

A required skill or architectural capability is not implemented merely because
it is documented. It must:

1. be included in the packed framework release and installed project-locally
   into a blank workspace;
2. have a versioned machine-readable contract and concise agent instructions;
3. accept and emit the declared artifact kinds with stable IDs and revisions;
4. run independently without requiring a playbook;
5. declare required and optional tool capabilities, permissions, fallbacks,
   completion invariants, review requirements, and possible handoffs;
6. emit a contract-valid skill result separating execution, acceptance, and
   downstream readiness;
7. enforce its non-relaxable and skill-specific guardrails;
8. recommend, but never automatically begin, undeclared follow-up work;
9. include passing positive fixtures and at least one relevant failure,
   degraded-capability, or permission-boundary fixture; and
10. contribute direct evidence to the `0.2.0` acceptance audit.

## Required Architecture

- [x] **S02-ARC-01 — Blank-workspace installation.** `silver setup` installs a
  coherent `0.2.0` workspace, the complete required skill catalog, schemas,
  guardrails, checks, local renderers, reference system, default playbook, and
  discovery pointers from an empty directory.
- [x] **S02-ARC-02 — Skill contract v2.** The v2 contract represents typed
  inputs and outputs, required and optional capabilities, provider fallbacks,
  permissions, completion invariants, quality criteria, unresolved-question
  policy, review requirements, checks, and downstream handoffs. A tested
  migration path exists from the v1 contract.
- [x] **S02-ARC-03 — Skill-result contract.** Every invocation records input
  and output revisions, providers actually used, degraded capabilities,
  execution status, acceptance status, named readiness states, checks,
  unresolved questions, and recommended next actions. `not-run` is never
  represented as a pass.
- [x] **S02-ARC-04 — Working-artifact contracts.** Versioned contracts exist
  for problem frames and findings, concepts and hypotheses, design
  specifications, sketches, evaluations and sanitized observations, component
  proposals, decisions, change cases, presentation views, and implementation
  handoffs. Artifact references pin stable identities and revisions rather than
  duplicating upstream content.
- [x] **S02-ARC-05 — Shared guardrail registry.** Reusable guardrails have
  stable IDs, enforcement type, failure behavior, scope, and relaxability.
  Privacy, authority, provenance, permission, and no-silent-mutation rules are
  non-relaxable. Any permitted design-system relaxation is explicit, scoped,
  and recorded.
- [x] **S02-ARC-06 — Capability and permission resolution.** Effective
  authority remains the intersection of framework, user, organization or
  workspace, artifact-profile, skill, and invocation layers. Missing optional
  providers use declared local fallbacks or produce degraded coverage; they do
  not silently change the task or broaden authority. Provider preferences and
  permission ceilings may live in a user-global tool profile, but workflow
  skills and design context remain project-local.
- [x] **S02-ARC-07 — Playbook contract.** A playbook can compose version-pinned
  leaf skills through typed handoffs, optional and conditional branches,
  readiness conditions, checkpoints, retry or feedback edges, stopping rules,
  and explicitly bounded autonomy.
- [x] **S02-ARC-08 — Resumable state and invalidation.** Another compatible
  agent can resume a playbook from recorded state. Changes to accepted upstream
  revisions visibly invalidate or mark downstream references stale without
  silently rewriting derived work.
- [x] **S02-ARC-09 — Default design-loop playbook.** The release installs a
  recommended, optional synthesis → ideation → selection → specification ↔
  flow/sketch → prototype → evaluation loop. Pitch and implementation are
  explicit branches. Every leaf skill remains directly invokable and the
  playbook pauses at declared human or permission checkpoints.
- [x] **S02-ARC-10 — Safe lifecycle tooling.** Setup, diagnostics, repair,
  package selection, update, and v1-to-v2 migration are idempotent and
  reviewable. Framework-managed, generated, copied-and-owned, and project-owned
  files are distinguished, and ambiguous local changes are never overwritten.
- [x] **S02-ARC-11 — Local baseline capabilities.** The required release path
  works with repository files and bundled local renderers. It provides a
  portable flow view, local sketch and prototype output, a local HTML
  presentation view, and one production-capable static HTML/CSS/minimal
  JavaScript implementation recipe.
- [x] **S02-ARC-12 — Independent checks.** Separate checks cover contract and
  reference integrity, flows and state coverage, semantic-style use, prototype
  policy, evidence and provenance, presentation integrity, production
  readiness, asset integrity, accessibility, responsive behavior, and critical
  interactions.
  Render-dependent checks run against declared local targets in the release
  fixture; genuinely unavailable targets or optional providers report
  `not-run`.
- [x] **S02-ARC-13 — Shared asset model.** A portable, incrementally
  discoverable asset catalog records stable IDs, revisions or integrity hashes,
  authority, provenance, licensing, restrictions, and renditions. Reusable
  project assets, prototype-local experiments, and production projections have
  distinct locations and ownership. Promotion is explicit, and production
  cannot silently consume prototype-local files.
- [x] **S02-ARC-14 — Presentation kit.** A project-owned presentation-kit
  contract supplies semantic presentation roles, editable opportunity,
  proposal, and outcome templates, and reusable presentation components. It
  consumes pinned brand, voice, design-system, and asset revisions without
  becoming a second product UI design system.

## Required Skill Catalog

Foundation skills can be invoked at any point and are not mandatory stages of
the default loop.

- [x] **S02-SKL-01 — `brand`.** Define or revise audience-facing brand
  foundations and propose explicitly approved downstream visual changes.
- [x] **S02-SKL-02 — `product`.** Define or revise audience, jobs, desired
  outcomes, constraints, and product-specific positioning.
- [x] **S02-SKL-03 — `voice`.** Define or revise tone, voice, terminology, and
  context-specific content guidance.
- [x] **S02-SKL-04 — `principles`.** Create or maintain concrete design
  decision principles with examples and usable decision tests.
- [x] **S02-SKL-05 — `theme`.** Generate, compare, apply, or revise semantic
  themes, modes, and mappings without silently introducing raw or unapproved
  styles.
- [x] **S02-SKL-06 — `system`.** Define or maintain semantic tokens, color
  ramps, typography roles, modes, component and pattern registries,
  documentation projections, deprecations, and migration proposals. Canonical
  changes require the applicable approval and are recorded with normal design
  decisions.
- [x] **S02-SKL-07 — `research`.** Define research questions and methods,
  participant criteria, scripts, evidence handling, and sanitized observation
  plans. It must not imply that research was conducted when it was only
  planned.

The core loop and its cross-cutting branches consist of:

- [x] **S02-SKL-08 — `synthesize`.** Convert sanitized evidence, feedback,
  analytics, briefs, and labeled assumptions into findings, problem frames,
  opportunities, contradictions, and open questions with provenance.
- [x] **S02-SKL-09 — `ideate`.** Generate meaningfully distinct concepts and
  testable hypotheses grounded in the current frame and canonical constraints,
  then support an explicit selection checkpoint.
- [x] **S02-SKL-10 — `specify`.** Create or revise a living design
  specification covering outcomes, hypothesis, scope and non-goals,
  requirements, content and data, states, edge cases, accessibility, success
  criteria, linked revisions, decisions, and open questions.
- [x] **S02-SKL-11 — `flow`.** Create, revise, validate, and render portable
  user, interaction, and component-behavior graphs with stable identities,
  state coverage, and revision-aware derived references.
- [x] **S02-SKL-12 — `sketch`.** Generate inexpensive alternatives from a
  brief, concept, specification, flow, or existing screen; record fidelity
  independently from artifact type and honor the active constraint profile.
- [x] **S02-SKL-13 — `component`.** Inspect the catalog, enumerate required
  states, explore anatomy and behavior, distinguish product compositions from
  reusable patterns or primitives, propose a contract, and document
  accessibility.
- [x] **S02-SKL-14 — `prototype`.** Create a testable simulation for a declared
  question, use constrained styles by default, require explicit partial or
  suspended profiles, pin inputs, and revise from explicitly accepted findings
  with traceability and re-checks.
- [x] **S02-SKL-15 — `evaluate`.** Define an evaluation question and method,
  prepare tasks, inspect a sketch or prototype, capture sanitized observations,
  separate observation from interpretation, and produce findings and
  recommendations without confusing product judgment with deterministic
  conformance.
- [x] **S02-SKL-16 — `pitch`.** Produce an evidence-linked opportunity,
  proposal, or outcome change case and an optional branded presentation view
  using the project presentation kit. Estimated, proxy, and measured impact
  remain clearly distinguished; publishing or presenting externally requires
  separate permission.
- [x] **S02-SKL-17 — `implement`.** Assess readiness and rebuild accepted
  design intent into the release's local production recipe under production
  policy. Prototype code is reference material by default; missing intent
  produces findings instead of invented requirements.
- [x] **S02-SKL-18 — `design-check`.** Discover applicable independent checks,
  run only those needed for the declared target and policy, preserve individual
  results, and summarize coverage without turning failed or unexecuted checks
  into design work.

`prototype` owns feedback-driven prototype refinement; it is not a separate
required skill. Presentation-kit maintenance remains part of `pitch` for this
release unless implementation demonstrates a distinct recurring authority
boundary that justifies a separate skill.

## Required End-to-End Evidence

- [x] **S02-E2E-01 — Empty-folder setup.** An isolated empty directory can
  install the packed `0.2.0` candidate with no manual copying or global workflow
  skill installation.
- [x] **S02-E2E-02 — Independent invocation.** Every required skill can be
  discovered and invoked independently against its smallest valid fixture,
  produces a valid result record, and recommends rather than starts follow-up
  work.
- [x] **S02-E2E-03 — Complete design loop.** One fixture proceeds from
  foundation definition and sanitized seed evidence through synthesis,
  ideation, human selection, specification, flow, sketch, constrained
  prototype, evaluation, accepted refinement, and re-evaluation.
- [x] **S02-E2E-04 — Resume and change handling.** The default playbook pauses
  at a checkpoint, resumes in a fresh compatible agent session, detects a
  changed upstream revision, and requires visible reconciliation of invalidated
  downstream work.
- [x] **S02-E2E-05 — Pitch branch.** Accepted evidence and design artifacts
  generate a valid change case, portable outline, and branded local HTML
  presentation with pinned source and presentation-kit revisions.
- [x] **S02-E2E-06 — Implementation branch.** Accepted design intent generates
  a reviewable production implementation in the bundled local recipe; semantic,
  policy, browser, accessibility, responsive, and interaction checks pass.
- [x] **S02-E2E-07 — Guardrail failures.** Negative fixtures prove that raw
  visual values, fabricated or untraceable evidence, implicit constraint
  suspension, stale revisions, unauthorized canonical or external writes,
  incomplete production readiness, and unavailable required targets cannot be
  reported as passing.
- [x] **S02-E2E-08 — Optional-provider degradation.** The complete local loop
  succeeds without Figma, Canva, Slides, browser MCP, hosted accounts, or other
  external providers while clearly reporting any provider-specific views or
  inspections as degraded or `not-run`.
- [x] **S02-E2E-09 — Update and ownership.** Re-running setup is idempotent, a
  v1 workspace can preview and apply the supported migration, and an update
  preserves project-owned work while surfacing conflicts in edited managed
  files.
- [x] **S02-E2E-10 — Packed release smoke.** The exact publishable archive is
  installed in isolation and passes contract validation, all fast checks,
  browser checks, skill fixtures, playbook fixtures, migration fixtures, and
  the complete blank-workspace scenario.

## Required Acceptance Audit

Before declaring `0.2.0` complete, create
`docs/silver-0.2-acceptance-audit.md`. For every `S02-*` criterion it must
record:

- `pass` or `fail`;
- direct paths to implementation and automated tests;
- the exact validation command;
- any intentionally degraded optional-provider coverage; and
- no unsupported assertion of stakeholder acceptance, research completion,
  production impact, or external publication.

The release is not complete while any required criterion is unchecked, failed,
supported only by prose, or dependent on an unrecorded manual step.

## Explicit Exclusions

The following are not release blockers for `0.2.0`:

- automatic adoption of arbitrary existing repositories;
- organization-foundation inheritance and multi-product impact analysis;
- live read/write or round-trip adapters for Figma, FigJam, Paper, Canva,
  Google Slides, PowerPoint, or other external providers;
- production recipes beyond the bundled local baseline;
- broad framework, native-platform, and styling-adapter coverage;
- automated participant recruitment, recording, transcription, or ingestion of
  sensitive raw research;
- automatic commits, pushes, pull requests, publishing, sending, or presenting;
- stakeholder approval, actual production deployment, or measured business
  impact;
- hosted services, telemetry, accounts, marketplaces, package signing, or
  community extension infrastructure.

These exclusions may be implemented early, but doing so cannot substitute for
an unmet required criterion.

## Release Completion Statement

Silver `0.2.0` may be called complete only when:

> From an empty folder, the packed release installs the complete project-local
> skill suite and supports both independent skill execution and a resumable,
> guarded evidence-to-implementation design loop using local baseline
> capabilities; every required criterion in this document has passing,
> repository-recorded evidence, and all automated release checks pass.
