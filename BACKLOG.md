# Backlog

This backlog contains functionality intentionally excluded from the first blank-workspace iteration. Priorities describe recommended sequencing, not commitments or mandatory workflow stages.

## P1 — Existing Codebase Adoption

- [ ] Repository discovery
  - Detect languages, frameworks, package managers, source roots, component libraries, token/style locations, build commands, preview commands, tests, and agent instruction files.

- [ ] Existing artifact mapping
  - Map semantically clear brand, product, voice, design-system, research, and decision documents without forcing file moves.

- [ ] Adoption ambiguity report
  - Identify conflicting sources of truth, oversized omnibus docs, raw-value usage, undocumented components, missing render targets, and unknown authority.

- [ ] Reviewable adoption plan
  - Preview every file addition or pointer modification before changing the repository.

- [ ] Native design-system mapping
  - Map existing token names, CSS variables, utilities, and components to canonical logical roles without renaming them.

- [ ] Agent-file integration
  - Safely merge concise framework pointers into `AGENTS.md`, `CLAUDE.md`, or supported equivalents while preserving project-owned instructions.

- [ ] Existing-repository fixture matrix
  - Validate adoption against plain HTML/CSS, Tailwind, React, and at least one non-React repository.

## P1 — Safe Updates and Ownership

- [ ] Three-way framework updates
  - Compare installed base, local edits, and new release; never overwrite ambiguous project-owned changes.

- [ ] File ownership and customization metadata
  - Distinguish generated, framework-managed, copied-and-owned, and fully project-owned files.

- [ ] Schema migrations
  - Version and test forward migrations with dry-run and rollback guidance.

- [ ] Package selection changes
  - Add or remove project skills, checks, recipes, and adapters without disturbing unrelated files.

- [ ] Offline or cached updates
  - Support pinned local release bundles for restricted environments.

- [ ] Update policy controls
  - Allow notify-only, explicit update, and organization-pinned channels; never auto-apply.

## P1 — Browser and Accessibility Enforcement

- [ ] Render-target contract
  - Declare start command, URL/route, fixture state, viewports, authentication setup, and expected coverage.

- [ ] Deterministic browser runner
  - Add Playwright as the default CI adapter without requiring it as the only interactive provider.

- [ ] Accessibility checks
  - Contrast, accessible names, keyboard use, focus order/visibility, semantic landmarks, and selected automated WCAG checks.

- [ ] Responsive checks
  - Overflow, clipping, target sizes, breakpoint behavior, content reflow, and declared viewport coverage.

- [ ] Interaction checks
  - Component states, form behavior, error handling, dialogs, menus, navigation, and critical product flows.

- [ ] Visual regression adapter
  - Optional screenshot baselines with clear ownership and update review.

- [ ] Coverage policy maturity
  - Adoption warnings, required-target enforcement, and production blocking profiles.

## P1 — Organization and Multi-Product Foundations

- [ ] Foundation manifest and package format
  - Publish protected brand/accessibility/semantic-schema assets and optional shared packs.

- [ ] Explicit inheritance resolver
  - Pin organization-foundation versions and resolve product overlays without symlinks.

- [ ] Protected and overridable fields
  - Let organizations protect core constraints while products own audience, tone, token values, compositions, and integrations.

- [ ] Exception records
  - Record deliberate protected overrides with scope and rationale.

- [ ] Multi-codebase product bindings
  - Connect one product workspace to separate web, mobile, service, or marketing repositories.

- [ ] Shared-change impact report
  - Show which products and bindings are affected by a proposed foundation update.

## P2 — External Design Tools

- [ ] Provider adapter contract
  - Standardize capability declarations, discovery, version support, and provider-specific configuration.

- [ ] Figma read adapter
  - Extract variables, styles, components, semantic names, and revision metadata.

- [ ] Figma write adapter
  - Push validated tokens or components with explicit external-write approval.

- [ ] Multiple Figma provider profiles
  - Support different MCP providers optimized for library generation, semantic extraction, or interactive editing.

- [ ] Text-based design-tool adapter
  - Evaluate local tools with text-based files and MCP support for wireframing and agent-friendly round trips.

- [ ] Paper and other design-tool research
  - Document support, performance, token use, flexibility, and task suitability before choosing adapters.

- [ ] Sync and reconciliation UI
  - Compare local and external revisions, resolve conflicts, and preserve authority by artifact kind.

- [ ] Scheduled freshness checks
  - Notify or propose updates without silently applying them.

## P2 — Skills for the Design Practice

- [ ] Product definition
  - Clarify audience, jobs, outcomes, constraints, and product-specific tone.

- [ ] Ideation
  - Generate screen, flow, and interaction alternatives grounded in canonical artifacts.

- [ ] Component design
  - Inspect catalog, enumerate states, explore anatomy, prototype behavior, propose contracts, and document accessibility.

- [ ] Flow and state enumeration
  - Identify loading, empty, error, success, permission, offline, and edge-case states.

- [ ] Research planning
  - Create questions, methods, participant criteria, scripts, and sanitized evidence plans.

- [ ] Testing session support
  - Prepare tasks, capture sanitized observations, synthesize findings, and recommend revisions.

- [ ] Feedback-to-prototype refinement
  - Extend the prototype skill with structured accepted-finding selection, change traceability, and re-checks.

- [ ] Tone and voice
  - Define or refine voice, content patterns, terminology, and product-specific overlays.

- [ ] Design principles
  - Facilitate creation and maintenance of usable decision principles rather than generic values.

- [ ] Production implementation
  - Implement accepted screens and components in a codebase binding under production policy.

- [ ] Promotion
  - Rebuild accepted prototype concepts against production contracts and prepare a reviewable change set.

- [ ] Pull request support
  - Run checks, summarize design decisions, prepare evidence, and create a PR only with explicit approval.

- [ ] Repository readiness and synchronization
  - Inspect branch and working-tree state, fetch or pull only when explicitly requested, surface conflicts, and ensure design work starts from the intended revision.

- [ ] CI integration setup
  - Install selected deterministic checks into the repository's existing CI provider without coupling check logic to that provider.

## P2 — Design-System Operations

- [ ] Token authoring and migration
  - Propose semantic roles, component tokens, modes, schemes, themes, and mappings with explicit approval.

- [ ] Color-ramp generation
  - Generate and validate accessible ramps from accepted brand colors.

- [ ] Typography system generation
  - Establish role-based type scales and platform mappings.

- [ ] Component registry and catalog
  - Discover primitives, approved patterns, variants, states, ownership, and implementation locations.

- [ ] Component proposal workflow
  - Distinguish new product composition, approved pattern, and system primitive; detect competing concepts.

- [ ] Decision integration
  - Record accepted design-system changes in the normal decision log without per-value approval files.

- [ ] Documentation generation
  - Produce compact human, agent, and catalog views from canonical contracts.

- [ ] Deprecation and migration
  - Mark retired tokens/components, suggest replacements, and check remaining use.

## P2 — Implementation Recipes and Adapters

- [ ] Static HTML/CSS recipe
  - Harden the default reference/prototype path with minimal JavaScript and zero app-framework assumptions.

- [ ] Astro recipe
  - Marketing, content, documentation, and static product surfaces.

- [ ] React Router recipe
  - Interactive SPA and framework-mode web application prototypes.

- [ ] Next.js recipe
  - Full-stack applications after a requirements check justifies the server architecture.

- [ ] Expo recipe
  - Mobile prototypes and future production bindings.

- [ ] Tailwind adapter
  - Generate semantic utilities/theme namespaces and lint primitive or arbitrary visual values.

- [ ] CSS Modules and CSS-in-JS adapters
  - Map semantic roles without making either styling model canonical.

- [ ] Vue, Svelte, and Web Component adapters
  - Add only after the framework contracts prove neutral in existing-codebase adoption.

- [ ] Native platform token adapters
  - SwiftUI, Android/Compose, and React Native outputs.

- [ ] Recipe compatibility and upgrade matrix
  - Test supported versions and prevent skills from changing stacks due to fashion.

## P2 — Research, Privacy, and Evidence

- [ ] Sensitive-material scanner
  - Warn about credentials, participant PII, raw transcripts, recordings, and sensitive datasets before commit.

- [ ] Sanitized research schemas
  - Standardize findings, evidence references, confidence, recommendations, and decision links.

- [ ] External research repository references
  - Reference approved systems without copying credentials or sensitive data.

- [ ] Evidence traceability
  - Connect accepted design changes back to findings and testing sessions.

- [ ] Retention and deletion guidance
  - Recommend handling for raw and sanitized research without imposing one compliance regime.

## P3 — Ecosystem and Governance

- [ ] Additional agent wrappers
  - Add and fixture-test discovery wrappers for Codex, Claude, and other supported agents without duplicating skill logic.

- [ ] Organization skill/check packs
  - Curated bundles with stricter policies and approved providers.

- [ ] Community package registry
  - Discover optional skills, checks, recipes, and adapters with compatibility and trust metadata.

- [ ] Package signing and trust policy
  - Verify provenance, checksums, publisher identity, and allowed sources.

- [ ] Extension authoring kit
  - Schemas, templates, fixtures, and conformance tests for third-party packages.

- [ ] Framework telemetry
  - Consider only opt-in, privacy-preserving local diagnostics after core workflows are stable.

- [ ] Hosted dashboard
  - Defer unless local manifests and reports prove insufficient for multi-product visibility.

## P3 — Advanced Validation

- [ ] Design drift reports across products
  - Compare semantic roles, primitives, patterns, and exceptions without assuming identical implementations.

- [ ] Behavioral contract testing
  - Reusable state-machine or interaction contracts across framework adapters.

- [ ] Token provenance analysis
  - Combine static source inspection, build transforms, and computed browser output.

- [ ] Cross-platform parity checks
  - Compare web, iOS, and Android mappings at the semantic-role level.

- [ ] Performance budgets
  - Bundle size, CSS size, runtime behavior, image weight, and rendering performance.

- [ ] Localization and content resilience
  - Long text, bidirectionality, pluralization, date/number formats, and pseudo-localization.

## Parking Lot

- Hosted collaborative service.
- No-code visual editor.
- Full enterprise component library.
- General-purpose design-file version control.
- Automatic lifecycle enforcement.
- Silent production code generation or external synchronization.
