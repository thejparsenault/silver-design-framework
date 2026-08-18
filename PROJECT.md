---
name: The Silver Design Framework
slug: silver-design-framework
stage: exploring
path: /Users/jp/Projects/exploring/silver-design-framework
repo: https://github.com/thejparsenault/silver-design-framework
visibility: public
github_user: thejparsenault
context_budget: small
created: 2026-06-05
updated: 2026-08-17
---

# The Silver Design Framework

## Purpose

Build an agent-neutral framework that helps designers work consistently across codebases, design tools, and product contexts. The framework installs a small set of project-scoped artifacts, skills, checks, recipes, and adapters. It can initialize a blank workspace or adopt an existing product repository without requiring either one to use a particular design system or application stack.

The framework is a meta-system. It defines how a design system and design practice are described, used, checked, and synchronized; it is not itself the design system for every consuming project.

## Desired Outcome

A designer can:

1. Ask a chat agent to inspect and apply a reviewable setup plan in a blank
   folder, existing repository, or separate design repository.
2. Establish discoverable sources of truth for brand, product, voice, design principles, system rules, research, and decisions.
3. Install only the skills and deterministic checks appropriate to that repository.
4. Use agent-supported workflows for brand definition, ideation, flow authoring, theming, prototyping, testing, refinement, and eventual production work.
5. Use configured tools such as Figma or a browser through provider-neutral capabilities and environment-governed authority.
6. Constrain generated work to approved semantic styles and components, with explicit prototype-only suspension when desired.
7. Share organization-level guidance across multiple products while allowing product- and codebase-specific components and rules.
8. Run recognizable design skills independently or compose them through optional, resumable playbooks with inspectable artifact handoffs and checkpoints.
9. Build evidence-backed change cases and branded presentation views for team decisions without confusing generated output, stakeholder acceptance, and production readiness.
10. Complete every general design task through a portable project-local baseline, then optionally bind, render, or synchronize the same revisioned intent through external tools without silent drift.
11. Improve a visible personal practice across products without copying private
    personal paths or overriding required product and company guidance.
12. Trace durable work through its evidence, practice methods, linked guidance,
    design context, external views, acceptance, and local Git checkpoint.
13. Import, compare, and explicitly export selected representations from linked
    repositories or Figma without installing Silver into the external source,
    silently overwriting either side, or leaving lifecycle mutations
    unrecoverably half-applied.

## First Iteration

Validate one coherent blank-workspace path:

- define the manifest, artifact, skill, tool-permission, and check-result contracts;
- build a setup/update CLI that installs project-local framework files from a pinned release;
- install a small initial skill set for brand, theme, flow, prototype, and conformance work;
- instantiate an editable reference design system and static HTML example;
- demonstrate setup through brand/theme refinement, tool-neutral flow authoring, prototype rendering from that flow, and static checks;
- produce recommended next actions without starting them automatically.

Existing-repository adoption is not part of the first vertical slice and
follows the complete blank-workspace suite.

## Current Phase

build

## Latest Release

Silver `0.9.0`, **Meet the Work Where It Is**, is in progress on
`release/silver-0.8-tools`. It extends the provider-selection work into the
repositories, references, design systems, and tools a team already owns:
existing-workspace adoption, declared transport support and diagnosis,
personal tool preferences, external references, a workspace-owned design
system, a reviewable 0.8-to-0.9 migration, symlink-safe managed writes,
recoverable lifecycle transactions, and explicit linked-source/Figma
synchronization.

The release will add signed macOS native CLI delivery for both Apple Silicon
and Intel Macs. Windows and Linux delivery are explicitly deferred.
`docs/silver-0.9-acceptance.md` is the release boundary.

Silver `0.8.0`, **Tools That Are Actually There**, is the previous release.
It made the provider-selection layer real: `resolveCapabilities` no longer
picked alphabetically, transports became distinct ways of reaching a tool, and
each activity resolved through an explicit order and two filters.

Silver `0.7.0`, **One Good Step**, is the previous release. It answers the
22-issue field report from the first real product session: invocations run their
own required checks and record real evidence, a claimed pass without evidence is
not believed, accepted canonical work activates across artifact, manifest,
index, and lock in one checkpoint, an accepted invocation confirms Git can
commit before writing, and generated agent instructions say to run one skill and
stop. Tone became a separate layer — a studio voice set once and overridable in
a personal practice — so skills stay precise and independently upgradeable.
`docs/silver-0.7-acceptance.md` is the release boundary.

Silver `0.6.1` added npm as the primary distribution channel with no behaviour
change; `docs/release-notes/v0.6.1.md` records why the version was bumped rather
than republishing `0.6.0`.

Silver `0.6.0`, **Agent Hosts and Guarded Invocation**, is the substantive
release. It responds to the audit in `docs/silver-0.5-audit.md`.

The release makes an installed workspace able to run its own skills — guarded
invocation now routes through `silver invoke`, with `silver invoke --scaffold`
supplying the mechanical parts of a request — and makes a workspace discoverable
to Claude Code through a generated adapter layer that leaves `.skills/` and
`AGENTS.md` canonical. It also retires the stale skill-catalog generator and the
superseded Python contract validator.

Claude Cowork remains unsupported and is now specified rather than assumed: it
needs a Node-free durable-output path and an uploadable skill package.
Generalized external synchronization and deep existing-codebase adoption remain
following milestones.

Silver `0.5.0`, **Traceable Practice and Context**, is defined in
`docs/silver-0.5-acceptance.md` with evidence in
`docs/silver-0.5-acceptance-audit.md`.

## Agent Access

- Can edit docs: yes
- Can edit code: ask first
- Can run scripts: ask first
- Can commit: ask first
- Can push: no

## Key Constraints

- Project workflow skills are installed at the lowest useful repository scope, never globally by default.
- `.skills/` and `AGENTS.md` are canonical and agent-neutral. Per-host discovery files are generated adapters, are never a prerequisite for running a skill, and can be deleted without breaking the workspace.
- Guarded skill execution routes through the CLI. The workspace lock records the CLI version, never a filesystem path to an installation.
- My Practice is a visible, personal, tool-neutral local Git workspace containing readable overlays and playbooks, not automatically trusted executable skill packages.
- Installed project files are committed and project-owned. Updates arrive as reviewable diffs.
- Daily design work belongs in skills. The CLI is limited to setup, update, repair, migration, and diagnostics.
- Markdown records intent and judgment; structured files define enforceable contracts.
- Design-system constraints are never silently suspended. Suspension is an explicit prototype-only choice by default.
- Process and lifecycle guidance is recommended, not enforced.
- External tools may be authoritative for declared artifact kinds, but production use requires a pinned, validated local representation.
- Company or team guidance is linked manually and never discovered or activated automatically.
- Git/GitHub permissions, repository instructions, branch protection, and the
  agent host determine repository authority; Silver effects support preview and
  audit rather than a second permission intersection.
- Durable visual work pins one or more exact design-context revisions.
- Every generally applicable skill has a useful bundled portable baseline; an external integration adds capability and never silently becomes a prerequisite for unrelated work.
- Canonical artifacts, generated local views, and external views have distinct roles, authority, provenance, and revisions. Drift is reconciled against a shared base rather than resolved by last-write-wins.
- Skill execution, acceptance, and downstream readiness are separate states, and
  "the output was generated" is never reported as "the output was verified".
- A check status is believed only when its evidence exists and agrees. A guarded
  invocation runs its own required checks rather than trusting its caller.
- A skill runs, reports what its checks said, offers next moves, and stops.
  Recipes, implementation profiles, and playbooks are offered, never chosen for
  the designer.
- Accepted canonical status changes are atomic across the artifact, manifest,
  generated index, and lock, and are checkpointed together.
- Every personal preference is authored in My Practice and nowhere else, so it
  applies across workspaces and is committed to none of them. Studio voice and
  method overlays are separate layers from skill packages, and personal
  preference never relaxes project facts, guardrails, or required guidance.
- A designer's options are never narrowed silently. Every transport removed from
  consideration is named, attributed to the availability failure or the project,
  team, organization, or machine policy that removed it, and reported with who
  can lift it. Where a preferred transport is gone, Silver asks rather than
  substituting; where nobody can be asked, it stops with a resumable request.
- An activity's transport is ordered by the designer first, then the project,
  team, and framework default, and filtered by availability and veto. Ordering
  is a preference and belongs to whoever is working; forbidding is a permission
  and belongs to the project, team, or organization.
- Silver declares tools and never installs them. It may detect what is present,
  write an agent host's MCP declaration for an installed tool with approval, and
  print exact commands — never install software, clone or build a repository,
  hold a credential, or launch a background process.
- Silver's knowledge of tools is what it ships plus what the designer tells it.
  There is no discovery of third-party tools and no recommendation Silver cannot
  stand behind; an unrecognized host server is reported as unmapped and never
  used until the designer says what it is for.
- Playbook invocation permits only its declared safe local progression and never broadens external, canonical, production, destructive, or version-control authority.
- Presentation outputs consume canonical brand and design-system artifacts; reusable presentation templates and components remain a distinct project-owned kit.

## Historical Work

The repository contains an architecture spike for a portable HTML/CSS design system. That work is no longer the product itself. It will be preserved under `reference-system/` and used as the editable demonstration system for framework validation.

## Primary Documents

- `silver_design_framework_prd.md` — product requirements and first-iteration scope
- `BACKLOG.md` — prioritized functionality beyond the first iteration
- `DECISIONS.md` — accepted and superseded decisions
- `docs/installer-distribution.md` — installer ownership, hosting, release, and configuration recommendation
- `docs/mvp-acceptance.md` — requirement-by-requirement first-iteration completion evidence
- `docs/silver-0.2-acceptance.md` — completed Complete Blank-Workspace Suite boundary and evidence criteria
- `docs/silver-0.3-acceptance.md` — authoritative Portable Tools and Reconciliation release boundary and completion criteria
- `docs/silver-0.3-acceptance-audit.md` — direct evidence for all 22 Portable Tools and Reconciliation criteria
- `docs/silver-0.5-audit.md` — the 0.5 audit findings that produced 0.6
- `docs/agent-host-compatibility.md` — what each agent host reads, what Silver
  generates for it, and why Cowork is not yet supported
- `docs/traceable-practice-and-context.md` — Silver 0.5 architecture,
  ownership, versioning, backup, authority, and synchronization boundary
- `docs/silver-0.5-acceptance.md` — authoritative Traceable Practice and
  Context release boundary and completion criteria
- `docs/silver-0.5-acceptance-audit.md` — direct Silver 0.5 evidence map
- `docs/tool-representations-and-reconciliation.md` — portable provider, representation, authority, drift, and reconciliation specification
- `docs/agentic-design-workflows.md` — independent skill, artifact handoff, playbook, result, guardrail, and production-boundary plan
- `docs/pitch-and-presentations.md` — change-case, pitch, presentation-kit, rendering, and presentation-check plan
