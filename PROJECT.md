---
name: The Silver Design Framework
slug: silver-design-framework
stage: exploring
path: /Users/jp/Projects/exploring/silver-design-framework
repo: https://github.com/thejparsenault/silver-design-framework
visibility: private
github_user: thejparsenault
context_budget: small
created: 2026-06-05
updated: 2026-07-24
---

# The Silver Design Framework

## Purpose

Build an agent-neutral framework that helps designers work consistently across codebases, design tools, and product contexts. The framework installs a small set of project-scoped artifacts, skills, checks, recipes, and adapters. It can initialize a blank workspace or adopt an existing product repository without requiring either one to use a particular design system or application stack.

The framework is a meta-system. It defines how a design system and design practice are described, used, checked, and synchronized; it is not itself the design system for every consuming project.

## Desired Outcome

A designer can:

1. Run a setup/update tool in a blank folder or existing repository.
2. Establish discoverable sources of truth for brand, product, voice, design principles, system rules, research, and decisions.
3. Install only the skills and deterministic checks appropriate to that repository.
4. Use agent-supported workflows for brand definition, ideation, flow authoring, theming, prototyping, testing, refinement, and eventual production work.
5. Use configured tools such as Figma or a browser through provider-neutral capabilities and explicit permissions.
6. Constrain generated work to approved semantic styles and components, with explicit prototype-only suspension when desired.
7. Share organization-level guidance across multiple products while allowing product- and codebase-specific components and rules.
8. Run recognizable design skills independently or compose them through optional, resumable playbooks with inspectable artifact handoffs and checkpoints.
9. Build evidence-backed change cases and branded presentation views for team decisions without confusing generated output, stakeholder acceptance, and production readiness.

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

validate

## Next Release

Silver `0.2.0`, working name **Complete Blank-Workspace Suite**, is the next
release target. Its authoritative scope, exclusions, requirement IDs, and
completion evidence are defined in `docs/silver-0.2-acceptance.md`.

Existing-codebase adoption follows this release except for bounded discovery
spikes used to pressure-test framework neutrality.

## Agent Access

- Can edit docs: yes
- Can edit code: ask first
- Can run scripts: ask first
- Can commit: ask first
- Can push: no

## Key Constraints

- Project workflow skills are installed at the lowest useful repository scope, never globally by default.
- User-global configuration contains tool-provider preferences and permission ceilings only; it does not inject workflow context.
- Installed project files are committed and project-owned. Updates arrive as reviewable diffs.
- Daily design work belongs in skills. The CLI is limited to setup, update, repair, migration, and diagnostics.
- Markdown records intent and judgment; structured files define enforceable contracts.
- Design-system constraints are never silently suspended. Suspension is an explicit prototype-only choice by default.
- Process and lifecycle guidance is recommended, not enforced.
- External tools may be authoritative for declared artifact kinds, but production use requires a pinned, validated local representation.
- Skill execution, acceptance, and downstream readiness are separate states.
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
- `docs/silver-0.2-acceptance.md` — authoritative next-release boundary and completion criteria
- `docs/agentic-design-workflows.md` — independent skill, artifact handoff, playbook, result, guardrail, and production-boundary plan
- `docs/pitch-and-presentations.md` — change-case, pitch, presentation-kit, rendering, and presentation-check plan
