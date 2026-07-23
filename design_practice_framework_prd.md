# PRD: Design Practice Framework

**Status:** Draft 1  
**Owner:** JP Arsenault  
**Date:** 2026-07-23  
**Primary users:** Product designers, design engineers, frontend engineers, and the agents that support them

## 1. Executive Summary

The Design Practice Framework is a meta-system for doing design work with code and external tools in a consistent, inspectable way. It supplies artifact contracts, project-scoped skills, deterministic checks, tested implementation recipes, provider adapters, and a small setup/update tool.

It can initialize a blank workspace or attach to an existing repository. It does not require a particular design system, application framework, agent, design tool, or lifecycle. Instead, it makes a project's own decisions discoverable and gives designers consistent task-level workflows for using them.

The portable design system already prototyped in this repository becomes the **reference system**: an editable example and fixture that demonstrates semantic tokens, components, rendering, and conformance. It is not the framework's universal design system.

## 2. Problem

Design work becomes unreliable when:

- brand, audience, voice, component, and style rules are scattered or implicit;
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
4. **Task-level interfaces.** Designers invoke recognizable tasks such as brand, theme, prototype, and check—not internal micro-steps.
5. **Explicit authority.** Every canonical artifact declares its scope and authority; external tools never overwrite silently.
6. **Constraints by default.** Production work uses semantic styles and approved components. Prototype exceptions must be explicit.
7. **Recommendations over ceremony.** The framework can recommend a lifecycle and next actions but does not enforce process order.
8. **Deterministic enforcement.** Compliance checks are independent programs that humans, agents, hooks, and CI can run.
9. **Provider neutrality.** Skills request capabilities; users choose providers and permission ceilings.
10. **Stable defaults.** Once a workspace chooses an implementation profile, skills reuse it until the user deliberately adds or changes one.

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
- deterministic checks to recommend afterward.

Invocation grants routine, contract-bounded authority. Crossing into production, changing canonical design-system artifacts, modifying external tools, deleting material work, or creating commits/PRs still follows the resolved permission policy.

Initial task-level skills:

- **brand** — define or refine audience-facing brand guidance;
- **theme** — propose, render, apply, and validate visual expression;
- **prototype** — create or revise a prototype, including revision from accepted feedback;
- **design-check** — orchestrate enabled independent checkers and summarize findings.

More granular internal operations do not become separate user-facing skills unless their intent, context, tools, or authority truly differ.

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

## 8. Prototype Policy

Prototypes are open-ended and non-authoritative. They may introduce new component structures and behaviors and may later be promoted, retained, archived, or discarded.

Each prototype declares one constraint profile:

- `constrained` — default; use canonical semantic styles and approved components while allowing new local compositions and component experiments;
- `partial` — explicitly suspend named constraints while retaining all others;
- `suspended` — explicitly suspend the design system in full.

No profile may be inferred from the work. `partial` and `suspended` require an explicit user instruction and are legal only under prototype roots by default.

Even a suspended prototype retains baseline semantic HTML, accessibility, privacy, and runtime-safety checks. Lo-fi and wireframe work uses a predefined restricted subset rather than inventing visual values.

Prototype state lives in a lightweight `prototype.yaml`. Actual changes to canonical design-system artifacts are recorded in the normal decision log. Promotion is explicit and normally regenerates or rebuilds production work against production contracts instead of moving prototype code wholesale.

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

Authority is declared per artifact kind. Figma, another design tool, or code may be authoritative depending on the team.

Any artifact consumed by production requires a pinned and validated local representation so agents, builds, and CI can operate deterministically.

Synchronization policies:

- `manual` — run only when requested;
- `notify` — default; report that the local representation is stale;
- `propose` — fetch, validate, and prepare a reviewable diff or PR.

No policy silently overwrites the canonical local or external artifact. Freshness begins as a warning; repositories may promote critical artifacts to CI errors.

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

The CLI records the exact framework release and installed package versions in `.design-framework/lock.yaml`.

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
    research/
    testing/
    decisions/
  prototypes/
  reference-system/
  .design-framework/
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

## 15. First Iteration

### 15.1 Included

1. V1 manifest, artifact, skill, tool-permission, lock, and finding contracts.
2. Blank-folder setup/update/doctor flow.
3. Project-local installation of the `brand`, `theme`, `prototype`, and `design-check` skills.
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

## 16. Acceptance Criteria

The first iteration is successful when:

1. A blank temporary directory can be initialized without manual file copying.
2. Re-running setup makes no unintended changes.
3. An update from one fixture release to the next produces a reviewable diff and preserves project-owned edits.
4. The installed manifest and index make all canonical artifacts discoverable.
5. Skills are available only within the workspace and declare their capabilities and permissions.
6. A designer can refine brand guidance, optionally apply a theme proposal, and render a constrained prototype using the reference system.
7. The fast suite rejects raw visual values and malformed framework artifacts with normalized findings.
8. An explicit partial or suspended prototype profile is recorded and never inferred.
9. The entire flow works without Figma, a browser MCP, or a global skill installation.

## 17. Proposed Framework Repository Shape

```text
design-practice-framework/
  framework/
    schemas/
    protocols/
    artifact-types/
    permission-model/
  installer/
  skills/
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

**The reference system is mistaken for a mandate.**  
Mitigation: label it as editable demonstration output and validate adoption against a non-reference existing system.

**Checks promise more than they can prove.**  
Mitigation: independent dimensions, explicit coverage, `not-run` status, and clear distinction between static provenance checks and browser observations.
