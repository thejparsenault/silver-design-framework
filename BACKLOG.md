# Backlog

This backlog contains functionality intentionally excluded from the first blank-workspace iteration. Priorities describe recommended sequencing, not commitments or mandatory workflow stages.

Silver `0.2.0` completed the blank-workspace skill suite and local baseline.
Silver `0.3.0` completed portable-provider registration, representation
bindings, three-way reconciliation, and the first Figma adapter.
Silver `0.4.0` added the project-local `what-now` orientation skill and
contract-bounded ranked recommendations.
Silver `0.5.0` added traceable personal practice, guided repository topology,
linked guidance, multi-context design work, portable maps, provenance, effects,
and local Git checkpoints.
`docs/silver-0.5-acceptance-audit.md` records the latest direct passing
evidence. External-source synchronization and deep existing-codebase adoption
are the next recommended milestones.

## P1 — External Sources and Synchronization

- [ ] One reconcile skill
  - Inspect source drift, explain semantic differences, select accepted
    operations, and route each change to the owning domain skill.

- [ ] Generic deterministic sync commands
  - Add `silver sync status [binding|--all]`,
    `silver sync inspect <binding> --direction
    <external-to-local|local-to-external> --json`, and
    `silver sync apply <proposal.json> --json`.

- [ ] Chat-first reconciliation language
  - Let designers say “check Figma for component changes” or “publish the
    accepted token update” while the agent selects the generic command,
    provider, direction, and domain skill.

- [ ] Artifact-kind routing
  - Route tokens and themes to `theme`/`system`, components and patterns to
    `component`/`system`, decisions and guidance to their owning skill plus a
    decision record, maps and flows to `map`/`flow`, and prototypes and
    presentations to their owning skills and representation bindings.

- [ ] Broader Figma coverage
  - Add component, library, token, style, map, flow, and presentation reads and
    writes without regressing the existing narrow semantic-token write path.

- [ ] Git and local-repository adapters
  - Support revisioned design-system, component-library, guidance, and decision
    sources before adding arbitrary cloud-document providers.

- [ ] Multi-context impact reports
  - Show every affected product, brand, surface, design context, and codebase
    when a shared catalog or system changes.

- [ ] Robust batch application
  - Support batch proposal review, partial acceptance, conflicts,
    stale-proposal rejection, rollback evidence, and interrupted-apply
    recovery.

- [ ] Readable reconciliation summaries
  - Provide concise chat summaries with deterministic technical change sets on
    demand.

- [ ] Provider fixtures and optional live tests
  - Keep deterministic gates credential-free and add opt-in live integration
    evidence.

- [ ] Later collaboration and document adapters
  - Add document and collaboration providers only after snapshot, privacy, and
    authority policies are established.

## P1 — Portable Tools and Reconciliation — Silver 0.3

- [x] Registered bundled-provider packages
  - Replace hard-coded local capability knowledge with installed, versioned providers that declare capabilities, availability, permissions, scripts, artifact kinds, and fidelity.

- [x] Portable format profiles and local views
  - Separate canonical serialization from generated views; support prose-first Markdown, structured JSON/YAML, DTCG JSON, semantic HTML visual views, and Mermaid plus HTML flow projections.

- [x] Representation bindings and authority
  - Pin portable, local, and external revisions with one declared authority, adapter metadata, mapping profile, round-trip fidelity, and a secret-free provider boundary.

- [x] Synchronization and three-way reconciliation
  - Detect normalized drift states, compare shared base/local/external revisions, route semantic changes by artifact kind, and stage reviewable proposals without mutation.

- [x] Safe reconciliation apply
  - Apply only accepted operations with fresh revisions, expected integrity, atomic local writes, external permission checks, and failure-safe preservation.

- [x] First Figma adapter
  - Read variables, styles, components, semantic names, revisions, and selected design nodes; add one narrow previewable semantic-token write path; test the real transformation behavior through captured provider-shaped fixtures.

- [x] Portable provider and reconciliation checks
  - Independently validate bindings, pins, authority, mappings, sync state, proposals, view provenance, stale applies, and secret-free configuration.

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

## P1 — Agent Host Reach

- [ ] Node-free durable-output path
  - Let a skill produce a provenance-carrying artifact using plain file operations, with the guarded Node runtime as an optional upgrade rather than the only route.
  - Prerequisite for any host that cannot run a Silver installation against the workspace. Revisits the invocation contract 0.5 and 0.6 are built on.

- [ ] Uploadable Silver skill package for Claude Cowork
  - One ZIP that teaches the workspace model and points at `design/manifest.yaml`, `AGENTS.md`, and `.skills/<id>/SKILL.md` as files to read.
  - Depends on the Node-free output path; without it a Cowork session can read and edit artifacts but cannot record a checked result.

- [ ] Standalone binary distribution
  - Drops the Git + Node + `npm install` prerequisite chain for a designer audience.
  - Blocked on a payload layer that serves 254 embedded files and 42 schemas without `readdir` over real directories, keeping `treeIntegrity` behaviour identical, plus an audit of 28 modules whose CLI main-guard collapses under bundling. Spike recorded in `DECISIONS.md`.

## P1 — Agentic Skill Composition

- [x] Skill contract v2
  - Add typed input artifacts, required versus optional capabilities, provider fallbacks, completion invariants, quality criteria, unresolved-question policy, review requirements, and downstream handoffs.
  - Preserve strict versioned boundaries and provide an explicit migration path from the v1 skill contract.

- [x] Skill-result contract
  - Report execution, acceptance, and named downstream-readiness states independently.
  - Record input and output revisions, actual providers used, degraded capabilities, checks, unresolved questions, and recommended next actions without treating `not-run` as pass.

- [x] Shared guardrail registry
  - Give reusable guardrails stable IDs, enforcement types, failure behavior, scope, and explicit relaxability metadata.
  - Keep privacy, authority, provenance, permission, and no-silent-mutation rules non-relaxable while permitting recorded prototype-only exceptions where policy allows.

- [x] Playbook contract
  - Define optional skill graphs with pinned compatible versions, typed artifact handoffs, branches, parallel work, readiness conditions, checkpoints, retries, stopping conditions, and allowed autonomy.
  - Let explicit playbook invocation authorize declared safe local progression without broadening canonical, external, production, destructive, or version-control permissions.

- [x] Resumable playbook state
  - Record completed nodes, accepted outputs, current artifact revisions, pending checkpoints, and invalidated downstream work so another compatible agent can safely resume.

- [x] Default design-loop playbook
  - Provide a recommended synthesis → ideation → selection → specification ↔ flow/sketch → prototype → evaluation loop while allowing optional steps, reordering, and direct task invocation.
  - Keep production implementation and pitching as explicit cross-cutting branches rather than automatic terminal stages.

- [x] Composition fixtures and conformance tests
  - Test independent skill invocation, multi-step handoff, branching, skipped optional tools, human checkpoints, stale input revisions, feedback loops, resumption, and permission boundaries.

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

- [x] Provider adapter contract
  - Standardize capability declarations, discovery, version support, and provider-specific configuration.
  - Promoted to Silver 0.3 under `S03-ARC-13`.

- [x] Figma read adapter
  - Extract variables, styles, components, semantic names, and revision metadata.
  - Promoted to Silver 0.3 under `S03-ARC-13`.

- [ ] Figma write adapter
  - Push validated tokens or components with explicit external-write approval.
  - A narrow semantic-token write path is promoted to Silver 0.3; broader component and library writes remain here.

- [ ] Flow canvas round-trip adapters
  - Render and reconcile portable flow artifacts with Figma, FigJam, Paper, and text-based local design tools while preserving stable node identities and explicit authority.

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

- [x] Product definition
  - Clarify audience, jobs, outcomes, constraints, and product-specific tone.

- [x] Synthesis and problem framing
  - Turn sanitized research, feedback, analytics, briefs, existing artifacts, and explicitly labeled assumptions into findings, problem frames, opportunities, contradictions, and open questions.
  - Preserve evidence references and never silently rewrite canonical product or design guidance.

- [x] Ideation
  - Generate meaningfully different concept candidates and testable hypotheses grounded in the problem frame and canonical constraints.
  - Keep candidates lightweight, support an explicit human or policy-driven selection checkpoint, and avoid producing full specifications for every idea.

- [x] Design specification
  - Create and revise a living contract for a selected direction, including outcomes, hypothesis, scope and non-goals, requirements, content and data needs, states, edge cases, accessibility, linked artifact revisions, success criteria, and open questions.
  - Allow flows, sketches, prototypes, and evaluations to refine the specification without silently overwriting accepted decisions.

- [x] Sketch
  - Generate inexpensive, usually noninteractive alternatives for exploration or review from a brief, concept, specification, flow, or existing screen.
  - Record fidelity independently from artifact type, use active brand and design-system constraints by default, and support optional design-tool or local renderers.

- [x] Component design
  - Inspect catalog, enumerate states, explore anatomy, prototype behavior, propose contracts, and document accessibility.

- [ ] Advanced flow and state coverage
  - Extend the first flow contract with reusable state libraries, loading, empty, error, success, permission, offline, concurrency, recovery, and cross-channel edge cases.

- [x] Research planning
  - Create questions, methods, participant criteria, scripts, and sanitized evidence plans.

- [x] Evaluation
  - Define the question and method, prepare tasks, inspect sketches or prototypes, capture sanitized observations, distinguish observation from interpretation, and produce findings and recommendations.
  - Keep subjective product evaluation separate from deterministic design conformance checks.

- [x] Feedback-to-prototype refinement
  - Extend the prototype skill with structured accepted-finding selection, change traceability, and re-checks.

- [x] Tone and voice
  - Define or refine voice, content patterns, terminology, and product-specific overlays.

- [x] Design principles
  - Facilitate creation and maintenance of usable decision principles rather than generic values.

- [x] Production implementation
  - Assess readiness and implement accepted specifications, flows, sketches, prototypes, component contracts, or evaluation findings in a codebase binding under production policy.
  - Treat prototype code as reference by default and report insufficient design intent rather than inventing requirements.

- [ ] Promotion
  - Rebuild accepted prototype concepts against production contracts and prepare a reviewable change set.

- [ ] Pull request support
  - Run checks, summarize design decisions, prepare evidence, and create a PR only with explicit approval.

- [ ] Repository readiness and synchronization
  - Inspect branch and working-tree state, fetch or pull only when explicitly requested, surface conflicts, and ensure design work starts from the intended revision.

- [ ] CI integration setup
  - Install selected deterministic checks into the repository's existing CI provider without coupling check logic to that provider.

## P2 — Pitch and Presentations

- [x] Portable change-case contract
  - Define a revisioned, evidence-linked artifact with opportunity, proposal, and outcome modes.
  - Record audience, requested decision, before state, findings, proposed or actual post state, estimated, proxy, or measured impact, confidence, timeframe, tradeoffs, risks, alternatives, contradictions, and explicit ask.

- [x] Pitch skill
  - Build a decision-ready change case from accepted design and evidence artifacts at any useful point in the design loop.
  - Keep successful generation separate from stakeholder acceptance and require explicit permission before publishing, sending, or presenting externally.

- [x] Presentation-kit contract
  - Define a project-owned catalog for presentation guidelines, semantic presentation roles, templates, and reusable presentation components without mixing them into the product UI component catalog.
  - Allow organization-level kits and product overlays through the normal pinned inheritance model.

- [x] Starter presentation templates and components
  - Provide editable opportunity, proposal, and outcome templates plus title, section, before/after, finding, metric, evidence, comparison, annotated-screen, flow, recommendation, decision, and appendix patterns.
  - Use canonical brand, voice, semantic design tokens, and approved asset IDs rather than raw presentation styles or copied untracked media.

- [x] Portable presentation outline and local renderer
  - Render a change case through a template and component set into a provider-neutral deck structure and a reviewable local HTML baseline.
  - Pin change-case, template, component, asset, brand, voice, and design-system revisions in generated output metadata.

- [ ] Presentation provider adapters
  - Support PowerPoint, Google Slides, Figma Slides, Canva, PDF, and other providers through capability-based adapters, beginning only after the portable case and local renderer are stable.
  - Treat externally edited composition according to declared artifact authority without allowing it to silently rewrite evidence or canonical presentation resources.

- [ ] Presentation pattern promotion
  - Keep one-off deck compositions local to their output and require an explicit proposal and review before adding a reusable template or component.
  - Consider a dedicated `presentation-kit` skill only after maintenance proves to be a frequent task with distinct authority and completion needs.

- [x] Independent presentation checks
  - Check brand and semantic-style conformance, evidence integrity, estimated-versus-measured labeling, pinned revisions, overflow, clipping, readable type size, contrast, color-independent chart meaning, stale screenshots, image quality, and conceptual-versus-implemented labeling.
  - Report unavailable provider rendering or visual inspection as `not-run`.

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

## P2 — Shared Asset Management

- [ ] Portable asset catalog contract
  - Add a compact `design/assets/manifest.yaml` that discovers smaller collection manifests for brand assets, icons, illustrations, photography, fonts, and other reusable media without loading every record into agent context.
  - Give each asset a stable ID, status, authority, revision or integrity hash, provenance, licensing and usage restrictions, and available renditions. Keep usage-specific accessibility text with the consuming screen or component.

- [ ] Default shared asset layout
  - Store reusable product-owned files under a top-level `assets/` root, separate from catalog metadata. Let existing repositories map their native asset locations rather than forcing file moves.
  - Commit ordinary SVGs, icons, illustrations, fonts with distributable licenses, and reasonably sized images by default.

- [ ] Organization and product asset ownership
  - Keep genuinely shared logos, fonts, and brand media in the organization foundation; pin their versions into product workspaces.
  - Keep product-specific assets in the product workspace and implementation-specific renditions in the codebase binding.

- [ ] Prototype-local assets and promotion
  - Allow experiments under `prototypes/<prototype-id>/assets/`, but prevent production from consuming those files directly.
  - Promote an accepted asset by adding a canonical shared file and catalog record with provenance; do not treat moving or copying a prototype file as sufficient promotion.

- [ ] Production asset projections
  - Map shared asset IDs and revisions to framework-native locations such as `public/` or `src/assets/`.
  - Prefer direct shared imports when the codebase supports them; otherwise generate or synchronize derived copies with recorded source integrity and no independent editing.

- [ ] External and large-asset authority
  - Support DAMs, design tools, Git LFS, or other external authorities for large, proprietary, or restricted masters while retaining approved metadata and pinned local renditions needed for deterministic work.
  - Default synchronization to `notify`; never rely on mutable external URLs or silently replace repository assets.

- [ ] Independent asset checks
  - Check missing files, stale renditions, broken references, duplicate IDs, format, dimensions, file weight, provenance, licensing metadata, and prototype-only assets used by production.
  - Keep asset validation separate from accessibility checks that evaluate the asset in its actual screen or component context.

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

- [x] Claude Code discovery adapter
  - Generated `CLAUDE.md`, `.claude/skills/` links, `allowed-tools`, and the `.silver/bin/silver` launcher. See `docs/agent-host-compatibility.md`.

- [ ] Additional agent wrappers
  - Add and fixture-test discovery wrappers for Codex and other supported agents following the Claude Code adapter pattern, without duplicating skill logic.

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
