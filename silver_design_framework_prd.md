# PRD: The Silver Design Framework

**Status:** Draft 2
**Owner:** JP Arsenault
**Date:** 2026-07-24
**Primary users:** Product designers, design engineers, frontend engineers, and the agents that support them

## 1. Executive Summary

The Silver Design Framework is a meta-system for doing design work with code and external tools in a consistent, inspectable way. It supplies artifact contracts, project-scoped skills, deterministic checks, tested implementation recipes, provider adapters, and a small setup/update tool.

It can initialize a blank workspace or attach to an existing repository. It does not require a particular design system, application framework, agent, design tool, or lifecycle. Instead, it makes a project's own decisions discoverable and gives designers consistent task-level workflows for using them.

The portable design system already prototyped in this repository becomes the **reference system**: an editable example and fixture that demonstrates semantic tokens, components, rendering, and conformance. It is not the framework's universal design system.

## 2. Problem

Design work becomes unreliable when:

- brand, audience, voice, component, and style rules are scattered or implicit;
- user journeys and component behavior are trapped in screenshots, canvases, or prose that prototypes cannot reliably consume;
- an agent cannot tell which artifact or external tool is authoritative;
- every repository exposes a different set of workflows and tool integrations;
- generated interfaces invent raw values, variants, or components;
- prototypes become visually disconnected from the product they are meant to test;
- design-tool and code representations drift without notice;
- process guidance is confused with hard production policy;
- skills installed globally pollute unrelated agent context;
- checks depend on agent judgment and cannot run in CI.

The framework must preserve flexibility while making constraints, authority, permissions, and exceptions explicit.

## 3. Product Principles

1. **Meta-system, not universal design system.** The framework manages a project's design practice and design-system sources of truth.
2. **Local context, shared protocols.** Skills live at the lowest useful repository scope; cross-project consistency comes from contracts.
3. **Project ownership.** Installed files are committed, editable, and updated through reviewable diffs.
4. **Task-level interfaces.** Designers invoke recognizable tasks such as brand, theme, flow, prototype, and check—not internal micro-steps.
5. **Explicit authority.** Every canonical artifact declares its scope and authority; external tools never overwrite silently.
6. **Constraints by default.** Production work uses semantic styles and approved components. Prototype exceptions must be explicit.
7. **Recommendations over ceremony.** The framework can recommend a lifecycle and next actions but does not enforce process order.
8. **Deterministic enforcement.** Compliance checks are independent programs that humans, agents, hooks, and CI can run.
9. **Provider neutrality.** Skills request capabilities; users choose providers and permission ceilings.
10. **Stable defaults.** Once a workspace chooses an implementation profile, skills reuse it until the user deliberately adds or changes one.
11. **Portable design intent.** Flows have a tool-neutral structured representation; visual canvases and diagrams are interchangeable views or explicitly declared authorities.
12. **Artifact-driven composition.** Skills run independently and compose through typed, revision-pinned artifact handoffs; optional playbooks coordinate them without imposing a universal lifecycle.
13. **Separate completion from approval.** Skill execution, human or policy acceptance, and readiness for a downstream use are independently visible.
14. **Portable baseline.** Every generally applicable skill performs its core task with project-local files and bundled providers; external tools add capabilities without becoming silent prerequisites.
15. **Reconcile, never guess.** Canonical artifacts, local views, and external views carry explicit authority and revision provenance. Drift is compared against a shared base and proposed for review rather than resolved by last-write-wins.

## 4. Scope Model

The framework supports three composable scopes:

### 4.1 Organization Foundation

Owns constraints that genuinely span products:

- core brand guidance;
- shared voice principles;
- accessibility policy;
- semantic token vocabulary;
- shared primitives or patterns when ownership is truly cross-product;
- organization-approved skill, check, and recipe policies.

### 4.2 Product Workspace

Owns one product's:

- audience, jobs, and product purpose;
- tone and product-specific voice;
- design principles;
- research, findings, and design decisions;
- token values, modes, schemes, and themes;
- product primitives, approved patterns, and compositions;
- prototypes and testing artifacts;
- default implementation profiles.

### 4.3 Codebase Binding

Connects a product workspace to one application repository:

- source and component locations;
- native token and component mappings;
- build, preview, test, and check commands;
- renderable test targets;
- production policy profile;
- code-framework and utility-class adapters.

A small product may combine all three scopes in one repository. Multiple products may share an organization foundation through explicit manifest references and pinned versions. Symlinks are not a portability mechanism.

## 5. Artifact Model

Every participating repository has two fixed entry points:

```text
design/manifest.yaml
design/INDEX.md
```

`design/manifest.yaml` is authoritative configuration. `design/INDEX.md` is a compact generated map intended for fast human and agent discovery.

Default narrative artifacts are:

```text
design/
  brand.md
  product.md
  voice.md
  design-principles.md
  system/
  flows/
  research/
  testing/
  decisions/
```

These are logical defaults, not mandatory physical paths. Existing repositories may map semantically equivalent documents in the manifest. Oversized or ambiguous omnibus documents should produce smaller operational summaries with provenance rather than forcing every skill to load them.

Narrative artifacts use Markdown with frontmatter declaring:

- artifact kind and schema version;
- scope;
- status;
- owner;
- last meaningful update;
- authority or external source where applicable.

Machine-enforced contracts use JSON or YAML. Narrative files should normally stay below roughly 2,000 tokens, warn around 3,000, and split by consumption pattern.

### 5.1 Flow Artifacts

A flow is a portable directed graph that describes user intent and observable behavior before committing to a particular prototype or design tool. The minimal contract records:

- identity, purpose, scope, status, and revision;
- one or more actors and desired outcomes;
- nodes for screens, component states, user or system actions, decisions, and terminal outcomes;
- transitions with triggers and optional conditions;
- references to canonical artifacts, research, existing components, prototype files, or external design-tool objects;
- optional annotations for unresolved questions, requirements, and edge cases.

Flows may be product-scoped under `design/flows/`, prototype-scoped beside a prototype, or component-scoped when they describe one component's behavior. A product task flow normally informs a prototype or product composition; a component behavior flow may inform a component contract. The framework does not collapse those two levels.

The structured flow is the default portable representation. Mermaid, HTML, SVG, Figma, Paper, and similar canvases are views supplied by adapters. A workspace may instead declare an external tool authoritative, but it still keeps a pinned local representation under the normal synchronization rules.

Flow editing is non-destructive and iterative. A designer can generate, inspect, and tweak a flow before choosing any implementation recipe. Prototype and future component skills accept flow references as inputs and record the flow revision they used. Later flow changes produce a visible stale-reference notification or proposed update; they never silently rewrite derived work.

Deterministic flow checks cover schema validity, unique nodes, valid transitions, reachability, start and terminal coverage, and unresolved references. They do not judge whether the product experience is good.

### 5.2 Design Working Artifacts

The broader design practice may use problem frames, concepts, design
specifications, sketches, prototypes, evaluations, and change cases. These are
logical artifact kinds rather than mandatory files for every project or every
design task.

A design specification is a living contract for a selected direction. Flows,
sketches, and prototypes reference its stable identity and revision rather than
duplicating its requirements. A sketch is a cheap, usually noninteractive
representation; a prototype is a testable simulation created to answer a
declared question. Fidelity is recorded independently from artifact type and
prototype constraint profile.

Only information needed across skill, session, tool, or review boundaries must
be persisted. Transient agent reasoning and mechanical intermediate steps do
not require repository artifacts.

### 5.3 Portable Artifacts and Views

Silver separates three representation roles:

- a **portable artifact** carries accepted design meaning and is the unit used
  by skill handoffs and playbooks;
- a **local view** is a generated, disposable projection for review,
  inspection, or interaction; and
- an **external view** is a provider object bound to an exact portable
  revision through an adapter.

Prose-first portable artifacts use Markdown with Silver frontmatter. Graphs,
catalogs, findings, policies, and other machine-enforced structures use their
declared JSON or YAML contracts. Tokens use DTCG JSON. Self-contained semantic
HTML is the default local visual view for sketches, prototypes, presentations,
and catalogs; flows provide both Mermaid and HTML views from one structured
graph. HTML is not a universal canonical format.

A generated view records all portable, renderer, design-system, asset, and
provider revisions it uses. Editing a view does not silently update its
portable artifact. Imported edits become normalized reconciliation proposals.
The detailed format, provenance, and reconciliation model is in
`docs/tool-representations-and-reconciliation.md`.

## 6. Skill Model

A skill is an agent-neutral package for one recognizable design task. It contains:

- canonical instructions;
- a machine-readable contract;
- scripts required by that skill;
- templates or examples;
- optional thin discovery wrappers for supported agents.

The contract declares:

- required artifacts and capabilities;
- files and scopes it may read;
- files and scopes it may write;
- artifacts it may produce;
- external effects;
- requested permissions;
- expected context budget;
- deterministic checks to recommend afterward;
- required and optional capabilities plus degraded fallback behavior;
- its bundled portable baseline provider and the external effects that cannot
  be performed by that baseline;
- stable completion invariants and unresolved-question policy;
- quality criteria and required review;
- possible downstream handoffs.

Invocation grants routine, contract-bounded authority. Crossing into production, changing canonical design-system artifacts, modifying external tools, deleting material work, or creating commits/PRs still follows the resolved permission policy.

First-iteration task-level skills:

- **brand** — define or refine audience-facing brand guidance;
- **theme** — propose, render, apply, and validate visual expression;
- **flow** — generate, render, and revise a tool-neutral user, interaction, or component behavior flow;
- **prototype** — create or revise a prototype, including revision from accepted feedback;
- **design-check** — orchestrate enabled independent checkers and summarize findings.

The planned general design-practice vocabulary adds:

- **synthesize** — turn evidence and context into findings, problem frames,
  opportunities, assumptions, and open questions;
- **ideate** — generate meaningfully different concepts and testable
  hypotheses;
- **specify** — create or revise a living design contract for a selected
  direction;
- **sketch** — create inexpensive representations for exploration or review;
- **evaluate** — plan and conduct reviews or tests and produce sanitized
  findings and recommendations;
- **pitch** — produce an evidence-backed change case and optional branded
  presentation views;
- **implement** — rebuild accepted intent in a codebase binding under
  production policy.

More granular internal operations do not become separate user-facing skills unless their intent, context, tools, or authority truly differ.

### 6.1 Default Design Loop

The recommended loop is:

```text
context and evidence
→ synthesize and frame
→ ideate
→ select a direction
→ specify
↔ flow and sketch
→ prototype
→ evaluate
→ new evidence
```

This sequence is guidance, not a validity rule. Flow, sketch, and prototype
work is optional and may occur in a different order. Specifications, flows,
and representations can co-evolve. A selection checkpoint prevents every
lightweight idea from automatically becoming an expensive specification.

Production implementation is an explicit side path from accepted design
intent. It may use a specification, flow, sketch, prototype, evaluation
finding, or component contract, but it performs a production-readiness
assessment first. Prototype code remains reference material by default and is
not silently promoted.

### 6.2 Playbooks

A playbook is an optional declarative graph that composes leaf skills through
artifact references. It declares nodes, compatible skill versions, inputs,
handoffs, conditional or parallel branches, readiness conditions, checkpoints,
retry edges, stopping conditions, and allowed autonomy.

Invoking one skill runs only that skill and recommends next actions. Invoking a
playbook authorizes an agent to continue through its declared safe local steps
until a checkpoint, unmet readiness condition, or unresolved permission
boundary. Canonical changes, external writes, production changes, destructive
operations, and version-control effects retain their normal permission
requirements.

### 6.3 Skill Results and Guardrails

Every skill result distinguishes:

- **execution** — whether the operation ran and produced contract-valid
  outputs;
- **acceptance** — whether an authorized person or evaluator accepted the
  result;
- **readiness** — which named downstream uses have sufficient information and
  validation.

Subjective quality criteria may be generated for an invocation, but they must
be declared before evaluation and versioned if they change. Missing tools or
render targets produce degraded coverage or `not-run`, never an implicit pass.

Guardrails resolve through framework invariants, user ceilings, organization
and workspace policy, artifact constraint profiles, skill boundaries, and
invocation constraints. Each reusable guardrail declares an enforcement type,
failure behavior, and whether it is relaxable. Privacy, authority, provenance,
permission, and no-silent-mutation rules are not relaxable.

The detailed composition and result model is in
`docs/agentic-design-workflows.md`.

## 7. Tool and Permission Model

Skills request abstract capabilities such as:

- inspect browser;
- read design file;
- modify design file;
- read repository;
- write prototype;
- write production source;
- create external artifact;
- commit, push, or open PR.

A user-level **tool profile** selects providers and sets permission ceilings. Organization and repository configuration may only tighten those ceilings. A skill's effective permissions are the intersection of:

```text
framework default
∩ user ceiling
∩ organization/repository restriction
∩ skill request
```

Default posture:

- local and external reads: allowed when declared;
- browser inspection: allowed when declared;
- local writes inside the invoked skill's non-production scope: allowed;
- canonical design-system or production writes: ask when crossing the skill's ordinary boundary;
- external modifications, commits, pushes, and PRs: ask;
- destructive deletion: denied unless explicitly authorized.

Credentials never belong in repository configuration. Providers use their own authentication, environment references, or an operating-system credential store.

Skills distinguish capabilities required to perform their core task from
optional capabilities that improve an output. Optional capabilities declare a
fallback. For example, a pitch may complete a local change case without a
presentation provider while reporting deck rendering and visual inspection as
`not-run`.

Every generally applicable skill has a registered bundled baseline provider
that uses repository files and packaged scripts. Baseline providers are
installed packages discovered through provider contracts, not a hard-coded
runtime list. A skill result distinguishes complete portable work from
unavailable optional projections or inspections. A task that is inherently
external or production-bound must still require that provider or codebase and
must not claim the baseline performed the effect.

## 8. Prototype Policy

Prototypes are open-ended and non-authoritative. They may introduce new component structures and behaviors and may later be promoted, retained, archived, or discarded.

Each prototype declares one constraint profile:

- `constrained` — default; use canonical semantic styles and approved components while allowing new local compositions and component experiments;
- `partial` — explicitly suspend named constraints while retaining all others;
- `suspended` — explicitly suspend the design system in full.

No profile may be inferred from the work. `partial` and `suspended` require an explicit user instruction and are legal only under prototype roots by default.

Even a suspended prototype retains baseline semantic HTML, accessibility, privacy, and runtime-safety checks. Lo-fi and wireframe work uses a predefined restricted subset rather than inventing visual values.

Prototype state lives in a lightweight `prototype.yaml`. Actual changes to canonical design-system artifacts are recorded in the normal decision log. Promotion is explicit and normally regenerates or rebuilds production work against production contracts instead of moving prototype code wholesale.

A prototype may reference one or more flows and the exact revisions used. The flow remains an input, not a lifecycle gate: designers may prototype without one, and they may revise either artifact first. The framework reports divergence and recommends reconciliation rather than enforcing an order.

## 9. Design-System and Component Policy

The framework standardizes the logical model, not one implementation vocabulary:

```text
primitive values → semantic roles → optional component tokens → components and patterns
```

Production output must not directly consume primitive visual values. Existing systems may map their native variables and names to logical roles without being renamed.

Component categories:

- **system primitive** — reusable low-level control such as Button, Field, or Dialog;
- **approved pattern** — reusable, domain-neutral contract such as FilterBar or EmptyState;
- **product composition** — domain-specific assembly such as CampaignFilterBar.

Product compositions may use approved tokens, primitives, and patterns but may not silently create competing primitives. Repeated compositions can be deliberately promoted.

Tailwind and similar utilities are implementation syntax. Structural utilities may be permitted by policy; primitive color utilities and arbitrary visual values are rejected. Component internals and visual properties use semantic or component-level tokens.

## 10. External Authority and Synchronization

Authority is declared per artifact or artifact kind. A binding has one
authoritative side: the portable local artifact or a named external provider.
Multiple authoring surfaces do not imply equal bidirectional authority. Figma,
another design tool, or code may be authoritative depending on the team.

Any artifact consumed by production requires a pinned and validated local representation so agents, builds, and CI can operate deterministically.

Each local or external view records the portable artifact and revision used,
provider object and revision, adapter and version, mapping profile, authority,
round-trip fidelity, and last reconciled base. Credentials never appear in a
binding.

Synchronization policies:

- `manual` — run only when requested;
- `notify` — default; report that the local representation is stale;
- `propose` — fetch, validate, and prepare a reviewable diff or PR.

No policy silently overwrites the canonical local or external artifact. Freshness begins as a warning; repositories may promote critical artifacts to CI errors.

Synchronization states are `current`, `view-stale`, `external-changed`,
`diverged`, `unmapped`, `unverified`, and `conflict`. Reconciliation compares
the last reconciled portable base, current portable revision, and current
normalized external snapshot. Adapters emit typed change proposals classified
by design meaning. They do not update canonical artifacts during inspection,
infer cross-artifact changes, invent styles or components, or resolve
concurrent changes by last-write-wins.

Applying an accepted proposal revalidates local and external revisions,
permissions, schemas, and required checks. Local writes are atomic and
expected-integrity guarded; external writes require separate approval. Failure,
partial extraction, denial, or a stale proposal leaves accepted work
unchanged.

A local baseline does not bypass external authority. When an externally
authoritative artifact cannot be refreshed, the last validated local pin may
support inspection or drafting, but freshness-sensitive readiness remains
blocked. The complete model is defined in
`docs/tool-representations-and-reconciliation.md`.

## 11. Checks

Checkers remain independent:

- artifact and schema validity;
- raw value and semantic-token use;
- component-contract conformance;
- prototype policy;
- accessibility and browser behavior;
- responsive behavior;
- external-source freshness.

`design-check` is a thin orchestrator. It contains no check logic and normalizes findings with:

- checker and rule;
- severity and policy profile;
- file and location;
- message and observed value;
- suggested correction;
- result status.

Suites:

- **fast** — deterministic static checks;
- **browser** — render-dependent checks;
- **full** — all enabled checks.

A renderable target is a declared fixture, story, route, preview URL, or state with enough start and viewport information to inspect it reproducibly.

When a required target or provider does not exist, the result is `not-run`, never pass. Adoption-stage repositories may treat this as a warning; mature repositories can make missing coverage blocking. Browser MCP providers are useful interactively, but CI uses a deterministic browser runner such as Playwright by default.

## 12. Setup and Update Tool

The CLI exists only to:

- set up a blank or existing workspace;
- install or remove selected project-local framework packages;
- update installed packages through reviewable diffs;
- repair generated indexes and agent pointers;
- run migrations and diagnostics.

It does not conduct brand exercises, build prototypes, or start other skills automatically. Setup finishes with recommended next actions.

Configuration layers:

```text
framework defaults
→ user tool profile
→ organization practices
→ product workspace
→ codebase binding
```

The CLI records the exact framework release and installed package versions in `.silver/lock.yaml`.

See `docs/installer-distribution.md` for the recommended hosting and release model.

## 13. Blank Workspace Default

The first-iteration blank workspace contains:

```text
workspace/
  design/
    manifest.yaml
    INDEX.md
    brand.md
    product.md
    voice.md
    design-principles.md
    system/
    flows/
    research/
    testing/
    decisions/
  prototypes/
  reference-system/
  .silver/
    lock.yaml
  .skills/
  AGENTS.md or equivalent pointer
```

Setup creates a design workspace and static reference example without silently choosing an application architecture.

When a designer later requests a runnable surface, the prototype skill recommends a tested recipe based on the work:

- static HTML/CSS/minimal JavaScript for wireframes, components, and system examples;
- Astro for marketing, docs, and content-oriented sites;
- React Router Framework Mode or SPA mode for interactive web applications;
- a short requirements check before a full-stack server framework such as Next.js;
- Expo for mobile prototypes;
- the existing stack when attached to a product codebase.

The selected implementation profile becomes the durable default for that surface. A workspace may add another profile, such as Astro for a marketing site supporting a React product, without replacing its existing default.

## 14. Research and Feedback

Repositories may contain:

- research plans;
- sanitized notes and synthesis;
- findings;
- recommendations;
- accepted decisions.

Raw recordings, unredacted transcripts, participant PII, credentials, and sensitive datasets stay outside the repository. A gitignored staging location may hold temporary local material.

The evidence chain is:

```text
raw evidence
→ sanitized finding
→ recommendation
→ accepted decision
→ canonical artifact
```

Research and testing do not silently rewrite canonical artifacts. The prototype skill may revise prototype files from accepted findings within its declared scope.

The `pitch` skill may assemble accepted evidence and design artifacts into a
portable **change case** for opportunity, proposal, or outcome communication.
A change case records audience, requested decision, before state, evidence,
proposed or actual post state, estimated or measured impact, tradeoffs, risks,
alternatives, and the explicit ask. It never treats estimates as measurements,
prototypes as implemented states, or successful generation as stakeholder
approval.

Change cases may render as Markdown, HTML, decks, design-tool presentations,
pull-request summaries, or post-launch reports. Decks consume the active brand,
voice, semantic design-system roles, approved assets, and an optional
project-owned presentation kit. The change case remains authoritative for its
content; presentation outputs are revision-pinned views. See
`docs/pitch-and-presentations.md`.

## 15. First Iteration

### 15.1 Included

1. V1 manifest, artifact, flow, prototype, skill, tool-permission, lock, and finding contracts.
2. Blank-folder setup/update/doctor flow.
3. Project-local installation of the `brand`, `theme`, `flow`, `prototype`, and `design-check` skills.
4. An editable HTML/CSS-first reference system.
5. Static HTML rendering and the fast check suite.
6. Generated agent discovery pointers for at least one reference agent, backed by canonical agent-neutral packages.
7. Fixture-based tests proving setup and update are idempotent and preserve user-owned edits.
8. Recommended next actions at the end of setup; no automatic workflow execution.

### 15.2 Excluded

- automatic adoption of arbitrary existing repositories;
- organization-to-product inheritance implementation;
- live Figma or other design-tool synchronization;
- browser automation and accessibility enforcement;
- automated research ingestion;
- production component promotion or PR creation;
- multiple production framework adapters;
- public package publishing and broad onboarding documentation;
- hosted services, accounts, telemetry, or remote runtime.

All excluded functionality is tracked in `BACKLOG.md`.

### 15.3 Latest Release

Silver `0.4.0`, **What Now**, is complete. It adds the nineteenth project-local
skill: a read-only analyzer that recovers current workspace context and ranks
several evidence-linked next actions without starting them. The guarded
invocation contract now supports caller-ranked recommendations only within a
skill-declared allowlist, while existing skills retain their static follow-ups.

`docs/silver-0.4-acceptance.md` is authoritative for the release scope and
stable requirement IDs. `docs/silver-0.4-acceptance-audit.md` records direct
passing evidence for all ten required criteria. Existing-codebase adoption
follows `0.4.0` because no representative production repository is currently
available.

## 16. Acceptance Criteria

The first iteration is successful when:

1. A blank temporary directory can be initialized without manual file copying.
2. Re-running setup makes no unintended changes.
3. An update from one fixture release to the next produces a reviewable diff and preserves project-owned edits.
4. The installed manifest and index make all canonical artifacts discoverable.
5. Skills are available only within the workspace and declare their capabilities and permissions.
6. A designer can refine brand guidance, optionally apply a theme proposal, generate and revise a portable flow, and render a constrained prototype based on that flow using the reference system.
7. The fast suite rejects raw visual values and malformed framework artifacts with normalized findings.
8. An explicit partial or suspended prototype profile is recorded and never inferred.
9. The entire flow works without Figma, a browser MCP, or a global skill installation.
10. The flow source can be rendered through a bundled text-based view, and derived work records the flow revision it used without being silently rewritten after changes.

## 17. Proposed Framework Repository Shape

```text
silver-design-framework/
  framework/
    schemas/
    protocols/
    artifact-types/
    permission-model/
  installer/
  skills/
  playbooks/
  checks/
  recipes/
  adapters/
  reference-system/
  fixtures/
    blank-workspace/
    existing-codebase/
  docs/
  PROJECT.md
  STATUS.md
  TASKS.md
  BACKLOG.md
  DECISIONS.md
```

## 18. Primary Risks

**Framework flexibility becomes ambiguity.**  
Mitigation: fixed entry points, strict logical artifact kinds, versioned schemas, and small tested defaults.

**The CLI becomes a workflow engine.**  
Mitigation: installer responsibilities are explicitly limited; daily actions remain in skills.

**Project-owned files become impossible to update safely.**  
Mitigation: lock state, file ownership metadata, three-way updates, migrations, and reviewable diffs.

**Skills behave differently across agents.**  
Mitigation: canonical agent-neutral packages, deterministic scripts, fixtures, and thin discovery wrappers.

**Playbooks become a hidden mandatory lifecycle or authority escalation.**
Mitigation: independently runnable leaf skills, optional graph nodes, explicit
checkpoints, resumable state, and unchanged permission resolution at every
step.

**Agents declare their own work good after producing it.**
Mitigation: separate execution, acceptance, and readiness; predeclare dynamic
criteria; and reserve subjective or consequential acceptance for the
authorized evaluator.

**The reference system is mistaken for a mandate.**  
Mitigation: label it as editable demonstration output and validate adoption against a non-reference existing system.

**Checks promise more than they can prove.**  
Mitigation: independent dimensions, explicit coverage, `not-run` status, and clear distinction between static provenance checks and browser observations.

**Presentation views drift from evidence or become a second design system.**
Mitigation: portable revision-pinned change cases, branded semantic
presentation roles, a distinct presentation-kit catalog, explicit pattern
promotion, and no silent reverse synchronization from a rendered deck.
