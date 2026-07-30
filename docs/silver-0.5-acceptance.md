# Silver 0.5 Traceable Practice and Context acceptance

**Version:** `0.5.0`

## Goal

Make Silver approachable through chat while preserving a designer's improving
personal practice, manually linked institutional guidance, exact multi-system
design context, universal artifact provenance, and native repository authority.

## Required criteria

- [x] **S05-SETUP-01 — Reviewable setup plan.** `setup inspect` produces a
  revisioned, state-locked plan with discovered state, unresolved questions,
  topology recommendation and rationale, intended writes, Git actions,
  guidance links, codebase bindings, design contexts, and external actions.
  `setup apply` performs only that reviewed plan.
- [x] **S05-SETUP-02 — Topology recommendation.** Multiple codebases, separate
  discipline ownership or access, and independent design history recommend a
  separate design repository. One codebase with a solo or small shared team
  recommends integration. The recommendation is displayed and never silently
  chosen.
- [x] **S05-SETUP-03 — Safe application.** Apply rejects changed inspected
  state, preserves conflicts, is idempotent, initializes local Git for a
  separate repository, and emits agent-mediated GitHub actions without
  creating or pushing a remote.
- [x] **S05-PRACTICE-01 — Visible personal practice.** My Practice defaults to
  `~/Silver/My Practice`, contains readable methods, playbooks, rubrics, and
  decisions, initializes local Git, and distinguishes local history from
  verified remote backup.
- [x] **S05-PRACTICE-02 — Reviewed improvement.** `practice-review` creates a
  sanitized proposal from accepted work. `practice apply` verifies the
  expected revision, changes only My Practice after approval, records the
  reason, and creates an isolated local commit. Product work records practice
  identity, revision, and method IDs without private paths.
- [x] **S05-GUIDANCE-01 — Manual linking.** Local and Git guidance sources are
  activated only through explicit linking, select reviewed paths, declare
  scope and reference/preferred/required influence, and record exact revision
  and integrity.
- [x] **S05-GUIDANCE-02 — Freshness without semantic sync.** Read-only
  inspection reports availability and drift. Changed sources create reviewable
  re-pin proposals and stale-dependent evidence without silently applying
  semantic changes.
- [x] **S05-CONTEXT-01 — Revisioned design contexts.** A strict contract
  composes brand/product, design system, shared component catalog, expression
  mapping, optional assets and presentation kit, surfaces, and codebase.
- [x] **S05-CONTEXT-02 — Multi-context resolution.** One component catalog may
  participate in multiple contexts. Product/surface defaults resolve
  unambiguous matches, explicit overrides win, ambiguity requires a choice,
  and incompatible expression mappings fail.
- [x] **S05-MAP-01 — Portable map skill.** `map` validates and renders journey
  maps, service blueprints, experience maps, and ecosystem/stakeholder maps.
  Journeys require actor/stage/touchpoint structure; service blueprints require
  customer, frontstage, backstage, support, and system lanes.
- [x] **S05-MAP-02 — Contextual map handoff.** Maps pin exact design contexts,
  render semantic local HTML, label evidence and assumptions, and can hand off
  to synthesis, ideation, specification, evaluation, pitch, and implementation
  planning.
- [x] **S05-PROV-01 — Universal provenance.** Every new durable artifact can
  record stable revision, origin, contributors, source revisions, practice
  methods, guidance, design contexts, change/supersession, acceptance, and
  external bindings without private reasoning, secrets, or unsanitized data.
- [x] **S05-PROV-02 — Trace and correction.** `silver trace` accepts an
  artifact ID or safe workspace path and writes a readable trace view.
  Corrections use superseding revisions and never rewrite audit history.
- [x] **S05-EFFECT-01 — Native repository authority.** Skill contract v2
  declares effects instead of an active Silver repository permission
  intersection. Environment and repository authority govern operations;
  undeclared observed effects create findings.
- [x] **S05-EFFECT-02 — Hard protections.** Path escape, destructive
  ambiguity, stale overwrite, secret exposure, fabricated evidence, silent
  mutation, and misleading acceptance/readiness remain blocked.
- [x] **S05-GIT-01 — Isolated local checkpoints.** Acceptance, implementation
  handoff, material workspace/context/guidance changes, and approved practice
  changes create commits containing only owned paths. Overlap pauses safely,
  unrelated work is preserved, and no push is automatic.
- [x] **S05-MIG-01 — Reviewable 0.4 migration.** Migration upgrades manifests,
  skills/results, lock, contexts, provenance, and effects; generates a default
  context; preserves edited inactive permission files; and registers legacy
  artifacts by exact integrity without rewriting them.
- [x] **S05-SYNC-01 — Preserved 0.3 boundary.** Representation bindings,
  seven-state drift, three-way reconciliation, stale-apply protection, and the
  narrow Figma semantic-token write path do not regress.
- [x] **S05-SYNC-02 — Explicit deferral.** No artifact-specific push/pull
  commands or generalized bidirectional synchronization are introduced. The
  P1 backlog defines one reconcile skill, generic sync commands, domain
  routing, broader providers, impact reporting, conflicts, recovery, and
  deterministic fixtures.
- [x] **S05-E2E-01 — Offline vertical slice.** A blank workspace installs all
  twenty-one skills and demonstrates map to presentation or implementation
  handoff to QA with exact practice, guidance, context, source, external-view,
  and checkpoint provenance.
- [x] **S05-PACK-01 — Exact package evidence.** The exact packed archive
  installs offline, performs guided setup and migration, runs the vertical
  slice, and passes deterministic release smoke tests without live
  credentials.

## Release gates

Silver `0.5.0` is complete when both commands pass:

```sh
npm run build
npm run test:package
```
