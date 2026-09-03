<p align="center">
  <img src="docs/brand/silver-logo.png" alt="Silver — Ag mark" style="max-width: 100%;border-radius: 12px;max-height: 320px;">
</p>

# Silver

**Silver is a product-design framework built for working with AI agents.** It
gives a product team one local home for design work: the decisions behind it,
the evidence that informed it, the design system it uses, the code and tools it
connects to, and a clear record of what happened along the way.

Start a chat with an agent that can access your project files. Ask it to install
Silver, then work as you normally would: define a product, explore a flow, make
a prototype, check a design, prepare a presentation, or connect a design system
and Figma. Silver gives the agent a shared project vocabulary and clear places
to save the work. When work draws on a source, Silver records it so you can see
where it came from later.

Silver does not replace Figma, your codebase, research tools, or the way your
team works. It connects them deliberately. If a tool offers an agent connection
(MCP), a command-line tool, or an API, an agent can use it when you give it the
tool’s setup instructions. Silver records what is connected, what was used, and
what still needs a human decision. It does not silently overwrite work in
another tool or repository.

Whenever you are unsure where to begin or what to do next, just ask your agent:
**“What now?”** Silver will look at the workspace’s current evidence, decisions,
and open work, then suggest a small set of grounded next steps. It does not
start any of them until you choose.

## Install Silver

Silver 0.9 is distributed first as signed and Apple-verified macOS installer
packages. This is the recommended option for most designers: install it once
and the `silver` command is ready in any local project folder. Choose the
package for your Mac from the [Silver 0.9 release](https://github.com/thejparsenault/silver-design-framework/releases/tag/v0.9.2):

| Your Mac | Download |
| --- | --- |
| Apple Silicon (M-series) | [`Silver-0.9.2-macos-arm64.pkg`](https://github.com/thejparsenault/silver-design-framework/releases/download/v0.9.2/Silver-0.9.2-macos-arm64.pkg) |
| Intel | [`Silver-0.9.2-macos-x64.pkg`](https://github.com/thejparsenault/silver-design-framework/releases/download/v0.9.2/Silver-0.9.2-macos-x64.pkg) |

### For you

1. Download the package matching your Mac and follow macOS’s installer steps.
2. Open the product folder you want to work in with Codex, Claude Code, or
   another local agent that can read project files and run shell commands.
3. Copy the following prompt into that agent. The prompt is for the agent; you
   do not need to run the command yourself.

### Copy this prompt into your agent

```text
Install Silver in this folder. First run `silver setup inspect . --json`.
Explain the recommended repository setup, anything you still need me to decide, and the
files that would be created or changed. Do not apply anything until I approve
the plan.
```

The agent will ask about the team and whether this should live alongside one
codebase or in its own design repository. Answer those questions in chat. When
you are satisfied with the plan, tell the agent to apply only that plan and then
run a health check.

After setup, “**What now?**” is always a good next prompt. Your agent can use
Silver’s project-local `what-now` skill to orient itself before proposing work.

### If you do not have the macOS package

Silver also ships as a Node.js package. This is the route for developers, and
the only route on Windows and Linux. All of these need Node.js 22 or later.

| Method | Command | When to use it |
| --- | --- | --- |
| **Into one project** | `npm install silver-design-framework@0.9.2` | The project already has a `package.json`. The version is pinned in the repository, so everyone on the team gets the same one, and the workspace launcher finds this copy first. |
| **On your machine** | `npm install -g silver-design-framework@0.9.2` | You want the `silver` command in any folder without using the macOS package. |
| **Without installing anything** | `npx --yes --package silver-design-framework@0.9.2 silver setup inspect . --json` | Trying Silver once. Nothing is added to the project. |

After a project or global install, `npx silver setup inspect . --json` runs the
installed copy.

### Copy this prompt into your agent

```text
Use the Silver 0.9 release to inspect setup in this folder. Run:
`npx --yes --package silver-design-framework@0.9.2 silver setup inspect . --json`

Show me the plan and questions before making any changes. Do not run
`npx silver`; that is a different package.
```

If npm's registry is unreachable, the GitHub release archive needs no npm
account or token. Give the agent this exact command instead:

```sh
npx --yes \
  https://github.com/thejparsenault/silver-design-framework/releases/download/v0.9.2/silver-design-framework-0.9.2.tgz \
  setup inspect . --json
```

### If someone shares a Silver project with you

A Silver workspace is a Git repository, and `node_modules/` is not committed. If
you clone one onto a machine that has never had Silver, its commands will tell
you so and point you back here — install by any method above and they start
working. Nothing in the cloned workspace needs to change.

### Which agents work?

Silver is designed for **Codex, Claude Code, and similar local agents** that
can read files in your project, follow project instructions, and run commands
on your Mac. Its core instructions and skills live inside the project, rather
than in one agent provider’s account.

Claude Code is supported directly. Silver adds the small files Claude Code needs
to find the project instructions and skills. Other local agents can use the
same project files, even where Silver does not yet make a custom adapter for
that agent.

Claude Cowork is **not supported yet**, even if the `silver` command is
installed on your Mac. Cowork cannot find Silver’s project skills or read its
project instructions, and it cannot reliably run the local steps Silver uses to
save work and record its checks. It can read and edit ordinary workspace files,
but it cannot reliably run a complete Silver skill.

## What a Silver workspace gives you

Setup can create a complete design home in a single existing product folder, or
a separate design repository linked to one or more code repositories. The
single-folder option is a good starting point for a solo designer or a small
team working on one product.

```text
your-product/
├── AGENTS.md                 Shared instructions for the agent
├── .skills/                  25 project-specific design skills
├── .silver/                  Silver’s setup record, results, and recovery files
├── .claude/                  Extra files Claude Code needs (when applicable)
├── design/
│   ├── product.md            Product, audience, outcomes, and positioning
│   ├── brand.md              Brand foundation
│   ├── voice.md              Voice, terminology, and content guidance
│   ├── system/               Tokens, components, and design-system records
│   ├── work/                 Specifications, concepts, findings, and evaluations
│   ├── evidence/             Research evidence and observations
│   ├── flows/                User and system flows
│   ├── decisions/            Durable decisions and their reasons
│   ├── contexts/             The current design-system and code context
│   └── integrations/         Connections to shared repositories and tools
├── prototypes/               Testable prototypes
├── presentations/            Presentation material
└── production/               Handoffs for implementation
```

| Place | What it is for |
| --- | --- |
| `design/` | The main design record: foundations, working files, evidence, decisions, and design-system files. |
| `design/system/` | The project’s main design system. It can be written here or imported from a shared system. |
| `.skills/` | Instructions the agent follows for each kind of design work. They belong to this project, not to anyone’s personal prompt library. |
| `.silver/` | Silver’s private working area: its setup record, check results, change proposals, and recovery information. |
| `prototypes/`, `presentations/`, `production/` | Prototypes, presentation material, and implementation handoffs that draw on the design record. |

Silver also offers **My Practice**, a separate personal workspace for your own
methods, rubrics, and playbooks. It is visible and editable, but never silently
overrides project facts, required checks, or team guidance.

## Included skills

Skills are independent. Ask an agent to use one skill for one clear piece of
work, review what it produces, and then decide what happens next. Each skill
records what it used, what it made, any checks it ran, and sensible next steps.

| Area | Skills | Use them to |
| --- | --- | --- |
| Foundation | `product`, `brand`, `voice`, `principles` | Define the product, audience, brand, language, and decision tests. |
| Understand | `research`, `collect`, `synthesize`, `map` | Plan research, gather source-linked evidence, turn it into findings, and map the wider experience. |
| Frame and explore | `ideate`, `specify`, `structure`, `flow`, `visualize` | Form problems and hypotheses; make specifications, information architecture, flows, and visual representations. |
| Make | `system`, `theme`, `component`, `prototype` | Maintain tokens and components; make themes, component proposals, and testable prototypes. |
| Learn and improve | `evaluate`, `measure`, `design-check`, `practice-review` | Evaluate work, measure outcomes, run independent checks, and improve your reusable practice. |
| Share and deliver | `pitch`, `implement` | Make an evidence-backed change case and prepare implementation-ready work. |
| Keep work moving | `reconcile`, `what-now` | Review differences with linked sources or external tools, and choose a grounded next action. |

For a first session, ask the agent to use `product`, then `brand`, `voice`, and
`principles`. If you already have a design system, ask it to look at that first
instead of creating a second one.

## Integrating your tools

Every general skill can do useful work with the files in the project. Connecting
another tool adds options; it does not make that tool a hidden requirement for
ordinary design work.

Silver ships with these adapters:

| Adapter | What it is useful for | What you need |
| --- | --- | --- |
| **Silver portable** | Project files, simple web views, flow diagrams, prototypes, presentations, and a record of sources. | Nothing beyond Silver. |
| **Local Chrome / Chromium** | Repeatable checks of a prototype’s layout, accessibility, and interactions. | Chrome or Chromium installed locally. |
| **Figma official MCP** | Reading Figma structure, variables, styles, and components; creating or editing Figma content. | Authorize Figma’s hosted connection when your agent asks. |
| **Figma Console MCP** | Working in the Figma document currently open in the desktop app. | The Console plugin and its MCP server configured in your agent host. |
| **Linked repository adapter** | Importing, comparing, and explicitly exporting selected files from a design-system, component-catalog, or code repository. | A local path to that repository and a reviewed link plan. |

To use another tool, tell the agent where its setup instructions live. Those
instructions might describe an MCP connection, a command-line tool, or an API.
Silver can record the connection and explain whether it is ready, but it does
not guess package names, install software, start background services, or store
passwords and API keys.

### Ask your agent

> **What would Silver use to make a wireframe in this project? Show the tool it
> would use, why it is available, and any setup I still need to do.**

If you or an agent need the underlying commands, they are:

```sh
silver tools . --for "make a wireframe"
silver tools . --list
silver tools . --diagnose figma-official-mcp
```

## Connect a design system, codebase, or Figma

A shared design system or production codebase does not need its own Silver
installation. Connect it as an external source, bring chosen files into your
workspace, and review changes before moving them in either direction.

### Ask your agent

> **I have a shared design system at `../shared-design-system`. Inspect it as a
> linked design-system source for this project. Show me the selected files,
> any files you cannot connect clearly, and the import plan. Do not link,
> import, or change either repository until I approve it.**

For reference, the agent will use commands like these:

```sh
# Ask Silver to make a reviewed plan for a shared design system.
silver link inspect ../shared-design-system . \
  --kind design-system --as shared-system --json

# See whether any linked representations have drifted.
silver sync status --all . --json
```

The `reconcile` skill helps an agent explain what changed—both design-token
changes and ordinary text-file changes—and identifies the right part of the
design process to review it. Nothing changes automatically. An approved export
changes only the files you selected, runs the agreed checks, and never pushes a
Git branch or opens a pull request.

Figma uses the same review model. An agent can read a saved Figma state, prepare
a proposal, make the approved Figma change, then read the result again before
Silver records the new shared state.

## Safety, checks, and recovery

Silver is designed to make an agent’s work understandable and recoverable
without asking you to become a software release engineer.

- You see a plan before setup, linking, updates, migrations, or synchronization
  changes your files.
- Silver refuses to follow file shortcuts that lead outside the project while it
  changes its own files.
- Updates, migrations, and synchronization are prepared before they are applied.
  If a process stops partway through, Silver leaves enough information to safely
  continue or undo the work.
- Checks make an important distinction between a real design problem, a check
  that could not run, and a problem with the browser or checking tool itself.
- Silver records sources, design-system versions, and check results so an agent
  can show you where a result came from.

Useful maintenance commands:

```sh
silver doctor .                         # diagnose; makes no changes
silver check .                          # run applicable local checks
silver update .                         # preview framework updates; makes no changes
silver migrate .                        # preview a migration; makes no changes
silver migrate . --apply                # apply a migration you have reviewed
silver recover .                        # list interrupted changes that can be resumed or undone
silver recover resume <transaction-id> .
silver repair .                         # rebuild disposable indexes/adapters
```

## Current support boundary

Silver 0.9 has signed macOS packages for Apple Silicon and Intel Macs. Windows
and Linux can use the Node.js distribution, but native signed installers for
those platforms are not part of this release.

Silver works best with local file-capable agents. It does not install or manage
credentials for third-party tools, auto-publish work, or replace a team’s review
and version-control practices. External changes are proposals until a person
explicitly accepts them.

## Learn more

- [Silver 0.9 acceptance and support boundary](docs/silver-0.9-acceptance.md)
- [Agent-host compatibility](docs/agent-host-compatibility.md)
- [Tool representations and reconciliation](docs/tool-representations-and-reconciliation.md)
- [Installer and distribution model](docs/installer-distribution.md)
- [Architecture of agentic design workflows](docs/agentic-design-workflows.md)
- [Project status and roadmap](PROJECT.md)

## Contributing

Silver is developed in the open. The source distribution requires Node.js 22 or
later:

```sh
git clone https://github.com/thejparsenault/silver-design-framework.git
cd silver-design-framework
npm install
npm test
```

See [the project documentation](PROJECT.md) and the acceptance material above
for release evidence and the current roadmap.
