# The Silver Design Framework

The framework gives designers and agents a shared language for describing design intent, connecting that intent to tools and codebases, and checking that generated work remains coherent.

## Language

**Framework**:
The reusable set of artifact contracts, skills, checks, recipes, adapters, and setup/update tooling maintained by this repository.
_Avoid_: Design system, starter kit

**Workspace**:
The lowest repository scope at which related design artifacts, skills, checks, and configuration are installed and owned together.
_Avoid_: Framework instance, install

**Organization foundation**:
Shared guidance and protected constraints that legitimately apply across multiple products, such as brand, accessibility policy, and semantic vocabulary.
_Avoid_: Global design system, parent repo

**Product workspace**:
A workspace that owns one product's audience, jobs, tone, research, prototypes, design-system expression, and reusable product patterns.
_Avoid_: Project when the product boundary matters

**Codebase binding**:
The declared connection between a product workspace and a specific application repository, including its implementation locations, commands, checks, and component mappings.
_Avoid_: Adapter when referring to a repository connection

**Artifact**:
A discoverable unit of design knowledge or enforceable configuration with a declared kind, scope, status, and authority.
_Avoid_: Doc, file when the logical role matters

**Canonical artifact**:
The artifact currently authorized to define a particular kind of design intent or rule within its declared scope.
_Avoid_: Source of truth without naming its scope

**Skill**:
A project-scoped, agent-invoked capability for a designer's recognizable task,
with declared inputs, outputs, tools, expected effects, and handoffs.
_Avoid_: Command, script

**Playbook**:
An optional declarative graph that composes independently runnable skills through typed artifact handoffs, readiness conditions, checkpoints, branches, and stopping rules.
_Avoid_: Pipeline when implying one mandatory order, mega-skill

**Skill result**:
The normalized record of one invocation's execution, acceptance, and downstream-readiness states, including artifact revisions, degraded capabilities, checks, and unresolved questions.
_Avoid_: Done flag, success when only file generation completed

**Check**:
A deterministic evaluation of one conformance dimension that produces normalized findings and never performs design work.
_Avoid_: Skill when the operation is purely evaluative

**Check evidence**:
The persisted result file a check writes under `.silver/results/checks/`. A
recorded `pass` is believed only when its evidence resolves and agrees; an
unbacked claim is degraded to `not-run` with the reason.
_Avoid_: Check status when referring to the file that substantiates it

**Studio voice**:
How the agent talks while doing design work: register, not rigour. Authored once
as a framework default and overridable in My Practice, deliberately separate from
skill packages so tone and instructions can change independently.
_Avoid_: Voice, which is the product's voice to its audience

**Practice overlay**:
My Practice resolved and carried into one workspace as a generated, untracked
file. It is where personal studio voice and method overlays reach an agent, and
it is never an authoring location — personal preference is authored in My
Practice so it applies everywhere and is committed nowhere.
_Avoid_: Workspace setting, personal config in the project

**Recipe**:
A tested implementation profile for generating a particular kind of output, such as a static reference page, marketing site, web application, or mobile prototype.
_Avoid_: Template when the choice includes runtime and workflow guidance

**Adapter**:
A translation layer between the framework's logical contracts and a specific technology or external tool.
_Avoid_: Binding when it does not describe a particular application repository

**Reference system**:
The editable demonstration design system shipped to show how canonical artifacts, semantic constraints, rendering, and checks work together.
_Avoid_: Default design system when implying it must remain unchanged

**Prototype**:
A non-authoritative, open-ended design artifact that may be revised, promoted, retained, or discarded while remaining subject to its explicitly selected constraint profile.
_Avoid_: Throwaway, production candidate

**Design specification**:
A living, revisioned contract for one selected direction that records outcomes, scope, requirements, states, accessibility expectations, linked artifacts, success criteria, decisions, and open questions.
_Avoid_: One-time handoff document, full specification for every idea

**Sketch**:
An inexpensive, usually noninteractive representation used to explore or review a direction. Its fidelity is declared independently from its artifact type.
_Avoid_: Low fidelity when referring to role rather than appearance

**Evaluation**:
A product-judgment activity that defines a question and method, captures sanitized observations, and produces findings or recommendations about whether a design works for its intended purpose.
_Avoid_: Check when referring to deterministic conformance

**Flow**:
A tool-neutral directed graph of user intent, interface or component states, decisions, actions, and transitions. A flow is an editable design input that can be rendered into different tools and used as the basis for prototypes, product compositions, or component behavior contracts.
_Avoid_: Diagram when referring to the underlying design model

**Flow view**:
A generated or synchronized visual representation of a flow in Mermaid, HTML, Figma, Paper, or another supported tool. A view may be edited through a capable adapter, but it is not automatically authoritative.
_Avoid_: Flow when referring only to one rendering

**Constraint profile**:
The explicit degree to which a prototype uses the active design system: `constrained`, `partial`, or `suspended`.
_Avoid_: Mode, theme

**Implementation profile**:
The durable, project-selected recipe used by default for a class of output, such as interactive web-app prototypes.
_Avoid_: Framework default when it belongs to one workspace

**Tool capability**:
An abstract operation a skill needs, such as reading a design file or inspecting a browser, independent of the provider that supplies it.
_Avoid_: MCP server when provider choice is not relevant

**Tool profile**:
A user's provider preferences and permission ceilings for tool capabilities, stored outside project workflow context.
_Avoid_: Global skills

**Permission layer**:
The inactive pre-0.5 Silver contract that intersected capability/action
decisions. It remains readable for migration and external-provider
compatibility, but it no longer authorizes or denies repository operations.
_Avoid_: Current repository authority

**My Practice**:
A visible, tool-neutral personal workspace containing readable method overlays,
playbooks, rubrics, and decisions with local Git history. Product results pin
its identity and revision without copying its private path or contents.
_Avoid_: Global skills, company foundation

**Method overlay**:
A non-executable personal refinement to one or more core skills that can add
preferred questions, techniques, quality emphasis, and exclusions without
relaxing project facts, safety invariants, or required guidance.
_Avoid_: Skill fork, hidden prompt

**Guidance source**:
A manually linked local or Git source of institutional knowledge with selected
paths, exact revision and integrity, scope, and reference/preferred/required
influence.
_Avoid_: Automatically discovered company foundation

**Linked source**:
A manually registered local or Git design-system, component-catalog, or
codebase source with declared authority, selected paths, and an exact revision
or integrity pin. Availability, drift, and stale dependents are inspected
without importing or semantically synchronizing the source.
_Avoid_: Live dependency, automatic pull

**Design context**:
A revisioned composition of product or brand, design system, component catalog,
component-expression mapping, optional assets and presentation kit, surfaces,
and codebase binding used to resolve a visual output.
_Avoid_: Theme when the composition includes more than visual tokens

**Component-expression mapping**:
The explicit identity or transformation mapping that proves how shared
component semantic roles resolve through one design context's system tokens,
themes, assets, and implementation conventions.
_Avoid_: Implicit theme switch

**Map**:
A portable, evidence-aware structured model for a journey, service blueprint,
experience map, or ecosystem/stakeholder map. It records state, actors, stages,
lanes, items, connections, evidence, assumptions, pain points, opportunities,
and exact design-context revisions.
_Avoid_: Canvas when referring to the underlying model

**Provenance envelope**:
The durable record of an artifact's identity, origin, contributors, sources,
My Practice revision and methods, linked guidance, linked sources, design
contexts, change reason, superseded revision, acceptance, and external
bindings.
_Avoid_: Private reasoning log

**Effect**:
An expected or observed read, write, external change, or Git/GitHub action
recorded for preview and audit. An undeclared effect is a finding, not an
authorization decision.
_Avoid_: Permission grant

**Git checkpoint**:
A path-isolated local commit created for explicit acceptance, implementation
handoff, or material practice/workspace configuration. It records its branch
and commit and never implies a push.
_Avoid_: Backup when no remote is verified

**Finding**:
One normalized failed or unexecuted check observation with a checker, rule,
severity, policy profile, location, explanation, and suggested correction.
Passing checks have no findings.
_Avoid_: Error when the result may be a warning or `not-run`

**Pitch**:
The cross-cutting skill that assembles accepted evidence and design artifacts into a decision-ready change case and optional presentation views.
_Avoid_: Report when referring to the task, sales pitch when implying unsupported persuasion

**Change case**:
A portable, evidence-linked account of a before state, reasons for change, proposed or actual post state, impact, tradeoffs, and explicit decision request. It may operate in opportunity, proposal, or outcome mode.
_Avoid_: Deck when referring to the underlying case, business case when only financial approval is intended

**Presentation kit**:
A project-owned, medium-specific projection of brand and design-system semantics containing presentation guidelines, templates, and reusable presentation components.
_Avoid_: Product component library, second design system

**Presentation view**:
A rendered deck, document, HTML story, design-tool presentation, or similar output derived from a pinned change case and presentation-kit revision.
_Avoid_: Change case when referring only to one rendering

**Approved pattern**:
A reusable, domain-neutral composition with a documented contract, usually owned by one product unless multiple products genuinely share it.
_Avoid_: Primitive, product composition

**Product composition**:
A domain-specific assembly owned by a product or feature and built from approved tokens, primitives, and patterns.
_Avoid_: Pattern when the domain meaning is essential

## Example Dialogue

> **Designer:** I want to explore a new campaign setup flow in the marketing product.
>
> **Agent:** The marketing product workspace uses its constrained prototype profile and its web-app implementation profile. I can create new product compositions, but I will reuse the canonical semantic styles and registered primitives.
>
> **Designer:** For this experiment, suspend the design system but keep accessibility checks.
>
> **Agent:** I will record the prototype's constraint profile as suspended. That does not change the product workspace or its codebase binding, and any later promotion will require rebuilding the accepted design against production rules.
