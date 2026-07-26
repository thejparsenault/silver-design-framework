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

## Following Milestone — Existing Codebase Adoption

- [ ] Adopt one representative existing product repository
  - type: build
  - priority: high
  - context: medium
  - notes: Discover existing docs, tokens, components, source roots, commands, and agent files without reorganizing the repository or silently rewriting production code.

- [ ] Generate an adoption report and reviewable installation diff
  - type: build
  - priority: high
  - context: medium
  - notes: Map semantically clear existing artifacts, identify ambiguities, and recommend operational summaries for oversized omnibus documents.

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
