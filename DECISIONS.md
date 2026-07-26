# Decision Log

## Format

```md
## YYYY-MM-DD - Decision title

Decision:
Reason:
Status:
```

---

## 2026-06-05 - Semantic token layer is the primary interface for implementers

Decision: Implementers (agents and humans) work against a semantic token layer (bg-base, text-primary-on-base, etc.), not raw scale values. The full scale (neutral ramp, spacing steps, type sizes) is defined, but access is constrained through named semantic roles with explicit valid-use rules.
Reason: Raw utility composition requires taste and system knowledge. A constrained semantic layer makes agent-generated UI more predictable and reduces the surface area for design decisions at implementation time.
Status: Accepted for conforming production implementations and the reference system

## 2026-06-05 - Code/tokens are authoritative; Figma is a scratchpad

Decision: The token and component definitions in code are the source of truth. Figma will be populated from code (not the reverse), and rough Figma designs will be imported back as scaffolding only.
Reason: Keeping Figma as the source of truth requires manual sync discipline that doesn't hold long-term. Code-authoritative systems are versionable, diffable, and CI-checkable.
Status: Superseded 2026-07-23 by per-artifact authority with a pinned local representation

## 2026-06-05 - Layer terminology: scale, semantic roles, mode, scheme, theme

Decision: Four terms, each with a distinct scope:
- **Scale** — raw token values (neutral-100, blue-500). No semantics.
- **Semantic roles** — named usage slots (--bg-base, --text-primary) that map to scale values.
- **Mode** — a named contextual color palette (default, marketing, info, error, success) that defines which scale values the semantic roles resolve to. Changes tone and intent.
- **Scheme** — the light/dark toggle within a mode (light, dark). Aligns with CSS `prefers-color-scheme`. Same mechanism as modes, different scope.
- **Theme** — brand-level customization; a full override of scale and role definitions for a different project (white-labeling).

Resolved value chain: Mode + Scheme → Semantic roles → Scale values.

Reason: "Theme" and "mode" collide in common usage (dark mode vs. theme = light/dark). "Scheme" is the CSS spec term for light/dark and is unambiguous. Keeping "theme" for brand-level customization leaves all four terms with distinct, non-overlapping meanings.
Status: Accepted as the reference-system vocabulary; adopting systems may map equivalent native concepts

## 2026-06-05 - Delivery model: template repo

Decision: The design system is distributed as a template repo. A new project clones it, runs `npm install && npm run dev`, and has a fully running system immediately. The consumer owns all the files — nothing is a remote dependency.
Reason: The system is foundational and heavily customized per project. Consumers need to own the source, not depend on a remote package. A template repo requires zero publishing infrastructure, is framework-agnostic, and is the most accessible model for a non-technical user. npm package extraction is a future option if a standalone token layer becomes useful, but not the starting point.
Status: Superseded 2026-07-23 by project-owned installation from versioned framework packages

## 2026-06-05 - Component technology: CSS foundation + HTML/CSS components + optional React layer

Decision: Three tiers:
1. **Foundation** — pure CSS custom properties (scales, semantic roles, modes, schemes). No framework. Importable by anything.
2. **Components** — HTML structure + CSS class definitions (`.btn`, `.card`, `.navbar`) built on the foundation tokens. Vanilla JS for interactive behaviors. Framework-agnostic: apply the right classes to the right elements in any stack.
3. **React package** — thin wrappers around tier 2 with prop interfaces and TypeScript types. Optional, additive, not the primary interface.

Reason: Portability lives in the token and component CSS layers, not in the component framework. Any consuming stack (Astro, Vue, plain HTML, React) can use tiers 1 and 2 directly. The React layer adds convenience for React projects without constraining everyone else.
Status: Accepted for the reference system, not required of adopting systems

## 2026-06-05 - Agent interface: structured files, not MCP tools

Decision: The agent's interface to the design system is the files in the repo — a well-structured `CLAUDE.md` (or `AGENT.md`) that explains the token system, valid semantic roles, component patterns, and workflow. The conformance checker is a CLI script (`npm run check -- --url <url>`) that agents call via Bash. Figma integration uses the official Figma MCP and is documented as an optional setup step, not bundled into the system.
Reason: An MCP server requires hosting, auth, and infrastructure that adds complexity without proportional benefit. A well-written agent context file achieves the same result — agents can read files and reason about them. The conformance checker as a CLI script is simpler to run, debug, and maintain. Keeping Figma as an optional documented step avoids baking in a dependency on a specific MCP implementation.
Status: Superseded 2026-07-23 by agent-neutral project skills, structured artifacts, deterministic checks, and provider-neutral capabilities

## 2026-06-15 - Token source format: DTCG 2025.10 + Style Dictionary 4

Decision: All token source files use the W3C Design Tokens Community Group 2025.10 format. Every token has an explicit `$type`, a structured `$value` object (not a CSS syntax string), and a `$description`. Style Dictionary 4 (SD4) is the build tool — it natively accepts DTCG format and transforms tokens to CSS custom properties, Tailwind v4 theme variables, and any future platform outputs. Files use the `.tokens.json` extension.

The CSS syntax string (`oklch(0.55 0.14 250)`) is output from Style Dictionary — it is never the source value. The source for a color is always a structured object:
```json
{ "$type": "color", "$value": { "colorSpace": "oklch", "components": [0.55, 0.14, 250], "hex": "#4361ee" }, "$description": "..." }
```

Reason: DTCG format is tool-portable (Figma Variables, Tokens Studio, Style Dictionary, IDE plugins all read it). SD4 removes the transformation layer that SD3 required for DTCG input. Explicit `$type` and `$description` make token files self-documenting and validatable without separate docs.
Status: Accepted for the reference system, not mandated for adopting systems

## 2026-06-15 - CSS cascade layer stack

Decision: All system CSS is organized into named cascade layers, declared in this order:

```css
@layer reset, tokens, base, components, utilities;
```

- `reset` — element normalization (box-sizing, margin, etc.)
- `tokens` — CSS custom property declarations only; no selectors that affect layout
- `base` — element defaults (body, h1–h6, a, p, etc.) consuming token variables
- `components` — `.ds-button`, `.ds-field`, etc. and their data-attribute variants
- `utilities` — escape-hatch classes; intentionally last so they win over components

Reason: Without explicit layers, specificity battles undermine the override governance model (tokens first, one-off classes last). Cascade layers make that hierarchy enforceable by the browser rather than by convention.
Status: Accepted for the reference system

## 2026-06-15 - Scheme switching strategy: media query default + data-scheme override

Decision: Light/dark scheme is implemented in two steps:

1. `@media (prefers-color-scheme: dark)` — establishes the default based on OS preference; no user action required.
2. `[data-scheme="dark"]` and `[data-scheme="light"]` attributes — explicit user overrides that win over the media query via specificity.

```css
/* default: light */
:root { --ds-surface-page: oklch(1 0 0); }

/* OS preference */
@media (prefers-color-scheme: dark) {
  :root { --ds-surface-page: oklch(0.12 0 0); }
}

/* explicit override always wins */
[data-scheme="light"] { --ds-surface-page: oklch(1 0 0); }
[data-scheme="dark"]  { --ds-surface-page: oklch(0.12 0 0); }
```

Mode is applied separately via `[data-mode="marketing"]` etc., and nests inside scheme.

Reason: Media-query-only approaches can't be overridden by a UI toggle. Attribute-only approaches don't respect OS preference by default. The layered approach gives correct behavior for both.
Status: Accepted for the reference system

## 2026-06-15 - Distribution: template repo with Tailwind v4 output included

Decision: The template repo delivery model (DECISIONS.md 2026-06-05) stands. In addition, SD4 generates a Tailwind v4 CSS `@theme` block as a standard output alongside the main `ds.css`. This lets consuming projects that use Tailwind reference system tokens as Tailwind theme values without any additional configuration.

The registry model described in the PRD is a future enhancement — a tool that helps seed a new template instance with selected components. It does not change the consumer-owns-all-files model.

Reason: Tailwind v4 output costs nothing to generate from the same SD4 transform pipeline and meaningfully reduces friction for Tailwind-based projects. Clarifying that the registry seeds the template (rather than being a live dependency) resolves the tension between the PRD's registry language and the template-repo decision.
Status: Superseded 2026-07-23 by the framework installer and versioned project-owned packages; Tailwind output remains a reference-system adapter

## 2026-07-23 - The product is a design-practice framework

Decision: Repurpose this repository into an agent-neutral framework for design work across codebases and external tools. A design system is a managed project artifact or output, not the product itself. Preserve the existing HTML/CSS design-system spike as an editable reference system and test fixture.
Reason: Teams need consistent ways to describe intent, invoke common design tasks, integrate tools, and enforce constraints across both blank and existing repositories. Shipping one starter design system does not solve that broader problem and incorrectly assumes the same system should begin every project.
Status: Accepted

## 2026-07-23 - Use explicit organization, product, and codebase scopes

Decision: Model shared organization foundations, product design workspaces, and application codebase bindings as separate logical scopes. Repositories may combine scopes when small. Multi-repository setups use manifests and pinned versions rather than symlinks.
Reason: Brand and accessibility may span products while audience, tone, components, and implementation details differ. Explicit scopes support both small colocated projects and multi-team product portfolios without relying on fragile filesystem relationships.
Status: Accepted

## 2026-07-23 - Fixed discovery entry points with flexible artifact locations

Decision: Every participating repository exposes `design/manifest.yaml` and a compact generated `design/INDEX.md`. Artifact kinds and schemas are standardized, while physical document locations can be mapped. Narrative intent lives in frontmatter-bearing Markdown; enforceable contracts live in JSON or YAML.
Reason: Fully fixed file layouts are brittle in existing repositories, while completely flexible layouts make agents and tools unreliable. Fixed discovery points and logical kinds provide predictability without forcing reorganizations.
Status: Accepted

## 2026-07-23 - Project-local skills and a narrowly scoped CLI

Decision: Install workflow skills at the lowest useful repository scope and commit them with the repository. Skills contain their own scripts and canonical agent-neutral instructions. The CLI handles setup, update, repair, migration, and diagnostics only; it recommends but does not start daily design workflows.
Reason: Global workflow skills pollute unrelated context, while a large workflow CLI couples independent tasks and becomes brittle. Project-local packages keep context and authority clear; shared protocols preserve consistency.
Status: Accepted

## 2026-07-23 - Tool access is capability-based and permission-bounded

Decision: Skills declare abstract capabilities, supported providers, and requested permissions. Users select providers and permission ceilings in a global tool profile. Effective authority is the intersection of framework, user, organization/project, and skill policies; repositories can tighten but not broaden the user's ceiling.
Reason: Provider choices differ by user and task, and integrations evolve. Capability-based contracts keep skills portable while explicit permission intersection prevents a repository or skill from escalating access.
Status: Accepted

## 2026-07-23 - Prototypes require explicit constraint profiles

Decision: Prototypes may create new components and compositions but remain constrained by semantic visual styles by default. A designer may explicitly choose `partial` or `suspended` design-system constraints under prototype roots. Suspension is never inferred, does not silently change canonical artifacts, and retains baseline accessibility and safety requirements.
Reason: Prototypes need freedom, but unconstrained output can become dangerously disconnected from the product. Explicit profiles make the exception visible without turning a flexible design process into an enforced lifecycle.
Status: Accepted

## 2026-07-23 - External authority is per artifact and synchronization defaults to notify

Decision: Declare authority by artifact kind. An external tool may be authoritative, but production use requires a pinned and validated local representation. Synchronization supports `manual`, `notify`, and `propose`; `notify` is the default, and no mode silently overwrites either side.
Reason: Different teams legitimately choose different sources of truth. Local validated representations make agent and CI work reproducible, while notification avoids both silent drift and surprising automatic updates.
Status: Accepted

## 2026-07-23 - Compliance uses independent deterministic checks

Decision: Keep artifact/schema, token/raw-value, component-contract, prototype-policy, browser/accessibility, responsive, and freshness checks independent. A thin `design-check` orchestrator normalizes findings. Missing render targets or providers produce `not-run`, never pass.
Reason: Independent checks are easier to run, replace, debug, and promote gradually from warning to blocking. Deterministic programs keep production enforcement available to developers and CI without depending on an agent.
Status: Accepted

## 2026-07-23 - Distribute through GitHub releases and a non-global npm CLI

Decision: Keep installer source with the framework. Use GitHub as the canonical source and immutable release host, and publish a small scoped npm CLI as the convenience channel. The package bundles its matching versioned payload; projects pin the installed release in lock state. Do not use a mutable `curl | sh` command as the primary installer.
Reason: The installer and contracts must be released and tested together. An npm command is accessible and does not require global installation, while immutable GitHub releases provide an auditable source and artifact boundary. Bundling the payload prevents a second unpinned network fetch.
Status: Accepted

## 2026-07-23 - V1 contracts are strict at their boundaries

Decision: Use JSON Schema 2020-12 for YAML and JSON framework contracts. Reject unknown top-level fields, require namespaced extension keys, and reserve cross-file concerns such as path existence, unique IDs, permission intersection, result consistency, freshness, and lock integrity for deterministic semantic checks.
Reason: Strict local shapes make contracts memorable and dependable without forcing JSON Schema to perform repository-wide reasoning. Namespaced extensions preserve deliberate flexibility without allowing accidental configuration typos to pass.
Status: Accepted

## 2026-07-23 - Tailwind exposes semantic colors and structural scales

Decision: The reference Tailwind v4 adapter exposes semantic color roles and approved structural spacing, radius, type-size, and shadow scales. It does not expose primitive color ramps as utility names.
Reason: Tailwind is implementation syntax, not an exception to the semantic-style boundary. Structural utilities remain practical, while primitive visual utilities would make it easy for production work to bypass design intent.
Status: Accepted

## 2026-07-23 - Portable flows separate design intent from its views

Decision: Represent user, interaction, and component behavior flows as strict tool-neutral graphs with stable node and transition IDs and an integer revision. The first local representation is `flow.json` under a manifest-declared flow root; a bundled renderer produces a revision-stamped Mermaid view. Prototypes and future component contracts pin the flow ID, path, and revision they used. External canvases remain optional adapters or explicitly declared authorities and never silently rewrite derived work.
Reason: Designers need to generate and tweak flows before choosing a prototype or component implementation, while agents need a compact, inspectable model they can reliably consume. Separating the model from its views avoids coupling the framework to one canvas and makes divergence visible without enforcing a design lifecycle.
Status: Accepted

## 2026-07-24 - Skills compose through artifact-driven playbooks

Decision: Keep design skills independently runnable and compose them through optional declarative playbooks with typed, revision-pinned artifact handoffs. Recommend synthesis and framing → ideation → direction selection → specification ↔ flow/sketch → prototype → evaluation as a default loop, but allow steps to be skipped, reordered, revised, or invoked directly. Explicit playbook invocation authorizes declared safe local progression until a checkpoint or unresolved boundary; it does not broaden permissions for canonical changes, external writes, production, destructive actions, or version-control effects.
Reason: A fixed pipeline would make the design process brittle, while informal conversational sequencing would be difficult to resume, inspect, or test. Artifact handoffs preserve flexibility and agent neutrality; playbooks make longer workflows repeatable without turning recommendations into lifecycle enforcement.
Status: Accepted

## 2026-07-24 - Skill results separate execution, acceptance, and readiness

Decision: Report whether a skill executed successfully, whether its result was accepted, and which downstream uses are ready as independent states. Extend future skill contracts with typed inputs, required and optional capabilities, provider fallbacks, stable completion invariants, quality criteria, review requirements, unresolved-question policy, and downstream handoffs. Layer reusable guardrails by framework, user, organization/workspace, artifact profile, skill, and invocation; keep privacy, authority, provenance, permission, and no-silent-mutation rules non-relaxable.
Reason: File generation is not equivalent to design quality, stakeholder approval, or production readiness. Separate states prevent agents from treating their own outputs as accepted and let optional tools degrade honestly through `not-run` rather than blocking unrelated work or producing false passes.
Status: Accepted

## 2026-07-24 - Pitch produces portable change cases and branded presentation views

Decision: Add a cross-cutting `pitch` skill that produces a tool-neutral `change-case` artifact in opportunity, proposal, or outcome mode. The case records its audience, requested decision, before state, evidence, proposed or actual post state, estimated, proxy, or measured impact, tradeoffs, risks, alternatives, contradictions, and explicit ask. Decks, reports, HTML stories, design-tool presentations, and pull-request summaries are revision-pinned views rendered from the case using the active brand, voice, design-system semantics, approved assets, and an optional project-owned presentation kit.
Reason: Designers need an evidence-backed way to gain team support before and after implementation. Separating the case from its presentation formats preserves claim traceability, enables multiple tools, and prevents presentation edits from silently changing evidence or accepted design intent.
Status: Accepted

## 2026-07-24 - Presentation kits are medium-specific system projections

Decision: Allow workspaces to store presentation guidelines, semantic presentation roles, templates, and reusable presentation components as a distinct presentation kit. Presentation components may consume shared brand assets and semantic design tokens but do not belong in the product UI component catalog. The pitch skill may create deck-local compositions and propose reusable additions; promotion into the kit is explicit. Add a dedicated `presentation-kit` skill only if maintenance becomes a frequent task with a genuinely distinct authority boundary.
Reason: Reusable decks should remain visually coherent without becoming a second drifting design system or polluting product component definitions. Explicit promotion controls template sprawl, while a separate kit supports organization-level reuse and product-specific overlays.
Status: Accepted

## 2026-07-24 - The project is named The Silver Design Framework

Decision: Use `The Silver Design Framework` as the display name and `Silver` as
the short name. Use `silver-design-framework` for the repository, local folder,
and unscoped package identity; use `silver` for the CLI and contract namespace;
and store installed framework state under `.silver/`.

Reason: The straightforward name is easier to understand and remember than an
invented compound while still supporting a distinctive visual identity. The
short `silver` namespace keeps commands and machine-readable contracts concise.
Because the framework is still in prerelease, the old working identifiers do
not require compatibility aliases. A future visual identity can use a simple
`Ag` monogram inside a restrained geometric frame without complicating the
written name.

Status: Accepted

## 2026-07-25 - Every general skill has a portable baseline

Decision: Every generally applicable Silver skill must perform its core task
through a bundled project-local provider using repository files and packaged
scripts. Portable artifacts carry accepted meaning; generated local views and
external tool objects are revision-pinned projections. Prose-first artifacts
use Markdown with Silver frontmatter, structured contracts use declared JSON or
YAML, tokens use DTCG JSON, and self-contained semantic HTML is the default
local visual view. HTML is not a universal canonical format. Inherently
external or production effects remain explicitly provider- or codebase-bound.

Reason: Designers should be able to use the full practice without installing
or granting access to a particular hosted tool. Separating portable meaning
from visual projections keeps skills composable, testable, and provider-neutral
while still giving visual tasks a common local review surface.

Status: Accepted

## 2026-07-25 - Representation drift uses explicit three-way reconciliation

Decision: Every local or external view binds to an exact portable artifact
revision and records provider, adapter, mapping, authority, fidelity, and last
reconciled base. One side is authoritative for an artifact at a time.
Synchronization compares the shared base, current portable revision, and
current normalized external snapshot; it emits classified, reviewable change
proposals and never resolves drift through last-write-wins. Applying a proposal
requires current revisions, validation, expected integrity, applicable
acceptance, and permission. Failure or ambiguity leaves accepted work
unchanged.

Reason: Both an artifact and its Figma or HTML representation can change after
generation. Defaulting silently to either side would lose work or convert
presentation details into unintended design requirements. Three-way
reconciliation preserves provenance and lets designers decide which semantic
changes belong in which artifact.

Status: Accepted
