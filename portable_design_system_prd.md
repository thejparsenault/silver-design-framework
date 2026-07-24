# PRD: Portable Framework-Neutral Design System Foundation

> **Historical document — superseded 2026-07-23.** This PRD describes the design-system architecture spike that preceded [The Silver Design Framework PRD](silver_design_framework_prd.md). Its requirements now apply only to the editable reference system where they remain useful; they no longer define the product represented by this repository.

**Status:** Draft 1  
**Owner:** JP Arsenault  
**Date:** 2026-06-15  
**Working name:** Portable Design System Foundation  
**Primary use cases:** Web apps, static HTML prototypes, lightweight SSR apps, MCP-based app UIs, React apps, and future native mobile adapters.

---

## 1. Executive Summary

This PRD defines a portable, framework-neutral design system intended to serve as the foundation for many different projects. The system should support static HTML/JS output, lightweight server-rendered interfaces, React app generation, Web Component-based interactive widgets, and eventual native mobile token/adaptor outputs.

The system should **not** be built directly on React, shadcn/ui, MUI, Radix, Vite, Bun, or any single application framework. Instead, its source of truth should be:

1. Design tokens.
2. CSS variables and component classes.
3. HTML-first component contracts.
4. Behavior specifications or state machines for complex interactions.
5. Optional adapters for React, Web Components, SSR frameworks, and native platforms.

shadcn/ui should be treated as an **inspiration and distribution model**, not the foundation. The useful parts to borrow from shadcn are open code, copyable components, registry-based distribution, semantic theming, Tailwind-compatible styling, and AI-friendly component installation. The system itself should remain framework-neutral.

---

## 2. Problem Statement

The goal is to avoid rebuilding basic UI foundations for each new project while also avoiding lock-in to React, Next.js, Vite, Bun, or another framework-specific stack.

Current problem patterns:

- Each project tends to recreate basic UI controls from scratch.
- Framework-specific component libraries reduce portability.
- React-first systems are convenient for React apps but awkward for static HTML, native mobile, lightweight SSR, or MCP-delivered UIs.
- Utility-first styling can become inconsistent without component-level governance.
- Design-system components often become overloaded with one-off variants and product-specific behavior.
- AI-generated apps need deterministic, simple, inspectable component contracts.

This system should provide a stable foundation while keeping output targets flexible.

---

## 3. Product Goals

### 3.1 Primary Goals

- Provide a reusable foundation for basic product UI across many projects.
- Keep the system framework-neutral at its core.
- Support plain HTML/CSS output as a first-class target.
- Support React as an adapter target without making React the source of truth.
- Support lightweight SSR and HTML-over-the-wire patterns.
- Support Web Components for behavior-heavy interactive widgets.
- Support future native mobile token/adaptor outputs.
- Enable AI tools to generate valid UI using deterministic component contracts.
- Keep the component set minimal while allowing flexible composition.
- Establish governance rules for variants, overrides, composed components, and product-specific patterns.

### 3.2 Secondary Goals

- Provide a shadcn-like registry or installation model for distributing code, CSS, tokens, docs, and adapters.
- Support theme switching at app, page, section, and component scope.
- Support documentation generation from the same source-of-truth files.
- Support future design-tool integration, especially Figma token workflows.
- Support multiple implementation layers: static HTML, React, Web Components, and native mobile adapters.

---

## 4. Non-Goals

The system should not attempt to be:

- A full enterprise component library on day one.
- A replacement for AG Grid, MUI X Data Grid, or other mature enterprise grid tools.
- A React-first component library.
- A shadcn/ui fork.
- A MUI replacement with equivalent breadth.
- A design-tool plugin as part of the MVP.
- A fully cross-platform native component system in the initial phase.
- A no-code builder.
- A comprehensive app framework.

---

## 5. Core Architectural Principle

The system’s source of truth should be **tokens, CSS, HTML contracts, and behavior specs**, not framework components.

Recommended architecture:

```txt
Design tokens
  ↓
CSS variables / Tailwind theme variables / native token outputs
  ↓
HTML-first component contracts
  ↓
Optional behavior layer
  ↓
Optional framework and native adapters
  ↓
Registry-based distribution
```

Avoid this architecture:

```txt
React components
  ↓
CSS hidden inside React implementation
  ↓
attempt to generate other targets later
```

This prevents the system from becoming trapped inside React assumptions.

---

## 6. Target Users

### 6.1 Primary User

A product designer / design engineer who wants to bootstrap many projects quickly while preserving ownership of design-system logic.

### 6.2 Secondary Users

- Frontend engineers building React, SSR, or static web apps.
- AI agents generating application UIs.
- Designers creating prototypes or product concepts.
- Future native mobile developers consuming token outputs.
- Design-system maintainers enforcing governance and component quality.

---

## 7. Design System Philosophy

### 7.1 Minimal But Flexible

The system should provide a small set of primitives and patterns rather than a huge component inventory.

Core idea:

```txt
Fewer primitives
+ stronger composition rules
+ governed variants
+ documented patterns
= flexible system without component sprawl
```

### 7.2 Primitive vs Pattern

A primitive is a reusable low-level UI building block:

- Button
- Input
- Checkbox
- Dialog
- Popover
- Dropdown menu
- Card
- Badge

A pattern is a recurring product composition:

- Filter bar
- Settings panel
- Empty state
- Split button
- Data table toolbar
- Record detail header
- Confirmation flow
- CRUD form layout

The base primitive layer should stay narrow. Repeated product behaviors should become patterns or composed components rather than bloating primitive APIs.

### 7.3 Source Ownership

The system should own its code and contracts. External libraries may be used for inspiration, build tooling, behavior, or adapters, but the design-system API should remain internally defined.

---

## 8. Must-Have Requirements

### 8.1 Framework Neutrality

The core system must not require React, Vue, Svelte, Next.js, Vite, Bun, or any specific app runtime.

Required outputs:

- `tokens.json`
- `tokens.css`
- `ds.css`
- HTML component examples/contracts
- Component documentation

React and Web Components should be optional consumers of the core system.

### 8.2 Token Source of Truth

The system uses the **W3C Design Tokens Community Group 2025.10 format** as its token source. Style Dictionary 4 (SD4) transforms these source files into CSS custom properties, Tailwind v4 theme variables, and future platform outputs. Files use the `.tokens.json` extension.

**Important distinction:** CSS syntax strings like `oklch(0.55 0.14 250)` are *output* from Style Dictionary. The source value for a color is always a structured object. Tools MUST NOT guess token types from value shape — `$type` must be explicit.

Required token layers:

1. **Primitive tokens** — raw scales: colors, spacing, type sizes, radius, motion durations, shadows.
2. **Semantic tokens** — named usage slots mapped to scale values per mode and scheme (e.g., `surface`, `text`, `border`, `action`, `feedback`).
3. **Component tokens** — component-level values: button height, input padding, card radius, field label spacing.

DTCG field conventions:

- `$type` — required; explicit token type (`color`, `dimension`, `font-family`, `font-weight`, `duration`, `cubic-bezier`, `number`, `typography`, `border`, `shadow`, `gradient`, `transition`)
- `$value` — required; structured object, not a CSS string
- `$description` — required for all tokens; becomes inline docs in Figma, IDE tooling, and generated docs
- `$deprecated` — boolean or explanatory string; marks tokens scheduled for removal
- `$extensions` — vendor namespace for tool-specific metadata (e.g., Figma variable IDs)

Example source token:

```json
{
  "color": {
    "action": {
      "bg": {
        "$type": "color",
        "$description": "Primary action surface — buttons, links, focus rings",
        "$value": {
          "colorSpace": "oklch",
          "components": [0.55, 0.14, 250],
          "hex": "#4361ee"
        }
      }
    }
  }
}
```

Type inheritance: if a group declares `$type`, child tokens inherit it unless overridden. Reduces per-token repetition in the spacing and radius scales.

Composite DTCG types (use these instead of splitting into primitive sub-tokens):

- `typography` — fontFamily, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing
- `border` — color, width, style
- `shadow` — color, offsetX, offsetY, blur, spread (or array for multi-layer shadows)
- `gradient` — array of `{color, position}` stops
- `transition` — duration, delay, timingFunction

Recommended token structure:

```txt
tokens/
  primitive/
    color.tokens.json
    space.tokens.json
    radius.tokens.json
    typography.tokens.json
    motion.tokens.json
    shadow.tokens.json
    z-index.tokens.json
  semantic/
    surface.tokens.json
    text.tokens.json
    border.tokens.json
    action.tokens.json
    feedback.tokens.json
    focus.tokens.json
  component/
    button.tokens.json
    input.tokens.json
    field.tokens.json
    card.tokens.json
    dialog.tokens.json
```

### 8.3 CSS Variable Output

Style Dictionary generates CSS custom properties from the DTCG source. The output — not the source — uses CSS syntax strings.

Scheme switching uses a two-layer approach: `@media (prefers-color-scheme)` establishes the OS default; `[data-scheme]` attributes provide explicit user override. Mode is applied via `[data-mode]`. See DECISIONS.md 2026-06-15.

```css
/* Light default */
:root {
  --ds-color-action-bg: oklch(0.55 0.14 250);
  --ds-color-action-fg: oklch(1 0 0);
  --ds-radius-control: 0.5rem;
  --ds-space-control-x: 1rem;
}

/* OS dark preference */
@media (prefers-color-scheme: dark) {
  :root {
    --ds-color-action-bg: oklch(0.68 0.13 250);
    --ds-color-action-fg: oklch(0.12 0 0);
  }
}

/* Explicit overrides always win */
[data-scheme="light"] { --ds-color-action-bg: oklch(0.55 0.14 250); }
[data-scheme="dark"]  { --ds-color-action-bg: oklch(0.68 0.13 250); }

/* Mode overlay */
[data-mode="marketing"] { --ds-color-action-bg: oklch(0.58 0.18 340); }
```

Where possible, use `@property` declarations for typed custom properties to enable transitions and better devtools inspection:

```css
@property --ds-color-action-bg {
  syntax: "<color>";
  inherits: true;
  initial-value: oklch(0.55 0.14 250);
}
```

Theming must support:

- Global app themes.
- Dark/light modes.
- Section-scoped themes.
- Component-level variable overrides when explicitly approved.

### 8.4 HTML-First Component Contracts

Every core component must have a canonical HTML contract.

Example:

```html
<button class="ds-button" data-variant="primary" data-size="md">
  Save
</button>
```

The contract should define:

- Element type.
- Required classes.
- Supported data attributes.
- Supported states.
- Accessibility expectations.
- Allowed variants.
- Composition rules.
- Examples.
- Anti-patterns.

This contract becomes the stable API across output targets.

### 8.5 Component Classes and Data Attributes

The visual implementation should use semantic CSS classes and data attributes, not framework props as the core representation.

Example:

```css
.ds-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ds-radius-control);
  padding-inline: var(--ds-button-padding-x);
  min-height: var(--ds-button-height-md);
}

.ds-button[data-variant="primary"] {
  background: var(--ds-color-action-bg);
  color: var(--ds-color-action-fg);
}

.ds-button[data-size="sm"] {
  min-height: var(--ds-button-height-sm);
}
```

### 8.6 Native HTML First

The system should use native HTML elements whenever possible.

Preferred mappings:

| Component | Preferred base |
|---|---|
| Button | `<button>` |
| Link button | `<a>` with button styling only when semantically a link |
| Text input | `<input>` |
| Text area | `<textarea>` |
| Checkbox | `<input type="checkbox">` |
| Radio | `<input type="radio">` |
| Select | Native `<select>` unless custom behavior is required |
| Disclosure | `<details>` / `<summary>` when acceptable |
| Dialog | Evaluate native `<dialog>` but test accessibility and UX carefully |

### 8.7 Approved Override Model

The system must avoid arbitrary per-instance styling as the default customization model.

Preferred hierarchy:

```txt
1. Tokens first.
2. Component variants second.
3. Context or usage props/data attributes third.
4. Composed components fourth.
5. One-off classes last and review-required.
```

Example approved HTML adjustment:

```html
<button class="ds-button" data-variant="primary" data-layout="full-width">
  Continue
</button>
```

Example React adapter:

```tsx
<Button variant="primary" layout="fullWidth">
  Continue
</Button>
```

Avoid:

```tsx
<Button className="bg-[#4361ee] rounded-[7px] px-[18px]" />
```

### 8.8 Composed Component Model

New interaction patterns should become composed components rather than overloading primitives.

Example: a primary action button with dropdown alternatives should become `SplitButton`, not a `Button` variant.

```txt
Primitive:
  Button

Primitive:
  DropdownMenu

Composed component:
  SplitButton
```

The `Button` primitive should not accumulate API flags like:

```tsx
<Button dropdown split menuPlacement="bottom-end" actions={...} />
```

Preferred:

```tsx
<SplitButton
  primaryAction={{ label: "Save", onSelect: save }}
  actions={[...]}
/>
```

### 8.9 React Adapter

The system must support React generation as an adapter target.

React components should:

- Import core CSS.
- Emit canonical HTML/data attributes.
- Provide typed semantic props.
- Avoid becoming the design-system source of truth.

Example:

```tsx
type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost" | "destructive"
  size?: "sm" | "md" | "lg"
  layout?: "default" | "fullWidth"
} & React.ButtonHTMLAttributes<HTMLButtonElement>

export function Button({
  variant = "primary",
  size = "md",
  layout = "default",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={["ds-button", className].filter(Boolean).join(" ")}
      data-variant={variant}
      data-size={size}
      data-layout={layout}
      {...props}
    />
  )
}
```

### 8.10 Documentation

Each component must include:

- Purpose.
- Anatomy.
- HTML contract.
- React adapter example where applicable.
- Supported variants.
- Accessibility notes.
- Theming notes.
- Usage guidance.
- Anti-patterns.
- Related patterns.

### 8.11 AI Generation Rules

The system must include a machine-readable and human-readable guide for AI-generated UI.

The guide should specify:

- Which components exist.
- Which classes and data attributes are allowed.
- Which component states are valid.
- Which one-off styling patterns are prohibited.
- How to compose common layouts.
- How to choose between primitive, pattern, and local component.
- How to generate React wrappers, static HTML, and SSR templates.

---

## 9. Optional Requirements

### 9.1 Web Components Layer

Use Web Components selectively for behavior-heavy widgets that should work across static HTML, SSR, and framework apps.

Good candidates:

- Tooltip
- Popover
- Dropdown menu
- Dialog
- Toast
- Tabs
- Combobox
- Date picker
- Command menu

Less necessary as Web Components:

- Button
- Input
- Card
- Badge
- Divider
- Stack
- Heading

### 9.2 Behavior State Machines

For complex components, consider a behavior-first architecture using state machines or behavior specs.

Candidate technology: Zag.js.

Useful for:

- Menu
- Combobox
- Select
- Dialog
- Popover
- Tabs
- Toast
- Slider
- Tree view
- Date picker

This may provide better framework portability than React-specific primitives.

### 9.3 Static Site / Docs Generator

Use a static output pipeline for docs, examples, and AI-readable contract previews.

Candidate technologies:

- Eleventy
- Eleventy WebC
- Astro, if a more app-like docs environment is needed
- Plain HTML generation scripts

The docs system should not become a required runtime for consuming the design system.

### 9.4 Lightweight SSR / HTML-over-the-Wire Support

Support lightweight server-rendered applications by ensuring components work as plain HTML plus CSS.

Candidate technologies to reference:

- htmx for HTML-over-the-wire interactivity.
- Alpine.js for small local behavior.
- Server templates in Rails, Laravel, Django, Go, Node, or other environments.

The system should not require these technologies, but should be compatible with them.

### 9.5 Native Mobile Token Outputs

Future phases may export tokens to:

- Swift / SwiftUI
- Android XML
- Jetpack Compose constants
- React Native tokens

Native components are out of scope for MVP, but token outputs should be planned early.

### 9.6 Registry-Based Distribution

The registry is a future tool that seeds new instances of the template repo. A project runs an install command that copies selected components, tokens, CSS, and contracts into the new repo. After that, the consumer owns all files — the registry is an install-time tool, not a live dependency. See DECISIONS.md 2026-06-15.

Registry items should be able to distribute:

- CSS files
- Token files
- HTML contracts
- React components
- Web Components
- Docs
- AI rules
- Example scaffolds

### 9.7 Conformance Checker

The conformance checker is a CLI script (`npm run check -- --url <url>`) that loads a page in a headless browser (Playwright) and validates one dimension at a time. Agents call it via Bash and act on the output.

What the checker validates:

- All color values on the page resolve to known semantic token variables (no raw hex, rgb, or arbitrary oklch strings).
- All spacing values resolve to system space tokens.
- All font sizes and weights resolve to system typography tokens.
- Component classes used match the known component contract (no unlisted data-attribute values).
- Escape-hatch classes (`ds-escape`) are flagged as warnings, not errors.

Output format: a structured list of violations (error level, element, property, value found, expected token) suitable for agent consumption.

CI integration: can be run as a check against the examples directory. Failures block merge.

---

## 10. Recommended Repository Structure

```txt
portable-design-system/
  README.md
  package.json

  tokens/
    primitive/
      color.json
      space.json
      radius.json
      typography.json
      motion.json
      shadow.json
    semantic/
      surface.json
      text.json
      border.json
      action.json
      feedback.json
    component/
      button.json
      input.json
      field.json
      card.json
      dialog.json

  packages/
    tokens/
      src/
      dist/
        tokens.json
        tokens.css

    css/
      src/
        reset.css
        tokens.css
        base.css
        utilities.css
        components.css
        themes.css
      dist/
        ds.css

    html-contracts/
      button.md
      input.md
      field.md
      card.md
      dialog.md
      split-button.md

    react/
      src/
        button.tsx
        input.tsx
        field.tsx
        card.tsx
        dialog.tsx
        split-button.tsx
        index.ts

    web-components/
      src/
        ds-popover.ts
        ds-dropdown-menu.ts
        ds-dialog.ts
        ds-tooltip.ts

    behavior/
      src/
        menu.machine.ts
        dialog.machine.ts
        combobox.machine.ts

    registry/
      registry.json
      button.json
      input.json
      field.json
      split-button.json

  docs/
    foundations/
    components/
    patterns/
    accessibility/
    ai-generation-rules/

  examples/
    static-html/
    react-app/
    lightweight-ssr/
    web-components/
```

---

## 11. Component Inventory

### 11.1 MVP Components

Foundational components:

- Button
- Link
- Text input
- Textarea
- Checkbox
- Radio
- Native select
- Field / Form field
- Label
- Helper text
- Error text
- Card
- Badge
- Alert
- Divider
- Stack
- Inline
- Container
- Heading / Text styles
- Icon slot conventions

### 11.2 Early Pattern Components

- Empty state
- Form section
- Settings panel
- Page header
- Action row
- Button group
- Split button
- Filter bar
- Simple table
- Toolbar

### 11.3 Later Interactive Components

- Dialog
- Dropdown menu
- Popover
- Tooltip
- Tabs
- Toast
- Combobox
- Command menu
- Date picker
- Data table pattern

### 11.4 Explicitly Deferred

- Enterprise data grid
- Rich text editor
- Calendar/scheduler
- Kanban board
- Drag-and-drop builder
- Charts
- Complex tree view
- Spreadsheet-like editing

---

## 12. Data Table and CRM Use Cases

The system should include a simple table and data-table pattern, but it should not attempt to replace a mature grid library initially.

For CRM-style products with many records, filtering, sorting, pagination, row selection, and bulk actions, recommended architecture:

```txt
Server-rendered shell
  +
Server-side data queries
  +
Client-side data grid island
  +
URL-driven table state
```

The design system should own:

- Table shell styles.
- Filter bar pattern.
- Empty state.
- Pagination controls.
- Row action menu pattern.
- Selection affordances.
- Toolbar pattern.
- Loading and error states.

The design system should not initially own:

- Full enterprise grid behavior.
- Column virtualization.
- Spreadsheet-like editing.
- Advanced row grouping.
- Complex pivoting.

Candidate technologies for advanced grids:

- TanStack Table for headless table logic.
- TanStack Virtual for virtualized rendering.
- AG Grid for enterprise-grade data grids.
- MUI X Data Grid where a mature out-of-the-box grid is more important than full ownership.

Security note: because table tooling can involve large dependency trees, dependency governance must include lockfiles, advisories, and supply-chain review.

---

## 13. Theming Model

### 13.1 Terminology

The system uses four distinct terms (see DECISIONS.md 2026-06-05):

| Term | Scope | Example |
|---|---|---|
| **Scale** | Raw token values | `neutral-100`, `blue-500` |
| **Semantic roles** | Named usage slots | `--ds-surface-page`, `--ds-text-primary` |
| **Mode** | Contextual color palette | `default`, `marketing`, `info`, `error`, `success` |
| **Scheme** | Light/dark toggle within a mode | `light`, `dark` |
| **Theme** | Brand-level full override | White-label project |

### 13.2 Theming Levels

The system supports theming at multiple scopes:

1. Scheme (light/dark) — via OS preference and `[data-scheme]` attribute.
2. Mode (contextual palette) — via `[data-mode]` attribute.
3. Brand theme — a full scale + role override for a different project.
4. Section-scoped overrides — `[data-mode]` or `[data-scheme]` on any ancestor element.
5. Component-scoped — approved CSS variable overrides only.

```html
<body data-scheme="light" data-mode="default">
  <section data-mode="marketing">
    <button class="ds-button" data-variant="primary">Start</button>
  </section>
</body>
```

### 13.3 CSS Variable Strategy

Semantic variables are the public styling API. Component CSS consumes semantic variables; it never references raw primitive values directly.

```css
:root {
  --ds-surface-page: oklch(1 0 0);
  --ds-surface-card: oklch(0.97 0 0);
  --ds-text-primary: oklch(0.15 0 0);
  --ds-text-muted: oklch(0.45 0 0);
  --ds-border-default: oklch(0.85 0 0);
  --ds-action-primary-bg: oklch(0.55 0.14 250);
  --ds-action-primary-fg: oklch(1 0 0);
}
```

Scheme switching (see DECISIONS.md 2026-06-15): `@media (prefers-color-scheme: dark)` sets the default; `[data-scheme]` attributes provide explicit override and always win.

### 13.4 CSS Cascade Layers

All system CSS is organized into named cascade layers (see DECISIONS.md 2026-06-15):

```css
@layer reset, tokens, base, components, utilities;
```

This makes the override governance model (tokens first, one-off classes last) enforced by the browser. The `utilities` layer is intentionally last — escape-hatch classes placed here win over component styles without specificity tricks.

### 13.5 Derived States via color-mix()

For hover, active, and disabled states, prefer `color-mix()` over separate tokens. This keeps the token count low while staying within the system:

```css
.ds-button:hover {
  background: color-mix(in oklch, var(--ds-action-primary-bg), white 15%);
}

.ds-button:active {
  background: color-mix(in oklch, var(--ds-action-primary-bg), black 10%);
}

.ds-button:disabled {
  background: color-mix(in oklch, var(--ds-action-primary-bg), transparent 60%);
}
```

Separate `*-hover` and `*-active` tokens are discouraged unless a design requires a specific value that `color-mix()` cannot produce.

### 13.6 Tailwind v4 Compatibility

SD4 generates a Tailwind v4 `@theme` block as a standard output alongside `ds.css`. Projects using Tailwind can reference system tokens as theme values with no extra configuration. Arbitrary Tailwind classes (`bg-[#4361ee]`, `rounded-[7px]`) remain prohibited in canonical component contracts.

```css
/* generated: tailwind-theme.css */
@theme {
  --color-action-primary: oklch(0.55 0.14 250);
  --spacing-control-x: 1rem;
  --radius-control: 0.5rem;
}
```

---

## 14. Override and Variant Governance

### 14.1 Variant Definition Rule

A variant should be added only when it represents a reusable, semantically meaningful state or role.

Good variants:

```txt
variant="primary"
variant="secondary"
variant="ghost"
variant="destructive"
size="sm | md | lg"
layout="default | full-width"
```

Bad variants:

```txt
variant="blue"
variant="extra-padding"
variant="dashboard-special"
variant="temporary"
```

### 14.2 Usage/Context Rule

If a component needs an adjustment only in a known recurring context, use a context or usage attribute.

Example:

```html
<button class="ds-button" data-usage="table-row-action">Edit</button>
```

This is allowed only when the usage is documented as a system pattern.

### 14.3 Composed Component Rule

If a requirement adds structure, state, accessibility behavior, or multiple interaction targets, create a composed component.

Examples:

| Requirement | Decision |
|---|---|
| Full-width button | Button layout variant |
| Toolbar-sized button | Button usage/context variant |
| Button with alternate actions dropdown | SplitButton composed component |
| Button with tooltip | IconButtonWithTooltip pattern or composition |
| Save button with app-specific analytics | Product-specific wrapper, not core Button |
| Table row action menu | RowActions pattern |

### 14.4 Escape Hatch Rule

Arbitrary classes should be allowed only as a deliberate escape hatch.

Allowed with review:

```tsx
<Button className="my-product-layout-hook" />
```

Disallowed in system usage:

```tsx
<Button className="bg-blue-600 rounded-[7px] px-[18px]" />
```

---

## 15. React Adapter Requirements

React should be supported as a first-class adapter target.

### 15.1 React Package Goals

The React package should:

- Provide typed props.
- Emit canonical HTML classes and data attributes.
- Import or require the core CSS package.
- Wrap Web Components where useful.
- Avoid duplicating visual logic already expressed in CSS.
- Avoid becoming the canonical source of truth.

### 15.2 React Package Example

```txt
packages/react/
  src/
    button.tsx
    input.tsx
    field.tsx
    card.tsx
    split-button.tsx
    index.ts
```

Example usage:

```tsx
import "@portable-ds/css/ds.css"
import { Button, Field, Input } from "@portable-ds/react"

export function Example() {
  return (
    <Field label="Email" hint="Use your work email.">
      <Input type="email" />
      <Button variant="primary">Continue</Button>
    </Field>
  )
}
```

### 15.3 React + Web Components

For complex widgets implemented as Web Components, provide React wrappers when needed.

Candidate tooling:

- `@lit/react` for wrapping Lit custom elements.
- Direct custom element usage in React 19+ where appropriate.

---

## 16. Web Components Requirements

Web Components should be optional and used selectively.

### 16.1 When to Use Web Components

Use Web Components when:

- The component has significant interaction behavior.
- The component must work across plain HTML, SSR, and framework apps.
- The component benefits from encapsulated logic.
- A framework-specific implementation would duplicate too much behavior.

### 16.2 When Not to Use Web Components

Avoid Web Components for simple components that can be expressed with HTML/CSS contracts:

- Button
- Badge
- Card
- Divider
- Stack
- Text
- Basic input

### 16.3 Shadow DOM Decision

Open question: whether Web Components should use Shadow DOM.

Tradeoff:

- Shadow DOM improves encapsulation.
- Shadow DOM can complicate theming, global CSS, form integration, and styling from host apps.

Default recommendation for early phase:

- Prefer light DOM or minimal Shadow DOM until the theming/styling model is validated.

---

## 17. Accessibility Requirements

The system must include accessibility requirements at the contract level.

Each component should specify:

- Semantic element requirements.
- Keyboard interactions.
- Focus management.
- ARIA usage only when native semantics are insufficient.
- Disabled states.
- Error states.
- Required labeling patterns.
- Color contrast expectations.
- Motion-reduction expectations.

Accessibility should be tested in:

- Static HTML examples.
- React adapter examples.
- Web Component examples.
- SSR examples where relevant.

---

## 18. Distribution Model

### 18.1 Package Outputs

Initial package outputs:

```txt
@portable-ds/tokens
@portable-ds/css
@portable-ds/react
@portable-ds/web-components
@portable-ds/contracts
```

### 18.2 Registry Model

Create a registry inspired by shadcn’s model.

Registry items should be able to distribute:

- CSS files.
- Token files.
- HTML contracts.
- React components.
- Web Components.
- Docs.
- AI rules.
- Example scaffolds.

The registry should allow selective installation.

Example registry item:

```json
{
  "name": "button",
  "type": "component",
  "files": [
    "packages/css/src/components/button.css",
    "packages/html-contracts/button.md",
    "packages/react/src/button.tsx"
  ],
  "dependencies": [],
  "tokens": ["button", "action", "radius", "space"]
}
```

### 18.3 Versioning

Use semantic versioning across packages.

Breaking changes include:

- Removing a token.
- Renaming a token.
- Removing a class.
- Changing a component contract.
- Changing required markup.
- Removing a supported variant.
- Changing a React prop name.

Non-breaking changes include:

- Adding optional tokens.
- Adding new variants.
- Adding docs.
- Adding examples.
- Adding adapter support.

---

## 19. Development Phases

### Phase 0: Architecture Spike

Objective: validate the core architecture with one or two components.

Deliverables:

- Token format decision.
- CSS variable naming convention.
- Button contract.
- Input/Field contract.
- Static HTML example.
- React wrapper example.
- Basic docs page.

Success criteria:

- Button and Field render correctly in plain HTML.
- Same contract can be consumed from React.
- Theme variables can be overridden at root and section scope.
- No React runtime is required for static output.

### Phase 1: MVP Foundation

Objective: build a usable minimal system.

Deliverables:

- Token packages.
- Core CSS package.
- MVP component contracts.
- Static HTML examples.
- React adapter for MVP components.
- Basic documentation.
- AI generation rules.

MVP components:

- Button
- Input
- Textarea
- Checkbox
- Radio
- Select
- Field
- Card
- Badge
- Alert
- Divider
- Stack
- Inline
- Text/Heading styles

Success criteria:

- Can build a simple form page in static HTML.
- Can build the same form page in React.
- Can switch themes via CSS variables.
- AI can generate valid component markup using docs.

### Phase 2: Patterns and Governance

Objective: make the system useful for real product surfaces.

Deliverables:

- Pattern documentation.
- SplitButton.
- EmptyState.
- PageHeader.
- SettingsPanel.
- FilterBar.
- SimpleTable.
- Toolbar.
- Component intake checklist.
- Variant governance rules.
- Contribution guidelines.

Success criteria:

- Can build a basic dashboard or CRM-style page.
- Can support common product screens without adding many primitives.
- New component proposals can be evaluated consistently.

### Phase 3: Interactive Components

Objective: add portable behavior-heavy widgets.

Deliverables:

- Dialog.
- Dropdown menu.
- Popover.
- Tooltip.
- Tabs.
- Toast.
- Initial Web Component strategy.
- Optional Zag.js spike.
- React wrappers for interactive widgets.

Success criteria:

- Interactive widgets work in static HTML examples where feasible.
- Interactive widgets work in React apps.
- Accessibility expectations are documented and tested.
- The team has a clear decision on vanilla Web Components vs Lit vs Zag for complex behavior.

### Phase 4: Distribution and Registry

Objective: make the system easy to install into multiple projects.

Deliverables:

- Registry schema.
- Install scripts.
- Example project scaffolds.
- Versioned packages.
- Changelog process.
- Update/merge guidance.

Success criteria:

- A project can install only tokens + CSS.
- A project can install React adapters.
- A project can install selected components/patterns.
- Updates are trackable and reviewable.

### Phase 5: Native and Advanced Targets

Objective: expand beyond web-first outputs.

Deliverables:

- iOS token output.
- Android token output.
- React Native token output, if needed.
- Native component feasibility study.
- Advanced data-table strategy.
- MCP UI delivery example.

Success criteria:

- Tokens can be consumed in native prototypes.
- A lightweight SSR/MCP app can use the same CSS/HTML contracts.
- Advanced app surfaces can be built without rewriting the system.

---

## 20. Tech Stack References

### 20.1 Core Recommended Stack

| Layer | Recommendation | Role |
|---|---|---|
| Token format | DTCG 2025.10 (`.tokens.json`) | Portable token source of truth; tool-interoperable |
| Token build | Style Dictionary 4 (SD4) | Natively accepts DTCG; exports CSS, Tailwind, native |
| Styling | CSS variables + plain CSS component classes | Framework-neutral visual layer |
| Utility compatibility | Tailwind v4 theme variables | Optional utility layer and authoring reference |
| Component contracts | Markdown + JSON schema | Human/AI-readable component API |
| Static docs | Eleventy / WebC / simple static generator | Docs and static examples |
| React adapter | Thin React wrappers | React app generation target |
| Web Components | Lit or vanilla custom elements | Portable interactive widgets |
| Behavior | Zag.js spike | Framework-neutral interaction logic |
| SSR/light interactivity | htmx / Alpine.js compatibility | Lightweight server-rendered apps |
| Registry | shadcn-inspired custom registry | Selective distribution |

### 20.2 Technologies to Reference, Not Necessarily Adopt

- shadcn/ui: open code, registry, component ownership, Tailwind/CSS-variable theming.
- Radix: accessible interaction primitive model, but React-specific.
- Base UI: unstyled accessible React primitives.
- Ark UI: multi-framework headless components.
- Zag.js: framework-neutral state machines for accessible UI behavior.
- Lit: Web Component authoring and React wrappers.
- Web Awesome / Shoelace: framework-agnostic Web Component library model.
- Tailwind v4: theme variables and utility authoring model.
- Style Dictionary: multi-platform token export.
- Eleventy WebC: HTML-first component/documentation generation.
- htmx: HTML-over-the-wire application behavior.
- Alpine.js: lightweight declarative local behavior.
- Mitosis: possible future cross-framework component generation experiment.
- TanStack Table / Virtual / Query: optional headless data/table tooling for React-heavy or advanced web apps.
- AG Grid / MUI X Data Grid: optional enterprise data-grid escape hatches.

---

## 21. Build and Tooling Requirements

The published outputs must not require a runtime build tool.

Allowed development-time tooling:

- Node-based token builds.
- CSS processing.
- TypeScript builds for React/Web Component packages.
- Static docs generation.
- Package bundling where needed.

Required published outputs:

- Plain CSS.
- Plain JSON tokens.
- Plain HTML examples.
- ESM where JavaScript is needed.
- Optional React package.
- Optional Web Component package.

The system should work in a static HTML page by linking a CSS file:

```html
<link rel="stylesheet" href="/ds.css" />
```

---

## 22. Security and Dependency Governance

The system should minimize runtime dependencies in the core.

Core package dependency posture:

- Tokens: no runtime dependency.
- CSS: no runtime dependency.
- HTML contracts: no runtime dependency.
- React adapter: React peer dependency only.
- Web Components: minimal runtime dependency, if using Lit.
- Behavior layer: isolated dependencies, reviewed per component.

Governance requirements:

- Use lockfiles.
- Pin critical dependencies.
- Review dependency updates.
- Monitor advisories.
- Keep build tooling isolated from runtime output.
- Avoid pulling large dependency trees into the core CSS/HTML layer.
- Document third-party dependency usage per package.

---

## 23. Success Metrics

### 23.1 MVP Success Metrics

- A static HTML prototype can be built using only `ds.css` and component contracts.
- A React app can use the same system through thin wrappers.
- At least two themes can be applied without changing component markup.
- AI can generate a valid form page using the system docs.
- No React runtime is required for static output.
- Component variants remain minimal and documented.

### 23.2 Longer-Term Success Metrics

- Same tokens can output to CSS and at least one native/mobile format.
- Multiple projects can consume the system without forking component logic.
- New components can be reviewed through a documented intake process.
- Complex interactive widgets can be shared across static/SSR/React contexts.
- Design and code remain aligned through token and contract documentation.
- Projects can install only the system pieces they need.

---

## 24. Risks

### 24.1 Over-Engineering Risk

Trying to support every platform too early may slow down the MVP.

Mitigation:

- Start with tokens, CSS, HTML contracts, static examples, and thin React wrappers.
- Defer native mobile and complex behavior until the foundation is proven.

### 24.2 Web Component Complexity

Web Components can introduce styling, Shadow DOM, event, and form-integration complexity.

Mitigation:

- Use Web Components selectively.
- Avoid Web Components for simple CSS-only primitives.
- Test with static HTML, React, and SSR examples before committing broadly.

### 24.3 Variant Sprawl

The system may accumulate too many component variants.

Mitigation:

- Add variants only when semantically justified.
- Move repeated compositions into patterns.
- Require component intake review.

### 24.4 Tailwind Class Soup

Tailwind-compatible styling may lead to arbitrary utilities at call sites.

Mitigation:

- Make semantic classes/data attributes the canonical API.
- Treat Tailwind as optional authoring/utility support.
- Prohibit arbitrary color/spacing/radius classes in system components.

### 24.5 React Adapter Drift

The React adapter may become the de facto source of truth.

Mitigation:

- Generate or validate React components against HTML contracts.
- Keep visual logic in CSS.
- Keep tokens outside React.

### 24.6 Dependency Risk

Advanced behavior/table libraries may introduce supply-chain and maintenance risks.

Mitigation:

- Keep core dependency-light.
- Isolate optional dependencies by package.
- Use lockfiles, advisories, and review gates.

---

## 25. Open Questions

### 25.1 Token Format

- Should the initial token files strictly follow the Design Tokens Community Group format, or use a simpler internal structure with later conversion?
- How much component-token detail is needed in MVP?

### 25.2 CSS Naming

- Should class names use `ds-`, a project-specific prefix, or a configurable prefix?
- Should component classes use BEM-like subparts such as `.ds-field__label`, or data attributes and direct child classes?

### 25.3 Tailwind Role

- Should Tailwind be used only for generation/authoring, or should Tailwind utility classes be part of the public API?
- Should Tailwind v4 theme variables be generated directly from tokens?

### 25.4 Web Components

- Should Web Components use Lit or vanilla custom elements?
- Should components use Shadow DOM, light DOM, or a hybrid strategy?
- Which components justify Web Components in the first interactive phase?

### 25.5 Behavior Layer

- Should complex interactions use Zag.js, custom state machines, Web Component-local logic, or per-adapter implementations?
- How much accessibility behavior should be owned directly versus delegated to third-party libraries?

### 25.6 React Adapter

- Should React components be handwritten, generated from contracts, or partially generated?
- Should React adapters expose `className` by default?
- Should React adapters wrap Web Components for complex widgets or implement native React versions?

### 25.7 Registry

- Should the registry follow shadcn’s schema or define a custom schema?
- Should installation copy code into consuming projects, install packages, or support both?
- How should updates be diffed and reviewed?

### 25.8 Native Mobile

- Which native target matters first: SwiftUI, Android Compose, React Native, or something else?
- Are native outputs limited to tokens at first, or should component contracts map to native components?

### 25.9 Documentation

- Should docs be static HTML, MDX, Storybook, WebC, Astro, or another tool?
- Should docs include live editable examples?
- Should docs be optimized for human designers, engineers, or AI agents first?

---

## 26. Initial Acceptance Criteria

The MVP can be considered successful when the following are true:

1. A plain HTML page can use the system with only CSS and semantic markup.
2. A React app can use the same system through typed wrapper components.
3. The same tokens power static HTML and React examples.
4. Theming works through CSS variables without changing component markup.
5. The system includes at least 10 MVP components.
6. Each MVP component has documentation, examples, supported variants, and anti-patterns.
7. AI generation rules are sufficient to generate a valid form page and dashboard shell.
8. Arbitrary one-off styling is clearly identified as an escape hatch, not the normal override mechanism.
9. The system can be distributed as files/packages without requiring a specific app framework.
10. There is a documented decision path for adding variants, composed components, and patterns.

---

## 27. Recommended First Implementation Slice

Build the smallest vertical slice that proves the architecture:

```txt
Tokens:
  color, space, radius, typography

CSS:
  tokens.css, base.css, components/button.css, components/field.css

HTML contracts:
  Button, Field, Input

Examples:
  static login form
  React login form
  themed section demo

Docs:
  Button docs
  Field docs
  Theming docs
  AI generation rules
```

This slice should answer the most important architectural questions before expanding into interactive components.

---

## 28. Reference Links

These are reference technologies and documentation sources to review during implementation:

- shadcn/ui docs: https://ui.shadcn.com/docs
- shadcn registry docs: https://ui.shadcn.com/docs/registry
- shadcn components.json docs: https://ui.shadcn.com/docs/components-json
- Style Dictionary: https://styledictionary.com/
- Tailwind theme variables: https://tailwindcss.com/docs/theme
- Tailwind v4 announcement: https://tailwindcss.com/blog/tailwindcss-v4
- Lit: https://lit.dev/
- Lit React wrappers: https://lit.dev/docs/frameworks/react/
- Web Components overview: https://developer.mozilla.org/en-US/docs/Web/API/Web_components
- Zag.js: https://zagjs.com/
- Ark UI: https://ark-ui.com/
- Radix Primitives: https://www.radix-ui.com/primitives
- Base UI: https://base-ui.com/
- htmx: https://htmx.org/docs/
- Alpine.js: https://alpinejs.dev/
- Eleventy WebC: https://github.com/11ty/webc
- Mitosis: https://github.com/BuilderIO/mitosis
- TanStack Table: https://tanstack.com/table/latest
- TanStack Virtual: https://tanstack.com/virtual/latest
- AG Grid: https://www.ag-grid.com/
- MUI X Data Grid: https://mui.com/x/react-data-grid/

---

## 29. Decision Summary

Recommended path:

```txt
Do:
  Build a framework-neutral system from tokens, CSS variables, HTML contracts, and behavior specs.
  Add React as a thin adapter.
  Use Web Components only where cross-framework interactive behavior is worth the complexity.
  Borrow shadcn’s distribution philosophy, not its React-first component implementation.
  Keep primitive components minimal and move recurring product needs into patterns.

Do not:
  Make shadcn/ui the foundation.
  Make React the source of truth.
  Let Tailwind one-off classes become the override model.
  Build an enterprise grid from scratch in the MVP.
  Add variants for every product-specific exception.
```

The clean thesis:

> Build a framework-neutral design system whose source of truth is tokens, CSS, HTML contracts, and behavior specs. Then generate or wrap those into React, Web Components, static HTML, SSR views, and native mobile targets as needed.
