---
name: Design Practice Framework
slug: design-system-base
stage: exploring
path: /Users/jp/Projects/exploring/design-system-base
repo:
visibility: private
github_user: thejparsenault
context_budget: small
created: 2026-06-05
updated: 2026-07-23
---

# Design Practice Framework

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

## First Iteration

Validate one coherent blank-workspace path:

- define the manifest, artifact, skill, tool-permission, and check-result contracts;
- build a setup/update CLI that installs project-local framework files from a pinned release;
- install a small initial skill set for brand, theme, flow, prototype, and conformance work;
- instantiate an editable reference design system and static HTML example;
- demonstrate setup through brand/theme refinement, tool-neutral flow authoring, prototype rendering from that flow, and static checks;
- produce recommended next actions without starting them automatically.

Existing-repository adoption is the next milestone, not part of the first vertical slice.

## Current Phase

build

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

## Historical Work

The repository contains an architecture spike for a portable HTML/CSS design system. That work is no longer the product itself. It will be preserved under `reference-system/` and used as the editable demonstration system for framework validation.

## Primary Documents

- `design_practice_framework_prd.md` — product requirements and first-iteration scope
- `BACKLOG.md` — prioritized functionality beyond the first iteration
- `DECISIONS.md` — accepted and superseded decisions
- `docs/installer-distribution.md` — installer ownership, hosting, release, and configuration recommendation
