# The Silver Design Framework

Silver is an agentic product-design workspace. It gives designers and their
agents a shared set of project-local skills, structured design artifacts,
portable visual outputs, guardrails, and deterministic checks.

Use Silver to:

- define product, audience, brand, voice, and design principles;
- conduct research, synthesize evidence, and generate ideas;
- create specifications, flows, sketches, components, and prototypes;
- evaluate work and refine it from accepted feedback;
- prepare evidence-backed pitches and presentations;
- move accepted designs toward production without silently inventing styles,
  components, or requirements; and
- keep local artifacts and external-tool representations revisioned,
  inspectable, and explicitly reconciled.

Silver does not require one application framework, design tool, agent, or
mandatory design process. Skills run independently and can also be combined
into a longer, resumable design loop.

## How Silver works

Silver is agent-first rather than a graphical application:

1. Ask a file-capable chat agent to inspect setup for a product or repository.
2. Review its recommendation for an integrated or separate design repository.
3. Let the agent apply the exact reviewed plan.
4. Ask it to use project-local skills in `.skills/`.
5. Review consequential changes; accepted work receives a local Git checkpoint.

A Silver workspace distinguishes three representation roles:

- **Portable artifacts** contain the accepted design meaning. They use
  Markdown, structured JSON or YAML, and DTCG token files.
- **Local views** make that meaning easy to inspect. Silver uses semantic HTML
  for visual work and Mermaid plus HTML for flows.
- **External views** are objects in tools such as Figma. Bindings record their
  authority, provider revision, mapping, and last shared base so drift can be
  reviewed instead of resolved by guessing.

Every general skill has a useful local baseline. External tools add capability
but are not prerequisites for ordinary design work.

## Requirements

For the current source-based installation you need:

- Git;
- Node.js 20 or newer; and
- an agent that can work with repository files and project instructions.

Silver is not yet published as a public npm CLI. Install it from this
repository for now.

## Quick start

Clone Silver and install its small runtime dependency set:

```sh
git clone https://github.com/thejparsenault/silver-design-framework.git
cd silver-design-framework
npm install
```

Then ask your agent:

> Install Silver for this product. Ask me only for decisions you cannot infer
> safely, recommend whether design should live in this repository or a separate
> repository, and show me the setup plan before applying it.

Underneath the conversation, the agent uses:

```sh
node /path/to/silver-design-framework/bin/silver.mjs setup inspect \
  /path/to/product --answers /tmp/silver-answers.json --json

node /path/to/silver-design-framework/bin/silver.mjs setup apply \
  /tmp/silver-plan.json --json
```

The plan recommends a separate design repository for multiple codebases,
separate discipline ownership, or independent design history. It recommends
integration for a solo or small shared team with one codebase and lifecycle.
The recommendation is never applied until the plan is reviewed.

Guided setup also creates the visible, tool-neutral
`~/Silver/My Practice` workspace. It has readable methods, playbooks, rubrics,
and decisions plus implicit local Git history. A configured GitHub remote is
reported separately from a verified remote backup; Silver never pushes merely
because it created a local revision.

You do not normally need to create skill-invocation JSON by hand. Tell the
agent which project-local skill to use. The agent should read that skill's
`SKILL.md`, pin its inputs and active design context, respect repository
instructions and guardrails, and record the result.

## A good first session

Begin by giving the workspace enough context to constrain later work.

### 1. Define the product

> Use the project-local `product` skill to help me define the audience,
> problems, jobs, constraints, and success measures for this product.
> Interview me where necessary. Show me the proposed change before updating
> `design/product.md`.

### 2. Establish the brand

> Use the `brand` skill, taking the accepted product artifact as context. Help
> me define the brand promise, desired feeling, attributes, anti-attributes,
> and visual implications. Do not update `design/brand.md` until I approve the
> proposal.

### 3. Define voice and principles

> Use the `voice` skill to define tone, terminology, content patterns, and
> important do/don't guidance for this audience.

> Use the `principles` skill to create a small set of decision principles that
> are specific enough to resolve real product-design tradeoffs.

### 4. Review the system foundation

> Use the `theme` and `system` skills to review the default semantic styles,
> modes, tokens, and component guidance against the accepted product and
> brand. Propose changes before applying them.

These are useful foundations, not mandatory stages. You can revisit any one of
them whenever the product changes.

## Designing a feature

Silver's recommended loop is:

```text
research → synthesize → ideate → specify ↔ flow/sketch → prototype → evaluate
```

The loop is optional. Start at the point that matches the evidence and
decisions you already have.

A typical feature session could use these prompts:

> Use `research` to prepare a plan for learning why users abandon onboarding.
> Separate planned research from research that has actually been conducted.

> Use `synthesize` to turn the attached observations into findings. Preserve
> links to the evidence and distinguish observation, interpretation, and
> recommendation.

> Use `ideate` to generate several approaches to the accepted problem. Record
> assumptions and testable hypotheses rather than presenting ideas as facts.

> Use `specify` to turn the selected direction into a design specification
> covering behavior, states, edge cases, accessibility, success criteria, and
> unresolved questions.

> Use `flow` to create a structured user flow from the specification. Generate
> both Mermaid and HTML views.

> Use `map` to create a current-state journey map from the accepted evidence.
> Label assumptions, pin the active design context, and render the local HTML
> view.

> Use `sketch` to create an inexpensive HTML representation of the important
> states. Stop for my review before making a higher-fidelity prototype.

> Use `prototype` to build a constrained local prototype that pins the accepted
> specification, flow, and design-system revisions. State the question the
> prototype is meant to answer.

> Use `evaluate` to record these observations, separate findings from
> interpretations, and propose refinements. Apply only the findings I accept.

Flows are useful but not required for every sketch or prototype. A prototype
may introduce experimental components, but it remains constrained to approved
semantic styles unless you explicitly request and justify a partial or full
constraint suspension.

## Other skills

The installed catalog contains twenty-one independently runnable skills:

| Area | Skills |
| --- | --- |
| Orientation | `what-now` |
| Foundations | `product`, `brand`, `voice`, `principles`, `theme`, `system` |
| Discovery | `research`, `synthesize`, `ideate`, `map` |
| Definition | `specify`, `flow`, `component` |
| Making | `sketch`, `prototype` |
| Evaluation and delivery | `evaluate`, `pitch`, `implement`, `practice-review`, `design-check` |

Use `pitch` to create an opportunity, proposal, or outcome case for team
buy-in. It can generate a branded local presentation view while keeping
estimated impact distinct from measured results.

Use `what-now` when returning to a workspace or when the next useful move is
unclear. It ranks several choices from manifest status, review checkpoints,
check results, freshness blockers, accepted handoffs, and timestamps without
starting any of them.

Use `implement` only after the relevant design inputs are accepted and
production readiness is satisfied. Prototype code is evidence and reference
material by default, not automatically production code.

## Run checks

Run the complete fast suite from the initialized workspace:

```sh
node .skills/design-check/scripts/run-fast.mjs --root .
```

If local Chrome is available, run the browser suite:

```sh
node .skills/design-check/scripts/run-browser.mjs --root .
```

Checks cover artifact contracts, flow structure, semantic styles, prototype
policy, evidence provenance, presentations, production readiness, assets,
accessibility, responsive behavior, critical interactions, bindings,
revision pins, view provenance, synchronization, semantic mapping, stale
proposals, authority, map structure, and secret-free configuration.

A genuinely unavailable target reports `not-run`; Silver never turns missing
coverage into a pass.

## Workspace structure

A new workspace has this general shape:

```text
my-product-design/
  AGENTS.md                  Agent entry point
  .skills/                   Project-local design skills
  .silver/                   Installed packages, lock state, and results
  design/
    INDEX.md                 Generated artifact index
    manifest.yaml            Workspace configuration and artifact map
    product.md
    brand.md
    voice.md
    design-principles.md
    system/
    assets/
    contexts/                Product/surface contexts and expression mappings
    decisions/
    flows/
    maps/
    guidance/                Manually linked institutional guidance
    sources/                 Pinned design-system, component, and code links
    integrations/
    presentation-kit/
    work/                    Findings, concepts, specs, and other working artifacts
  prototypes/
  presentations/
  production/
  reference-system/         Editable demonstration system for local rendering
```

`~/Silver/My Practice` is intentionally outside this product workspace.
Product results record only its stable identity, revision, and applied method
IDs—not a private path or a copy of the personal repository.

Treat `design/manifest.yaml` and the mapped design artifacts as sources of
truth. `design/INDEX.md` is generated. Framework-managed files under
`.skills/` and `.silver/` are updated through the Silver CLI rather than
edited casually.

## Maintenance commands

Run maintenance commands with the CLI from your Silver checkout:

```sh
node /path/to/silver-design-framework/bin/silver.mjs doctor /path/to/workspace
node /path/to/silver-design-framework/bin/silver.mjs repair /path/to/workspace
node /path/to/silver-design-framework/bin/silver.mjs update /path/to/workspace
node /path/to/silver-design-framework/bin/silver.mjs migrate /path/to/workspace
node /path/to/silver-design-framework/bin/silver.mjs trace artifact-id /path/to/workspace
```

- `doctor` is read-only and reports contract, integrity, and configuration
  problems.
- `repair` regenerates disposable indexes and agent pointers.
- `update` updates clean framework-managed packages and reports conflicts or
  project-owned proposals.
- `migrate` previews a supported migration. Add `--apply` only after reviewing
  the plan.
- `trace` shows the sources, practice revision, linked guidance, design
  contexts, acceptance, and external bindings behind a durable artifact.

Daily design work belongs in skills, not in the installer. Setup and updates
never start recommended design tasks automatically.

## Important safety rules

- Filesystem access, Git/GitHub permissions, branch protection, and repository
  instructions determine repository authority. Silver declares and audits
  expected effects but does not add another repository permission gate.
- Recommended next actions are never started automatically.
- Constraint suspension must be requested explicitly; an agent may not infer
  it from a request for exploration.
- Accepted artifacts, implementation handoffs, and material configuration
  changes create local Git checkpoints when possible. Checkpoints never push.
- External changes are inspected and proposed before they affect portable
  artifacts.
- Credentials and secrets do not belong in project bindings or tool profiles.

## Current limitations

Silver `0.5.0`, **Traceable Practice and Context**, is validated for guided
setup, integrated and separate repository topology, My Practice, linked local
or Git guidance, multiple design contexts, maps, provenance tracing, and
reviewable 0.4-to-0.5 migration.

- Guided setup can install into an existing repository, but deep semantic
  discovery and adoption of arbitrary codebases remains a following milestone.
- Silver reports drift for newly linked guidance, design-system, component, and
  codebase sources. General `silver sync` commands and broader bidirectional
  Figma/component/document synchronization are intentionally deferred.
- GitHub repository creation is agent-mediated: Silver previews the proposed
  private repository and records a resulting remote, but does not create it
  through a direct built-in API.
- The convenience npm package and immutable GitHub release have not yet been
  published.
- Production recipes remain intentionally limited while the existing-codebase
  adoption model is developed.

## Contributing

Install development requirements and run both authoritative release gates:

```sh
python3 -m pip install -r requirements-dev.txt
npm install
npm run build
npm run test:package
```

`npm run build` validates contracts, rebuilds local rendering assets, and runs
the source test suite. `npm run test:package` packs the exact release archive,
installs it into an isolated blank workspace, and exercises the packaged
setup, migration, skills, views, reconciliation, and checks.

## Project documentation

- [`PROJECT.md`](PROJECT.md) — purpose, scope, and constraints
- [`STATUS.md`](STATUS.md) — current state and next actions
- [`TASKS.md`](TASKS.md) — active implementation sequence
- [`silver_design_framework_prd.md`](silver_design_framework_prd.md) — product requirements
- [`docs/agentic-design-workflows.md`](docs/agentic-design-workflows.md) — skills and playbooks
- [`docs/tool-representations-and-reconciliation.md`](docs/tool-representations-and-reconciliation.md) — portable artifacts, views, providers, and drift
- [`docs/traceable-practice-and-context.md`](docs/traceable-practice-and-context.md) — 0.5 architecture, ownership, versioning, backup, and authority
- [`docs/silver-0.5-acceptance.md`](docs/silver-0.5-acceptance.md) — current release boundary
- [`docs/silver-0.5-acceptance-audit.md`](docs/silver-0.5-acceptance-audit.md) — current direct evidence
- [`docs/silver-0.3-acceptance.md`](docs/silver-0.3-acceptance.md) — release criteria
- [`docs/silver-0.3-acceptance-audit.md`](docs/silver-0.3-acceptance-audit.md) — passing evidence
