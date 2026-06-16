# Tasks

## Now

- [ ] Run `npm install && npm run build` — verify SD4 compiles token files, inspect generated tokens.css
  - type: build
  - priority: high
  - energy: low
  - context: small
  - notes: Validates the DTCG source → Style Dictionary 4 → CSS custom properties pipeline. Fix any SD4 transform issues before building more tokens.

- [ ] Open examples/static-html/login-form.html in a browser — validate Phase 0 end-to-end
  - type: build
  - priority: high
  - energy: low
  - context: small
  - notes: Check: tokens.css custom properties load, light/dark toggle works via [data-scheme] attribute, button and field components render correctly.

## Next — Phase 1 Components

- [ ] Card component — CSS + HTML contract
  - type: build
  - priority: high
  - energy: medium
  - context: small

- [ ] Badge component — CSS + HTML contract
  - type: build
  - priority: medium
  - energy: low
  - context: small

- [ ] Alert component — CSS + HTML contract
  - type: build
  - priority: medium
  - energy: medium
  - context: small
  - notes: Use feedback tokens (danger/success/warning/info). Test all four states.

- [ ] Checkbox and Radio — CSS + HTML contract
  - type: build
  - priority: medium
  - energy: medium
  - context: small
  - notes: Native <input type="checkbox|radio"> with custom appearance via CSS. No JS.

- [ ] Select — CSS + HTML contract
  - type: build
  - priority: medium
  - energy: medium
  - context: small
  - notes: Native <select> styled. Custom select (Combobox) is Phase 3.

- [ ] Divider, Stack, Inline, Container layout components
  - type: build
  - priority: low
  - energy: low
  - context: small
  - notes: Mostly CSS utility classes — low effort, high reuse.

- [ ] Research icon set options
  - type: research
  - priority: low
  - energy: low
  - context: small
  - notes: Evaluate Lucide, Phosphor, Heroicons for portability. Should be subsettable, SVG-based.

## Later

- [ ] Design browser-renderable page templates
  - type: design
  - priority: medium
  - energy: high
  - context: small
  - notes: Templates render the system holistically. Must support ?mode=X&scheme=Y via URL parameters. Used for visual validation and as targets for the conformance checker.

- [ ] Design the conformance checker workflow
  - type: design
  - priority: medium
  - energy: high
  - context: small
  - notes: Agentic workflow — load page in browser, check one dimension at a time (color, typography, spacing, etc.), flag issues. CLI: npm run check -- --url <url>

- [ ] Design the component addition workflow
  - type: design
  - priority: low
  - energy: medium
  - context: small
  - notes: Define the steps to add a new component — build against semantic tokens, render in template, run conformance checker, human review.

- [ ] Design the Figma bridge
  - type: design
  - priority: low
  - energy: high
  - context: small
  - notes: Two directions — (1) code/tokens to Figma variables/components, (2) Figma rough design to code scaffolding. Code is authoritative; Figma is a scratchpad.

- [ ] Phase 3 interactive components: Dialog, Dropdown, Popover, Tooltip, Tabs, Toast
  - type: build
  - priority: low
  - energy: high
  - context: small
  - notes: Evaluate Zag.js for behavior layer vs. vanilla Web Components vs. per-adapter implementations.

- [ ] Pick a test case to validate the full system end-to-end
  - type: build
  - priority: low
  - energy: medium
  - context: small
  - notes: A small, simple page that exercises foundation + semantic layer + at least 2 components + conformance checker.

## Done

- [x] Decide on design system shape and output format
- [x] Decide: modes vs schemes vs themes — terminology and layer structure
- [x] Decide: delivery model — template repo
- [x] Decide: component technology — CSS foundation + HTML/CSS components + optional React wrappers
- [x] Decide: agent interface — structured files + CLI conformance checker, no MCP server
- [x] Phase 0 — architecture spike: DTCG tokens, Style Dictionary 4 build, CSS @layer stack, Button + Field components + HTML contracts, static example
