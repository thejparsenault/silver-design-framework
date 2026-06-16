---
name: Foundation Design System
slug: design-system-base
stage: exploring
path: /Users/jp/Projects/exploring/design-system-base
repo:
visibility: private
github_user: thejparsenault
context_budget: small
created: 2026-06-05
updated: 2026-06-05
---

# Foundation Design System

## Purpose

Build a portable, customizable design system foundation that future projects can adopt and theme without starting from scratch. It should be opinionated enough to produce coherent results out of the box, but structured so that a small set of high-leverage decisions (key colors, typefaces, tone, context type) dramatically reshapes the outcome.

## Desired Outcome

A design system with the following layers, all internally consistent and browser-renderable for validation:

1. **Foundation** — typographic scale, spacing scale, color ramps (full neutral + accent families), default icon set
2. **Semantic token layer** — maps raw scale values to constrained, named roles (--bg-base, --text-primary, --border-secondary, etc.) with rules about valid usage per context; this is the layer implementers (including agents) work against, not the raw scale
3. **Modes and schemes** — modes are named contextual palettes (default, marketing, info, error, success) that define which scale values the semantic roles resolve to; schemes are the light/dark toggle within each mode. Both are implemented as CSS custom property swaps. Themes are the outermost layer — a full scale + role override for brand-level customization across projects.
4. **Component library** — HTML structure + CSS class definitions built on the semantic layer. Framework-agnostic. Optional React wrappers add prop interfaces for React projects.
5. **Page/screen templates** — browser-renderable pages that demonstrate the system holistically and support mode and scheme toggling via URL parameters (e.g., ?mode=marketing&scheme=dark)
6. **Conformance checker** — a CLI script (`npm run check -- --url <url>`) that loads a page in a browser (Playwright) and checks one dimension at a time (color, typography, spacing). Agents call it via Bash and act on the output.
7. **Figma bridge** — optional setup step using the official Figma MCP. Documented separately. Not required to use the system.

## Current Phase

clarify

## Agent Access

- Can edit docs: yes
- Can edit code: ask first
- Can run scripts: ask first
- Can commit: ask first
- Can push: no

## Notes

- Intended consumers: future new projects; not retrofitting portfolio-site or case-study-exhibits
- The semantic token layer is a first-class constraint system — raw scale values are defined but the valid roles/uses are what implementers (especially agents) work with
- Tailwind's utility approach is a reference point, but the goal here is a constrained menu of choices, not open-ended composition of raw utilities
- Terminology settled: scale → semantic roles → mode (contextual palette) + scheme (light/dark) → resolved values. Theme = brand-level override across projects. See DECISIONS.md.
- Delivery model: template repo. Clone, `npm install`, `npm run dev`. No publishing infrastructure.
- Component technology: CSS foundation (portable) + HTML/CSS components (framework-agnostic) + optional React wrappers. See DECISIONS.md.
- Agent interface: structured files + `CLAUDE.md`. Conformance checker is a CLI script agents call via Bash. No MCP server.
- Figma: optional, documented separately, uses the official Figma MCP.
- Figma will be used as a scratchpad, not a source of truth; the code/token layer is authoritative
