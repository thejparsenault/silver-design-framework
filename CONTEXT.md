# Design Practice Framework

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
A project-scoped, agent-invoked capability for a designer's recognizable task, with declared inputs, outputs, tools, permissions, and side effects.
_Avoid_: Command, script

**Check**:
A deterministic evaluation of one conformance dimension that produces normalized findings and never performs design work.
_Avoid_: Skill when the operation is purely evaluative

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
One independently declared set of capability/action decisions participating in
the effective-permission intersection. `deny` is stricter than `ask`, which is
stricter than `allow`.
_Avoid_: Grant when the layer only requests or restricts authority

**Finding**:
One normalized failed or unexecuted check observation with a checker, rule,
severity, policy profile, location, explanation, and suggested correction.
Passing checks have no findings.
_Avoid_: Error when the result may be a warning or `not-run`

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
