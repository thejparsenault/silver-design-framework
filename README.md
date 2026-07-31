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

- Node.js 20.11 or newer;
- an agent that can work with repository files and project instructions; and
- Git, only if you install from source rather than from a release.

No npm account or registry token is needed.

## Quick start

Open your product folder in a file-capable chat agent and paste this:

> Install the Silver Design Framework in this folder.
>
> First check that Node.js 20.11 or newer is available by running
> `node --version`. If it is missing or older, stop and tell me how to install
> it for my operating system.
>
> Then run, from this folder:
>
>     silver setup inspect . --json
>
> using this if `silver` is not on my PATH:
>
>     npx --yes silver-design-framework@0.6.1 setup inspect . --json
>
> Do not run `npx silver`; that is an unrelated package. Show me the recommended
> repository topology, its reasons, and every unresolved question. Ask me those
> questions. Do not apply anything yet.
>
> Once I have answered, apply exactly what I approved by piping inspect into
> apply, so no plan file is written into this folder:
>
>     silver setup inspect . --answers '{"team_shape":"…","topology":"…"}' --json | silver setup apply -
>
> Then run `silver doctor .` and summarize the result.

The agent reads its own instructions from `silver --help`, which documents every
answer key.

Two rules the agent must follow, both enforced by the CLI:

- `team_shape` and `topology` have no safe default. Setup refuses to apply while
  either is unanswered, so a human confirms the topology rather than the agent
  guessing.
- A plan file written inside the folder being inspected changes that folder and
  invalidates itself. Pipe into `setup apply -`, or keep the plan elsewhere.

The plan recommends a separate design repository for multiple codebases,
separate discipline ownership, or independent design history. It recommends
integration for a solo or small shared team with one codebase and lifecycle.
The recommendation is never applied until the plan is reviewed.

No npm account, login, or token is needed to install.

If your network cannot reach the npm registry, every release is also attached to
its GitHub release, and npm accepts a remote tarball as a package spec:

```sh
npx --yes https://github.com/thejparsenault/silver-design-framework/releases/download/v0.6.1/silver-design-framework-0.6.1.tgz setup inspect . --json
```

### If you are installing from source

You can also clone it and call it by path:

```sh
git clone https://github.com/thejparsenault/silver-design-framework.git
cd silver-design-framework && npm install
node "$PWD/bin/silver.mjs" setup inspect /path/to/product --json
```

After setup, the workspace has its own launcher and you can drop the long path:

```sh
cd /path/to/product
.silver/bin/silver doctor .
```

### Do I need to install Node?

Yes, until a standalone binary lands. Silver needs Node.js 20.11 or newer and
tells you so rather than failing obscurely:

```text
$ silver setup .
Silver needs Node.js 20.11 or newer; this is v18.19.0.

Install a supported Node.js, then run this command again:
  macOS with Homebrew:  brew install node
  macOS/Windows:        download the LTS installer from https://nodejs.org
  Linux with a manager: https://nodejs.org/en/download/package-manager
```

Guided setup also creates the visible, tool-neutral
`~/Silver/My Practice` workspace. It has readable methods, playbooks, rubrics,
and decisions plus implicit local Git history. A configured GitHub remote is
reported separately from a verified remote backup; Silver never pushes merely
because it created a local revision.

Tell the agent which project-local skill to use. It should read that skill's
`SKILL.md`, pin its inputs and active design context, respect repository
instructions and guardrails, and record the result.

Durable output goes through the guarded runtime. Ask for a scaffold rather than
writing the request by hand:

```sh
.silver/bin/silver invoke --scaffold brand .   # prefilled request
.silver/bin/silver invoke brand request.json .
```

The scaffold fills in identifiers, timestamps, the provenance envelope, the
active design-context pin, required check entries, and the `expected_integrity`
of any file being replaced. You supply the content and the reasons. Every
placeholder carries a sentinel and the CLI refuses a request that still contains
one, so a scaffold cannot be submitted unmodified.

Run skills through `.silver/bin/silver`, not `.skills/<id>/scripts/invoke.mjs`.
The guarded runtime needs dependencies the workspace does not carry; the CLI
resolves them.

## Working with Claude Code

`silver setup` generates what Claude Code reads, because it reads `CLAUDE.md`
rather than `AGENTS.md` and discovers skills only under `.claude/skills/`:

- `CLAUDE.md` importing `@AGENTS.md`, merged into a marked block so a
  project-owned `CLAUDE.md` keeps its content;
- `.claude/skills/<id>` symlinks into the canonical `.skills/<id>`, so all
  twenty-one skills appear in autocomplete;
- `.silver/bin/silver`, a launcher giving the workspace one stable command.

`.skills/` and `AGENTS.md` remain canonical and agent-neutral. The adapters are
generated: `silver repair` regenerates them, `silver doctor` reports when one is
missing or stale, and deleting them all still leaves a working workspace.

Claude Cowork is not yet supported — it loads only account-level skills and runs
code in an isolated remote environment. See
[`docs/agent-host-compatibility.md`](docs/agent-host-compatibility.md).

## How a session goes

One skill per turn. You ask for something, the agent runs a single skill, its
required checks run as part of that invocation, and it comes back with what it
made, what the checks actually said, and a couple of places you could go next.
Then it stops and you choose.

That is deliberate. A run that chains brand into a design system into a
prototype without stopping takes a long time to produce something you cannot
steer, and the first thing you find out is usually that you would have taken a
different turn three steps back. Short loops you can redirect beat long ones
that arrive finished.

So the sequences below are maps of where work can go, not scripts to run. Start
wherever your evidence and decisions already are, and expect to stop between
every step.

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

The moves available to you, roughly in the order they tend to become useful:

```text
research → synthesize → ideate → specify ↔ flow/sketch → prototype → evaluate
```

This is a map, not a pipeline. Nothing runs it end to end, and nothing should:
each arrow is a decision you make after seeing what the previous step produced.
Start at whichever point matches the evidence and decisions you already have,
and skip anything that does not earn its place.

Any one of these is a complete request on its own:

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

Every guarded invocation runs its own required checks and writes their evidence
to `.silver/results/checks/`, so you do not have to run anything to get a
trustworthy result. To check the whole workspace on demand:

```sh
.silver/bin/silver check .
.silver/bin/silver check . --only semantic-styles,accessibility
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

Checks read project-authored design source. Installed dependencies, build
output, and tool caches — `node_modules`, `dist`, `build`, `.vite` and the like
— are skipped, because a third-party package's raw colors are not your
workspace's problem.

A genuinely unavailable target reports `not-run`, and a check that claims to
pass without resolvable evidence is downgraded to `not-run` with the reason
recorded. Silver never turns missing coverage into a pass.

## Your practice

Everything personal lives in **My Practice** — one visible, Git-tracked folder
at `~/Silver/My Practice`, applying to every workspace you work in. Nothing
personal belongs in a project, because a project is shared.

| File in My Practice | Sets |
| --- | --- |
| `studio-voice.md` | How the agent talks to you while designing |
| `methods/*.yaml` | Preferred questions, techniques, quality emphasis, and exclusions, per skill |

Both are deliberately separate from the skill packages. Skills say *what to do*
and can be rewritten or upgraded without touching either, so a skill upgrade
never changes how the agent sounds and a preference change never edits
twenty-one files.

Silver seeds both files, commented out, when it creates your practice. Fill one
in and apply it:

```sh
$EDITOR "~/Silver/My Practice/studio-voice.md"
.silver/bin/silver repair .    # in each workspace, to pick it up
```

Your studio voice replaces the framework default rather than blending with it.
Your method overlays add to the skills they name.

Preferences are carried into a workspace as `.silver/my-practice.md`, which
Silver adds to `.gitignore`. That file is a generated copy — editing it does
nothing lasting. Author in My Practice.

Personal preference adds to how work is done. It never relaxes project facts,
guardrails, required guidance, or approval boundaries: where a preference and a
project rule disagree, the project rule wins.

## Workspace structure

A new workspace has this general shape:

```text
my-product-design/
  AGENTS.md                  Canonical agent entry point
  CLAUDE.md                  Generated Claude Code adapter; imports AGENTS.md
  .claude/skills/            Generated links into .skills/ for Claude Code
  .skills/                   Project-local design skills
  .silver/                   Installed packages, lock state, and results
    bin/silver               Generated launcher for the Silver CLI
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

From inside an initialized workspace, use its launcher:

```sh
.silver/bin/silver doctor .
.silver/bin/silver check .
.silver/bin/silver repair .
.silver/bin/silver update .
.silver/bin/silver migrate .
.silver/bin/silver trace artifact-id .
```

The equivalent from your Silver checkout, which also works before a workspace
exists:

```sh
node /path/to/silver-design-framework/bin/silver.mjs doctor /path/to/workspace
```

- `doctor` is read-only and reports contract, integrity, and configuration
  problems, including a missing or stale agent adapter.
- `repair` regenerates disposable indexes, agent pointers, host adapters, and
  the launcher. Run it after moving your Silver checkout.
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

Silver `0.7.0`, **One Good Step**, is validated for guided setup, integrated and
separate repository topology, My Practice and the studio voice, linked local or
Git guidance, multiple design contexts, maps, provenance tracing, Claude Code
discovery, CLI-routed guarded invocation with self-running checks, atomic
canonical activation, and reviewable 0.6-to-0.7 migration.

- Claude Cowork is not supported. It loads only account-level skills and runs
  code in an isolated remote environment, so guarded invocation cannot reach a
  local workspace. See
  [`docs/agent-host-compatibility.md`](docs/agent-host-compatibility.md).
- Browser checks need a reachable local URL. Where a browser cannot open one,
  `responsive-behavior` and `critical-interactions` report `not-run` and the
  work is recorded as `complete-awaiting-verification` rather than verified.
- Playbooks are single-step and cannot chain, but there is still no
  `silver playbook` command; composition is driven by the agent one skill at a
  time.
- `static-html` is the only implementation recipe. Profiles are offered rather
  than selected by default, but the set to offer from is small.
- Guided setup can install into an existing repository, but deep semantic
  discovery and adoption of arbitrary codebases remains a following milestone.
- Silver reports drift for newly linked guidance, design-system, component, and
  codebase sources. General `silver sync` commands and broader bidirectional
  Figma/component/document synchronization are intentionally deferred.
- GitHub repository creation is agent-mediated: Silver previews the proposed
  private repository and records a resulting remote, but does not create it
  through a direct built-in API.
- Production recipes remain intentionally limited while the existing-codebase
  adoption model is developed.

## Contributing

Install development requirements and run both authoritative release gates:

```sh
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
- [`docs/agent-host-compatibility.md`](docs/agent-host-compatibility.md) — what each agent host reads, and what Silver generates for it
- [`docs/silver-0.5-audit.md`](docs/silver-0.5-audit.md) — the 0.5 audit that produced this release
- [`docs/traceable-practice-and-context.md`](docs/traceable-practice-and-context.md) — 0.5 architecture, ownership, versioning, backup, and authority
- [`docs/silver-0.5-acceptance.md`](docs/silver-0.5-acceptance.md) — current release boundary
- [`docs/silver-0.5-acceptance-audit.md`](docs/silver-0.5-acceptance-audit.md) — current direct evidence
- [`docs/silver-0.3-acceptance.md`](docs/silver-0.3-acceptance.md) — release criteria
- [`docs/silver-0.3-acceptance-audit.md`](docs/silver-0.3-acceptance-audit.md) — passing evidence
