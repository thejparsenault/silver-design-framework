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
Status: Accepted

## 2026-06-05 - Code/tokens are authoritative; Figma is a scratchpad

Decision: The token and component definitions in code are the source of truth. Figma will be populated from code (not the reverse), and rough Figma designs will be imported back as scaffolding only.
Reason: Keeping Figma as the source of truth requires manual sync discipline that doesn't hold long-term. Code-authoritative systems are versionable, diffable, and CI-checkable.
Status: Accepted

## 2026-06-05 - Layer terminology: scale, semantic roles, mode, scheme, theme

Decision: Four terms, each with a distinct scope:
- **Scale** — raw token values (neutral-100, blue-500). No semantics.
- **Semantic roles** — named usage slots (--bg-base, --text-primary) that map to scale values.
- **Mode** — a named contextual color palette (default, marketing, info, error, success) that defines which scale values the semantic roles resolve to. Changes tone and intent.
- **Scheme** — the light/dark toggle within a mode (light, dark). Aligns with CSS `prefers-color-scheme`. Same mechanism as modes, different scope.
- **Theme** — brand-level customization; a full override of scale and role definitions for a different project (white-labeling).

Resolved value chain: Mode + Scheme → Semantic roles → Scale values.

Reason: "Theme" and "mode" collide in common usage (dark mode vs. theme = light/dark). "Scheme" is the CSS spec term for light/dark and is unambiguous. Keeping "theme" for brand-level customization leaves all four terms with distinct, non-overlapping meanings.
Status: Accepted

## 2026-06-05 - Delivery model: template repo

Decision: The design system is distributed as a template repo. A new project clones it, runs `npm install && npm run dev`, and has a fully running system immediately. The consumer owns all the files — nothing is a remote dependency.
Reason: The system is foundational and heavily customized per project. Consumers need to own the source, not depend on a remote package. A template repo requires zero publishing infrastructure, is framework-agnostic, and is the most accessible model for a non-technical user. npm package extraction is a future option if a standalone token layer becomes useful, but not the starting point.
Status: Accepted

## 2026-06-05 - Component technology: CSS foundation + HTML/CSS components + optional React layer

Decision: Three tiers:
1. **Foundation** — pure CSS custom properties (scales, semantic roles, modes, schemes). No framework. Importable by anything.
2. **Components** — HTML structure + CSS class definitions (`.btn`, `.card`, `.navbar`) built on the foundation tokens. Vanilla JS for interactive behaviors. Framework-agnostic: apply the right classes to the right elements in any stack.
3. **React package** — thin wrappers around tier 2 with prop interfaces and TypeScript types. Optional, additive, not the primary interface.

Reason: Portability lives in the token and component CSS layers, not in the component framework. Any consuming stack (Astro, Vue, plain HTML, React) can use tiers 1 and 2 directly. The React layer adds convenience for React projects without constraining everyone else.
Status: Accepted

## 2026-06-05 - Agent interface: structured files, not MCP tools

Decision: The agent's interface to the design system is the files in the repo — a well-structured `CLAUDE.md` (or `AGENT.md`) that explains the token system, valid semantic roles, component patterns, and workflow. The conformance checker is a CLI script (`npm run check -- --url <url>`) that agents call via Bash. Figma integration uses the official Figma MCP and is documented as an optional setup step, not bundled into the system.
Reason: An MCP server requires hosting, auth, and infrastructure that adds complexity without proportional benefit. A well-written agent context file achieves the same result — agents can read files and reason about them. The conformance checker as a CLI script is simpler to run, debug, and maintain. Keeping Figma as an optional documented step avoids baking in a dependency on a specific MCP implementation.
Status: Accepted

## 2026-06-15 - Token source format: DTCG 2025.10 + Style Dictionary 4

Decision: All token source files use the W3C Design Tokens Community Group 2025.10 format. Every token has an explicit `$type`, a structured `$value` object (not a CSS syntax string), and a `$description`. Style Dictionary 4 (SD4) is the build tool — it natively accepts DTCG format and transforms tokens to CSS custom properties, Tailwind v4 theme variables, and any future platform outputs. Files use the `.tokens.json` extension.

The CSS syntax string (`oklch(0.55 0.14 250)`) is output from Style Dictionary — it is never the source value. The source for a color is always a structured object:
```json
{ "$type": "color", "$value": { "colorSpace": "oklch", "components": [0.55, 0.14, 250], "hex": "#4361ee" }, "$description": "..." }
```

Reason: DTCG format is tool-portable (Figma Variables, Tokens Studio, Style Dictionary, IDE plugins all read it). SD4 removes the transformation layer that SD3 required for DTCG input. Explicit `$type` and `$description` make token files self-documenting and validatable without separate docs.
Status: Accepted

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
Status: Accepted

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
Status: Accepted

## 2026-06-15 - Distribution: template repo with Tailwind v4 output included

Decision: The template repo delivery model (DECISIONS.md 2026-06-05) stands. In addition, SD4 generates a Tailwind v4 CSS `@theme` block as a standard output alongside the main `ds.css`. This lets consuming projects that use Tailwind reference system tokens as Tailwind theme values without any additional configuration.

The registry model described in the PRD is a future enhancement — a tool that helps seed a new template instance with selected components. It does not change the consumer-owns-all-files model.

Reason: Tailwind v4 output costs nothing to generate from the same SD4 transform pipeline and meaningfully reduces friction for Tailwind-based projects. Clarifying that the registry seeds the template (rather than being a live dependency) resolves the tension between the PRD's registry language and the template-repo decision.
Status: Accepted
