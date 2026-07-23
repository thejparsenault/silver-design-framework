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

- [ ] Implement a blank-workspace installer fixture
  - type: build
  - priority: high
  - context: small
  - notes: Exact-output setup, idempotence, project-edit preservation, refusal of inferred existing-codebase adoption, deterministic index generation, and read-only doctor checks now pass. Still install selected project skills/checks, agent pointers, the editable reference system, and repair behavior.

- [ ] Implement first task-level skills
  - type: build
  - priority: high
  - context: medium
  - notes: Initial set: `brand`, `theme`, `prototype`, and `design-check`. Internal scripts live with the skill that owns them.

- [ ] Validate the first vertical slice
  - type: test
  - priority: high
  - context: medium
  - notes: Blank folder → setup → brand/theme refinement → constrained static prototype → static conformance result → recommended next actions.

- [ ] Prepare a private prerelease
  - type: release
  - priority: medium
  - context: small
  - notes: Publish only after fixture tests pass. Pin exact version in generated lock state.

## Next Milestone

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
