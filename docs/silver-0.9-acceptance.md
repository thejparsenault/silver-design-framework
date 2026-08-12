# Silver 0.9 — Meet the Work Where It Is

## Why this release exists

0.8 made tool *selection* real but never described the tools being selected
between, helped when one broke, or let a designer bring one Silver does not
ship. Silver also only installed into blank folders, had nowhere to keep
material a designer looks at — and, least visibly, imposed its own design
system on every workspace while documenting it as a demo.

The thesis: Silver meets work it did not author. Existing repositories, tools
it does not ship, references from outside, and — the piece that completes it
— a design system that belongs to the team rather than to Silver.

Underneath: Silver enumerates, validates, and records; the agent reads,
interprets, and proposes; the human decides one thing at a time.

## Goal

A workspace can be set up on top of existing work instead of only a blank
folder, tell a designer honestly what is wrong with a tool and how to fix it,
and render its own team's design system by default instead of Silver's demo
— with a two-way path to and from Figma that never silently turns an alias
into a hardcoded value.

## Status

This document is authored mid-release, not after it. Each criterion below is
marked **done** or **pending**. `docs/silver-0.9-acceptance.md` is itself the
authoritative requirement list per `PROJECT.md`'s rule: a task is not
complete until its corresponding `S09-*` criteria have automated evidence.
Where a criterion is inherently unautomatable (a human decision, a live
external call), it is marked **manual** instead, and never counted toward the
automated release gate.

As of this writing: `npm run build` passes 166/166 tests and
`npm run test:package` passes, on `release/silver-0.8-tools`, uncommitted on
top of `f5b4a6c`. Every automated criterion below (`CONFORM`, `LINK`,
`PRACTICE`, `REF`, `FIGMA-PULL`, `FIGMA-PUSH`, `ROUNDTRIP`, `MIGRATE-01`,
`MIGRATE-03`) is done. Only the two manual criteria remain: `S09-CURATE-01`
(W7, needs the user directly) and `S09-MIGRATE-04` (manual end-to-end
verification).

## Criteria

### Adoption (W1) — done

- **S09-ADOPT-01** `silver adopt inspect` reads an existing folder and
  proposes one of six dispositions per entry under `silver/adoption-plan/v1`;
  `silver adopt apply` accepts them one at a time. *(installer/tests/adoption.test.mjs)*
- **S09-ADOPT-02** Adoption is additive by construction: no disposition
  moves, renames, deletes, or rewrites a file that already exists.
  `translate` writes through `writeNewFile`, so this is a property of the
  call, not a check that could be forgotten.
- **S09-ADOPT-03** An adopted artifact carries `origin: adopted` and is
  checked for existence, not shape — doctor never demands Silver frontmatter
  in a document the product team wrote.
- **S09-ADOPT-04** `silver setup` no longer refuses a folder that already
  contains work, including the installer's own footprint
  (`npm install` leaves `package.json` behind, which used to trigger refusal).

### Tool provenance and guidance (W2) — done

- **S09-PROV-01** Every provider declares `source` and `guidance`;
  `silver tools --list` surfaces both.
- **S09-PROV-02** `compare_to` drift between a declared and an observed
  provider fails the contract gate.

### Declared transports (W3) — done

- **S09-TRANSPORT-01** A tool with several transports (e.g. Figma) declares
  each as a separate, individually selectable provider with `target`,
  `variant`, and `aliases`.
- **S09-TRANSPORT-02** `operations` is optional and, when present,
  constrains what a transport is offered for.
- **S09-TRANSPORT-03** `silver tools --declare` refuses a placeholder
  declaration; the honesty guardrail rejects a transport that claims a
  capability its contract does not back.

### Browser (W4) — done

- **S09-BROWSER-01** `inspect-in-browser` and `drive-browser` are separate
  activities so a read-only check and an automated interaction are never
  conflated.
- **S09-BROWSER-02** Portable local Chrome, `chrome-devtools-mcp`, and
  `playwright-mcp` are all declared transports; `connection.kind: host-native`
  distinguishes a host-owned connection from one Silver could configure
  itself.

### Troubleshooting (W5) — done

- **S09-TROUBLESHOOT-01** `silver tools --diagnose` walks the full setup
  ladder for an activity and reports the first failing step.
- **S09-TROUBLESHOOT-02** An agent probe result can mark a transport
  `responding`, because only the agent host can call an MCP server — Silver
  itself only ever claims `configured`.
- **S09-TROUBLESHOOT-03** `doctor` reports transport diagnostics using the
  same ladder, live-verified against a real Figma MCP connection.

### Semantic role vocabulary (W9a) — done

- **S09-VOCAB-01** `silver/semantic-roles/v1` is a published, versioned
  vocabulary — names only, no values — covering `action`, `border`,
  `elevation`, `feedback`, `focus`, `icon`, `surface`, `text`, and `type`.
- **S09-VOCAB-02** `action.*` carries hover, active, and disabled states
  across all four variants (9 roles → 27), so an adopted system's
  interaction states have somewhere to land.
- **S09-VOCAB-03** `type.*` exists as composite roles (display, four heading
  levels, three body sizes, label, caption, code), each carrying size,
  weight, and line height together as the unit a designer actually chooses.
- **S09-VOCAB-04** `icon.*` and `elevation.*` exist as their own families
  rather than borrowing from `text.*` and `surface.*`.
- **S09-VOCAB-05** An index may declare `vocabulary: silver/semantic-roles/v1`
  or `custom` plus a partial mapping onto the standard roles; partial is a
  recorded state, never an error.

### Workspace-owned design system (W9b–f) — done

- **S09-SYSTEM-01** `design/system/tokens/` is the authored DTCG source
  (primitive → semantic → component, references intact);
  `design/system/tokens.json` is generated and never hand-edited.
- **S09-SYSTEM-02** The generated stylesheet chains `var()` per layer
  (`--ds-button-primary-bg: var(--ds-action-primary-bg)`) rather than
  flattening to literals, so rendering and conformance checking both work
  off names.
- **S09-SYSTEM-03** Color output ships both an sRGB hex block and an
  `@supports (color: oklch(...))` wide-gamut override, so dropping to hex
  never silently changes a rendered contrast ratio.
- **S09-SYSTEM-04** `validate-contracts.mjs` recomputes `tokens.json` from
  `tokens/**` and fails the gate on drift — the same discipline as the
  manifest/`INDEX.md` pattern.
- **S09-SYSTEM-05** `design-context.token_source` and `component_catalog`
  (now `design/system/components.json`, schema-validated) are wired; all six
  renderers resolve stylesheet, tokens, and markup templates through the
  active design context instead of a hardcoded path.
- **S09-SYSTEM-06** `design/system/showcase.html` is present immediately
  after `silver setup` on a blank folder and regenerates when a token
  changes.
- **S09-SYSTEM-07** No installed workspace contains anything named
  `reference-system`; it is retired to `fixtures/reference-system/` for
  tests only and dropped from the shipped package.
- **S09-SYSTEM-08** The `alongside` setup mode is renamed
  `with-existing-work`, distinct from the `topology: integrated | separate`
  axis it used to collide with.

### Non-conformant systems (remainder of W9f) — done

- **S09-CONFORM-01** `checks.policy_profile` is read by every conformance
  checker (`semantic-styles`, `accessibility`, `responsive-behavior`), not
  just declared in the manifest — each now reports the workspace's actual
  configured profile instead of a hardcoded default.
- **S09-CONFORM-02** The `adoption` profile downgrades a `semantic-styles`
  finding to `severity: info` with the reason stated in the message, and the
  finding/check-result schemas already make "reported as passing" structurally
  impossible whenever a finding exists.
- **S09-CONFORM-03** Where a workspace under `adoption` has no
  `design/system/tokens.json` yet, `semantic-styles` reports `not-run` with a
  reason rather than flagging every literal as a defect. *(installer/tests
  live in framework/tests/design-check.test.mjs — "downgrades findings..."
  and "reports not-run when adopted work has no token index yet")*

### Codebase linking (W9g) — done

- **S09-LINK-01** `silver link <path> [--as <id>]` registers a codebase as a
  pinned `linked-source`, storing the path relative to the workspace
  (`reference`) with the absolute path recorded only as a hint
  (`reference_hint`, new optional schema field); if exactly one active
  design context resolves, it's recorded on `codebase.linked_source` (also
  new, optional). Fixed a latent bug surfaced in the process:
  `inspectLinkedSources`/`verifyLinkedSource` resolved a relative
  `reference` against `process.cwd()` instead of the workspace root, which
  would have silently broken the moment a relative link was actually used.
- **S09-LINK-02** `doctor` reports a codebase link that no longer resolves
  after a clone (`linked-source-unavailable`, includes the hint), and one
  whose pinned git revision has moved (`linked-source-external-changed`),
  reusing `inspectLinkedSources` unchanged in shape — kind-agnostic already,
  no new logic needed there.
- **S09-LINK-03** `silver adopt inspect --source <linked-id>` resolves an id
  registered in `design/sources/sources.yaml` to that source's path before
  falling back to treating `--source` as a literal path (existing W1
  behavior, preserved). *(installer/tests/link.test.mjs)*

### Figma pull fidelity (W9h) — done

- **S09-FIGMA-PULL-01** `framework/providers/figma-console-mcp/tokens.mjs`'s
  `figmaVariablesToTokens()` walks each variable's `data.values_by_mode`
  (first mode — Silver's token tree carries one `$value`, not one per mode;
  stated as a real, unclosed gap, not hidden); a `VARIABLE_ALIAS` becomes a
  DTCG `{reference}` string via the target's `semantic_name`, resolved
  bottom-up with the same trail-based cycle guard
  `framework/runtime/tokens.mjs` already uses for authored references. An
  alias whose target has no `semantic_name` yet is reported `unresolved`
  with a reason, never invented as a literal or a floating Figma id.
- **S09-FIGMA-PULL-02** `classifyCollections()` proposes `primitive`,
  `semantic`, or `uncertain` per collection from alias direction (heavily
  aliased-into vs. itself aliasing), never assumed from a naming
  convention; thin or tied evidence returns `uncertain` rather than a guess.
  Human confirmation per collection is a UI/workflow concern outside this
  pure function's scope — it produces the proposal to confirm.
- **S09-FIGMA-PULL-03** `bindStyleProperties()` walks a style entity's
  `data.bound_variables` per property: a bound property with a mapped
  target becomes a reference, an unbound one (or one bound to an unmapped
  variable) stays its literal. *(framework/tests/figma-tokens.test.mjs,
  framework/tests/figma-round-trip.test.mjs)*

### Figma push fidelity (W9i) — done

- **S09-FIGMA-PUSH-01** `previewSemanticTokenWrite()` now accepts an
  optional `snapshot`; when a change's value is still a `{reference}` at
  push time, `resolveReferenceToVariableId()` resolves it against the
  snapshot's variables and the payload gets `alias_to: <figma-variable-id>`
  instead of `value` — never a flattened literal. Without a snapshot, or
  where the reference does not resolve, it falls back to writing the value
  as given (unchanged, backward-compatible default).
- **S09-FIGMA-PUSH-02** New `previewStyleWrite()` mirrors the token write
  per property, using the same `{value, is_alias}` shape `bindStyleProperties`
  produces on pull.
- **S09-FIGMA-PUSH-03** `change-set.schema.json` gained an optional
  `value_kind: "alias" | "literal"` on each change, computed in
  `createFigmaChangeSet()` from whether the raw variable value is a
  `VARIABLE_ALIAS`; a value staying a reference and one becoming a literal
  are classified distinctly wherever a human approves.
- **S09-FIGMA-PUSH-04** `applySemanticTokenWrite()` — revision-staleness
  check and mandatory `approval` — is untouched.
  *(framework/tests/figma-round-trip.test.mjs;
  framework/tests/portable-reconciliation.test.mjs's existing write-preview
  test passes unmodified, confirming the `snapshot`-less path stays
  backward compatible)*

### Round-trip fidelity testing — done

- **S09-ROUNDTRIP-01** `framework/tests/figma-round-trip.test.mjs` — a
  synthetic fixture (a primitive variable, a semantic variable aliasing it,
  a text style with one bound and one literal property) proves: pull
  preserves the alias; a no-op push reconstructs it unchanged; editing only
  the primitive leaves the semantic write still expressed as an alias to
  that primitive; a deliberate structural edit (hardcoding the semantic
  token) is classified distinctly from an ordinary value edit — as
  `node:assert` against synthetic JSON, milliseconds, in the normal suite,
  no opt-in.
- **S09-ROUNDTRIP-02** `framework/testing/adapter-round-trip.mjs` —
  `assertRoundTripLossless({items, push})` — is a real, adapter-agnostic
  harness (pull∘push identity on a no-op; a structural edit produces a
  distinct write) that the Figma test parameterizes directly. Correcting
  the plan's prose: `representation-binding.schema.json`'s `round_trip`
  enum is `lossless | partial | read-only | write-only` — there is no
  `full` value. A `round_trip: "lossless"` claim is what this harness
  should gate; nothing currently claims `lossless`, so nothing needed
  retrofitting.
- **S09-ROUNDTRIP-03** No test anywhere calls a live Figma transport; every
  assertion above runs against synthetic in-memory payloads.

### Personal preferences (W5e) — done

- **S09-PRACTICE-01** `installer/tools.mjs` now reads
  `<My Practice>/tools.yaml` (schema `silver/tool-preferences/v1`) as the
  `"personal"` source and pushes it first, ahead of `"project"` —
  `resolveActivityTransport`'s ordering guarantee already honored it; only
  the file and its read path were missing. A malformed file is treated as
  absent, matching the method-overlay precedent, never fatal.
- **S09-PRACTICE-02** `silver tools --resolve "<phrase>"` matches a phrase
  against every provider's declared `aliases` (substring match, since a
  conversational phrase contains an alias rather than equalling one);
  two different transports matching is reported `ambiguous` rather than
  guessed.
- **S09-PRACTICE-03** `silver tools --bind <activity> <transport>` validates
  both ids against the real activity catalog and discovered providers, then
  writes (or edits, revision-bumped) `tools.yaml`, echoing back what was
  bound. Written directly rather than through the practice-change review
  ceremony — a transport preference is local machine configuration, not
  practice content someone else would review.
  *(installer/tests/practice-tools.test.mjs)*

### References (W6) — done

- **S09-REF-01** `framework/schemas/v2/reference-collection.schema.json`
  (`silver/reference-collection/v1`) — a collection is one document under
  `design/references/<id>.json`; every reference requires `description`
  and `rights.usage` (`inspiration-only | internal | production |
  unrestricted`). `design/references/README.md` is seeded on every fresh
  workspace; the directory starts otherwise empty.
- **S09-REF-02** `reference-integrity` (`check-reference-integrity.mjs`,
  registered in the fast suite) covers missing files, integrity mismatch,
  duplicate ids, and unrecognized `rights.usage`. Blocking an
  `inspiration-only` reference cited by production works by scanning
  `.silver/results/skills/*.json` for a citation whose invocation touched
  `production/` — citations live in recorded results, not in rendered
  markup. *(framework/tests/reference-integrity.test.mjs)*
- **S09-REF-03** `skill-invocation.schema.json` gained an optional
  top-level `references: [{collection, ids}]` (unpinned citation intent);
  `provenance.schema.json` gained `references: [{collection, revision,
  ids}]` (the pinned record). `invoke-skill.mjs`'s two default-provenance
  paths resolve a citation through the new
  `framework/runtime/references.mjs`, which pins the collection's current
  revision and refuses a citation of an id that does not exist — never
  invents evidence. An invocation with no `references` block records none;
  `silver trace` surfaces each citation as `collection@revision (ids)`.
  *(framework/tests/skill-invocation.test.mjs)*

### Transport curation (W7) — manual

- **S09-CURATE-01** `framework/transports/*.yaml` gains guided, user-authored
  declarations for common tools beyond what shipped in 0.8, each carrying
  `evidence: declared | verified` and `verified_at`. This is deliberately
  not automatable: it is the user's own judgment about which real-world
  tools to declare, not a mechanism Silver can generate.

### Migration and release (W8) — mostly done

- **S09-MIGRATE-01** A reviewable `0.8 → 0.9` migration preserves project
  work, including any hand-edited `reference-system/` content, and installs
  the `design-system-tokens-seed` package without overwriting it. *(done)*
  Building this test surfaced four real, previously-uncaught defects, fixed
  along with it:
  1. `lock.schema.json`'s package `type` enum had **dropped
     `"reference-system"` outright** when W9b-f added `"design-system-seed"`,
     instead of keeping both. Every real workspace still on a v2 lock from
     before that change would fail `assertV2`/`validateSchema` on its own
     lock file — migration, `doctor`, and `update` would all refuse to even
     read it. Both values are now valid; the schema's `description` records
     why.
  2. `migrateManifest()` still hardcoded `component-catalog`'s path at
     `reference-system/html-contracts` and had no `token-source` artifact
     at all. It now repoints an existing `component-catalog` entry in place
     and adds `design-system-tokens` (kind `token-source`) when missing.
  3. A design context authored before 0.9 has no `token_source` and, if it
     names a component catalog, still points it at the retired path. New
     `migrateDesignContext()` patches every `design/contexts/*.yaml` that
     needs it, listed as an `upgrade-design-context` change in the reviewable
     preview before `--apply` touches anything.
  4. `design/system/tokens.json`, `expressions/`, and `showcase.html` are
     *generated from*, not part of, the `design-system-tokens-seed` package
     — installing the package's raw files alone (which the existing
     generic package-copy loop already did correctly) left a workspace with
     an authored token tree and nothing built from it. Migration now calls
     `buildDesignSystemTokens()` and `renderSystemCatalog()` after package
     install, exactly as a blank `silver setup` does. `components.json` and
     `design/references/README.md` were also missing from migration's
     seeded-file list and are now included.
  *(installer/tests/migrate.test.mjs — "a 0.8 workspace migrates to 0.9,
  preserving hand-edited reference-system and installing
  design-system-tokens-seed")*
- **S09-MIGRATE-02** `docs/silver-0.9-acceptance.md` (this document) and
  `TASKS.md`/`STATUS.md` describe the same current state. *(done, this change)*
- **S09-MIGRATE-03** The release gates (`npm run build`, `npm run test:package`)
  pass for the exact packed archive. *(done — `sourcePackages()` in
  `installer/setup.mjs` now stamps every skill and provider package with the
  passed release `version` instead of leaking each file's own declared
  `version:`; a second, unrelated stale reference to the pre-W9b-f
  `design/system/catalog.html` path in `framework/scenarios/complete-blank.mjs`
  (missed when it was renamed to `showcase.html`) was also blocking the
  packed smoke test and is fixed. Both gates are green.)*
- **S09-MIGRATE-04** End-to-end verification against a real workspace,
  the way every prior release records in `STATUS.md`. *(manual — not run
  in this pass)*

## Evidence

Automated: `npm run build` (166 tests) and `npm run test:package`, both
green. New suites added for the criteria above:
`framework/tests/figma-tokens.test.mjs`,
`framework/tests/figma-round-trip.test.mjs`,
`framework/tests/reference-integrity.test.mjs`,
`installer/tests/link.test.mjs`, `installer/tests/practice-tools.test.mjs`,
plus extensions to `framework/tests/design-check.test.mjs`,
`framework/tests/skill-invocation.test.mjs`, and
`installer/tests/migrate.test.mjs`.

Manual, recorded in `STATUS.md` rather than in an automated test:

1. Blank: `npm install` → `silver setup .` → flow → prototype → open it,
   confirm it is visibly styled.
2. Adjacent: set up in a copy of a real product, adopt its tokens and
   components, render a prototype, confirm it uses the product's own
   classes and CSS.
3. Change a token in `design/system/tokens.json`, re-render, confirm the
   change appears.
4. A live Figma round trip, interactive only, never a CI step, per the
   figma-console MCP's own session-specific-node-id constraint.
5. Adopt one real representative existing product repository end to end
   (the deferred "Following Milestone — Existing Codebase Adoption" item in
   `TASKS.md`), now that W1 provides the mechanism.

## Deliberately not in this release

- A framework-native (React/Vue/etc.) component expression that renders
  through a team's real components. The contract can describe it
  (`implementation_profiles.status: offered`); 0.9 does not ship one.
- Selection and highlight roles, and a modal scrim distinct from
  `surface.overlay`, in the semantic vocabulary — deferred until a recorded
  adoption cannot map onto the existing roles.
- Any Silver-owned network transport, credential handling, or process
  supervision. This is a boundary, not a gap.

## Known gaps

- Only one shipped Figma transport (`figma-console-mcp`) has been verified
  against a live server; `figma-official-mcp` has not. Carried over from 0.8.
- The default transport ordering heuristic is still deliberately thin.
  Carried over from 0.8.
