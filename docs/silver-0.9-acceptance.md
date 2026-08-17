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

As of this writing: `npm run build` passes and `npm run test:package` passes,
on `release/silver-0.8-tools`. Every automated criterion below (`CONFORM`,
`LINK`, `PRACTICE`, `REF`, `FIGMA-PULL`, `FIGMA-PUSH`, `ROUNDTRIP`,
`MIGRATE-01`, `MIGRATE-03`, the `S10-*` skill-taxonomy criteria added
mid-release once 0.9's own thesis exposed a producer-less required input, and
the `S09-TOOLS-*` criteria added for W7) is done. `S09-CURATE-01` (W7) closed
through direct work with the user rather than an automated pass — see
"Tool registry and capability vocabulary (W7)" below for what that produced.
Only `S09-MIGRATE-04` (manual end-to-end verification) remains.

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

- **S09-BROWSER-01** Browser work is split into separate activities
  (`browser.navigate`, `browser.interact`, `browser.inspect-structure`, and
  the rest of the `browser.*`/`evaluate.*` family added in W7) so a read-only
  check and an automated interaction are never conflated. *Superseded by W7:*
  the original two-activity split (`inspect-in-browser`/`drive-browser`) grew
  into this finer family so "audit performance" and "click through a flow"
  are distinguishable requests against the same running page.
- **S09-BROWSER-02** Portable local Chrome, `chrome-devtools-mcp`, and
  `playwright-mcp` are all declared transports; `connection.kind: host-native`
  distinguishes a host-owned connection from one Silver could configure
  itself.
- **S09-BROWSER-03** Browser results distinguish `not-run` prerequisites,
  `error` mechanism failures, and completed `fail` findings. Local Chrome owns
  its debugging port, launch/readiness receives one fresh-profile retry,
  navigation/protocol/inspection errors carry typed target diagnostics, stderr
  is bounded, and cleanup records exit signal and forced termination. Three
  consecutive real-browser cycles plus injected failure stages have direct
  coverage. *(framework/tests/browser-check.test.mjs)*

### Troubleshooting (W5) — done, revised by W7

- **S09-TROUBLESHOOT-01** *(revised)* `silver tools --diagnose` reports every
  rung it can derive for a transport — host-config presence, required env
  vars, executable/env/file detection, probe freshness — plus that transport's
  `post_setup` notes for whatever it could not derive. The authored `setup`
  ladder this originally described was removed in W7: it was load-bearing in
  exactly this one place and decorative everywhere else (`--connect` never
  consulted it; availability never consulted it), and every rung it typed by
  hand is now either derived automatically or, when it genuinely cannot be
  (a one-time command, a mode to enable in the tool itself), a plain
  `post_setup` note. See `framework/runtime/transport-diagnosis.mjs`.
- **S09-TROUBLESHOOT-02** An agent probe result can mark a transport
  `responding`, because only the agent host can call an MCP server — Silver
  itself only ever claims `configured`.
- **S09-TROUBLESHOOT-03** *(corrected)* `doctor` reports transport
  availability and the diagnostics above; it does not walk a "ladder" — no
  such structure exists as of W7, and none existed as authored steps `doctor`
  interpreted before it either. This criterion previously claimed live
  verification against a real Figma MCP connection; no such live connection
  is exercised by the automated suite, which pins `home` to
  `fixtures/host/empty` specifically so results do not depend on what is
  actually configured on the machine running the tests. Live verification is
  `S09-MIGRATE-04`'s job, not this criterion's.

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

### Tool registry and capability vocabulary (W7) — done

- **S09-CURATE-01** *(closed manually, as designed)* `framework/transports/*.yaml`
  gained nine guided, user-authored declarations beyond 0.8's three
  (`figma-official-desktop-mcp`, `excalidraw-mcp`, `miro-mcp`,
  `canva-connect-api`, `webflow-mcp`, `v0-api`, `lighthouse-cli`,
  `axe-core-cli`, `chromatic-cli`), each carrying `evidence: declared` and
  `verified_at`. This criterion was deliberately never meant to be
  automatable — it names the user's own judgment about which real-world
  tools to declare — and it stayed that way: the work happened through a
  direct working session, not a generator. What *did* get built from that
  session is W7's larger surface, below.
- **S09-TOOLS-01** The activity catalog grew from 20 to 67 entries
  (`framework/activities/catalog.yaml`, `silver/activity-catalog/v1`),
  namespaced by family (`visual.create-high-fidelity-ui`,
  `evaluate.audit-performance`, …) so "make a wireframe" and "make an
  editable, high-fidelity design" are different, nameable requests rather
  than one coarse `design-file` write. The coarse `capability` enum is
  unchanged — activities are instances of a capability, not a competing
  vocabulary. See `CONTEXT.md`'s Activity/Tool capability definitions.
- **S09-TOOLS-02** Every activity carries a `fallback` — the native answer
  silver-portable gives when no provider holds the activity's capability at
  all, not a ranked-last provider. This is what makes "there is always a
  Silver-native answer" true by construction: `fallback.mode` is `native`
  (silver-portable does the whole job), `input-required` (needs an export or
  URL first), or `representational` (can spec the thing, not produce it).
- **S09-TOOLS-03** Provider support for an activity is *declared*
  (`provider.activities: [{id, support, actions, outputs?, constraints?}]`),
  not derived from capabilities/directions/artifact-kinds alone — the pre-0.9
  derivation cannot express a fidelity distinction. Declaring reintroduces
  drift risk, so `framework/scripts/validate-contracts.mjs` gained assertions
  covering activity-id existence, action/direction/capability consistency,
  artifact-kind intersection, package-only-capability overreach, fallback
  provider existence, and bidirectional coverage.
  *(framework/runtime/activities.mjs, `providerSupportsActivity`)*
- **S09-TOOLS-04** `provider.interface.detection` (`executables`, `env`,
  `files`) makes a CLI-only transport detectable at all — before this,
  `declaredAvailability()` returned "declares no connection Silver can
  inspect" for anything without an MCP or host-native connection, so every
  CLI tool (axe-core, lighthouse, chromatic) was permanently undetectable.
  Detection is injectable (`pathEntries`/`env` options) so a test's result
  does not depend on what happens to be on the machine running it.
  *(framework/runtime/tool-detection.mjs)*
- **S09-TOOLS-05** `silver tools --for "<phrase>"` matches free text against
  each activity's `phrases` and resolves it exactly as an invocation would:
  resolved, a native fallback when nothing installed serves it, ambiguous
  across more than one named activity, or unresolved with the nearest named
  activities. An explicit transport name in the phrase always wins and
  bypasses any preference binding. *(installer/tools.mjs,
  `resolveActivityForTask`)*
- **S09-TOOLS-06** `silver tools --bind` refuses an activity marked
  `binding: internal` — currently `artifact.write-canonical` alone, the one
  activity whose capability (`canonical-artifact`) a declaration may never
  claim (see `PACKAGE_ONLY_CAPABILITIES`). Every other activity, including
  the four renderer capabilities, is an ordinary bindable choice: 0.9 ships
  real alternatives for three of them (Excalidraw for `visual-renderer`,
  Miro for `map-renderer`, Canva for `presentation-renderer`), so "internal"
  is reserved for "cannot be otherwise," not "isn't, yet."
- **S09-TOOLS-07** `doctor` reports an activity id that no longer exists in
  the catalog wherever one could be silently ignored: a project's
  `design/manifest.yaml` `tool_preferences.activities`, and My Practice's
  `tools.yaml`, which lives outside every workspace and previously had a
  schema mismatch drop the whole file with no message anywhere
  (`personalPreferences()`'s `try { } catch { return null }`).

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
  the way every prior release records in `STATUS.md`. *(manual — live Figma
  pull/push/structural-edit/restore round trip passed 2026-08-17 in `Test
  File`; blank and adjacent/adopted workspace reviews remain)*

### Skill taxonomy (W10) — done

Added mid-release once it became clear 0.9's own thesis — "Silver meets work
it did not author" — was incomplete without it: `evidence` was a required
input to `synthesize` with no skill producing it, information architecture
had no home, and nothing closed the loop after `implement`.

- **S10-VISUALIZE-01** `sketch` is renamed `visualize` end to end — skill id,
  artifact kind (`sketch` → `visualization`), output path
  (`design/work/sketches/**` → `design/work/visualizations/**`), capability
  (`sketch-renderer` → `visual-renderer`), activity (`render-sketch` →
  `render-visualization`) — because a renderer still labelling its output
  `sketch` would reintroduce the low-fidelity implication the rename exists
  to remove. `alternatives-cheap` is replaced with
  `alternatives-distinguishable`, which is what was actually load-bearing.
- **S10-VISUALIZE-02** `sketch` stays valid, marked deprecated, in
  `common.schema.json` and `working-artifact.schema.json`, so a pre-0.9
  artifact keeps validating; `evaluate` accepts both `sketch` and
  `visualization` as input. Migration never rewrites project-owned content —
  see S10-MIGRATE-01.
- **S10-VISUALIZE-03** Every registry that named `sketch` was updated by
  direct grep, not guesswork: `installer/setup.mjs`, both
  `contextPinnedOutputKinds` copies, the renderer-capability list in
  `invoke-skill.mjs`, `framework/activities/catalog.yaml`, the
  `silver-portable` and `figma-console-mcp` provider contracts, the default
  design-loop playbook, `what-now`'s action titles, and every skill contract
  that referenced `sketch` as a handoff target. *(installer/tests/installer.test.mjs,
  framework/tests/local-renderers.test.mjs, framework/tests/skill-invocation.test.mjs)*
- **S10-COLLECT-01** New `collect` skill (modeled on `synthesize`) owns the
  evidence-acquisition step `research` and `synthesize` both stopped short
  of: `research → collect → synthesize`. Outputs `kind: evidence` at the
  existing `design/evidence/**` path — no new artifact kind, since one
  already existed with a checker and no producer.
- **S10-COLLECT-02** `evidence` gained a required `payload.source_pin`
  (`source`, `query`, `retrieved_at`, `sanitized`) in
  `working-artifact.schema.json`, enforced by `evidence-provenance`
  (`evidence.source-unpinned`). This closes a real gap found while tracing
  where evidence goes: `check-evidence.mjs`'s `evidenceKinds` set was
  missing `evidence` itself, so a `kind: evidence` artifact was skipped by
  the one check meant to validate it — the fixture in
  `complete-blank.mjs` had been writing an unschema'd, unvalidated
  `schema: "silver/evidence/v1"` document with no backing schema file at
  all. Fixed to a proper `silver/working-artifact/v2` document with a real
  source pin. `design/evidence/README.md` is now seeded (it previously
  materialized silently on first write) and states the boundary against
  `design/references/`: inspiration and prior art go there, not here — same
  file types, different contract (rights vs. provenance).
  *(framework/tests/guardrail-negative.test.mjs)*
- **S10-COLLECT-03** `reference-collection.schema.json`'s reference `kind`
  enum gained `code`, so a scraped CSS/JS snippet is storable as what it is;
  `rights.usage: inspiration-only` already carries the "never copied into
  production" constraint that makes scraped code different from a component
  library. The larger import model (storing and drift-guarding raw pulls
  from research tools, analytics, or chat) is explicitly deferred — see
  "Deliberately not in this release."
- **S10-STRUCTURE-01** New `structure` skill and
  `framework/schemas/v2/structure.schema.json` (`silver/structure/v1`,
  modeled on `map.schema.json`): `structure_type`, `entities[]` (with
  optional `parent` for hierarchy), `relationships[]`, `rules[]`. Distinct
  from `flow` (sequences over time) and `map` (broader relational views) —
  stated in both `SKILL.md` and the skill summary.
- **S10-STRUCTURE-02** `check-structure.mjs` (pure validator) plus
  `check-structures.mjs` (workspace walker, registered as
  `structure-integrity` in the fast suite) catch duplicate entity ids, a
  relationship referencing a missing entity, and a `parent` cycle — the
  three failures that make an IA document actively wrong rather than just
  incomplete. *(framework/tests/structure.test.mjs)* `structure` also joins
  `graph.yaml`'s canonical codec alongside `flow` and `map` (its shape —
  entities and relationships — is the same class of document), and
  `installer/migrate.mjs`'s manifest checks-enabled list gained
  `structure-integrity` — along with `reference-integrity`, missing from
  that list since W6 and fixed here since it was directly adjacent to what
  W10 was already touching.
- **S10-STRUCTURE-03** `flow`, `specify`, and `component` each gained
  `structure` as an optional input; `structure` hands off to all three.
- **S10-MEASURE-01** New `measure` skill (modeled on `evaluate`) closes the
  loop `implement → measure → synthesize`. Outputs new working-artifact kind
  `measurement` at `design/work/measurements/**`, requiring
  `hypothesis`, `metrics`, `instrumentation`, `observed`, `limitations` in
  its schema payload — so weak instrumentation or a thin sample has to be
  written down, not smoothed over.
- **S10-MEASURE-02** New `product-analytics` capability and
  `read-product-analytics` activity (`status: planned`), following the same
  named-gap pattern the catalog already uses for `research-evidence` and
  `version-control`: a missing analytics tool is a specific, accounted-for
  absence rather than an unexplained degraded capability.
  `auditActivityCatalog` verifies this both ways — a skill declares the
  capability (`measure` does) and no shipped provider serves a `planned`
  activity (none does).
- **S10-MEASURE-03** `measurement` is added to `evidenceKinds` in
  `check-evidence.mjs`, so `evidence-provenance` requires it to pin internal
  `sources[]` — unlike `evidence`, a measurement genuinely does derive from
  other in-workspace artifacts (the specification, the implementation), so
  it is not exempted the way `evidence` is.
- **S10-CATALOG-01** `README.md` and `docs/agentic-design-workflows.md`
  regroup the (now 24) skills into Orientation / Foundations / Discovery
  (`research`, `collect`, `synthesize`, `ideate`, `map`) / Definition
  (`specify`, `structure`, `flow`, `component`) / Making (`visualize`,
  `prototype`) / Evaluation and delivery (adds `measure`), matching the
  taxonomy this section describes.
- **S10-TAXONOMY-01** New `framework/tests/skill-taxonomy.test.mjs`:
  **every artifact kind declared as a required input by some skill is
  declared as an output by at least one skill.** `evidence` failed this
  before `collect` existed; the test now holds, and the framework cannot
  quietly grow another producer-less required input.

### Safety and synchronization release hardening — done

- **S09-SAFE-01** All managed writes accept a canonical workspace root and a
  workspace-relative path, reject linked/junction ancestors and real-path
  escapes immediately before mutation, and limit link creation to verified
  `.claude/skills/silver-*` leaves resolving into `.skills/`.
  *(framework/tests/workspace-mutations.test.mjs,
  installer/tests/workspace-safety.test.mjs)*
- **S09-SAFE-02** `doctor` reports unsafe managed paths and incomplete
  transactions as hard errors. Migration stops before writes when
  `design/system` is linked and returns a reviewed conversion plan; an accepted
  synchronization can transactionally replace only that leaf with a real local
  representation while preserving the external target.
- **S09-TXN-01** Migration and update prepare the complete file delta in
  lifecycle staging and activate through `silver/workspace-transaction/v1`
  journals with exclusive locking, flushed phase/operation state, staged
  integrity, preimages, lock-last ordering, post-activation validation, caught-
  failure rollback, and explicit resume/rollback recovery.
  *(framework/tests/workspace-transactions.test.mjs, installer/tests/migrate.test.mjs)*
- **S09-SYNC-01** Reviewed linking emits strict `silver/link-plan/v1`, v2
  linked sources, and v2 representation bindings for design systems, component
  catalogs, and codebases. Unknown binary data is unmapped; structured formats
  are codec-validated; other UTF-8 files use honest whole-file proposals.
- **S09-SYNC-02** `sync status` is read-only, `sync inspect` persists a state-
  pinned proposal, and `sync apply --only` rejects stale bindings/state,
  conflicts, findings, and missing approval. Successful imports atomically
  advance the artifact, affected design contexts, binding base, and source pin.
- **S09-SYNC-03** Repository exports touch mapped paths only, run argv-based
  checks with bounded per-command and aggregate deadlines, and either restore
  non-Git preimages or create a path-isolated commit on one reusable local Git
  branch. They never push. A durable saga resumes metadata forward after an
  external Git commit and never rewrites Git history.
  *(installer/tests/sync-repository.test.mjs)*
- **S09-SYNC-04** Captured Figma semantic-token reconciliation uses the same
  public interface and v2 proposal/result contracts. Import uses workspace
  transactions; export returns `external-action-required`, then accepts only a
  recorded result plus a fresh advanced capture. Alias-preserving writes remain
  intact. *(installer/tests/sync-figma.test.mjs)*
- **S09-SYNC-05** The installed `reconcile` skill explains and groups changes,
  records explicit operation acceptance, performs agent-owned provider actions,
  and hands off partial/unmapped work instead of mutating it. Artifact codecs
  and reconciliation are no longer executable-reachability exceptions.

## Evidence

Automated on 2026-08-17: contract validation is green for 54 v2 schemas and
25 v2 skills; the serialized source/coverage suite passes 226/226 with no
failures, skips, or todos; and `npm run test:package` passes against the exact
5,861-file release archive. The final coverage result is 83.30% lines, 74.41%
branches, and 88.83% functions. Line coverage improved over the audit baseline;
the percentage-only branch/function baseline did not survive the addition of
the transaction and synchronization state machines, so targeted branch work
remains follow-up rather than being misreported as complete. Direct tests do
cover symlink escape/swap, every transaction phase and recovery direction,
stale/conflicting synchronization, required-check failure/timeout, non-Git
rollback, and Git forward recovery.

The fully gated `npm run release` also passes; after browser hardening, the
independently green gates produce the 5,861-file, 12,612,026-byte archive with
`sha256:69cb20ad928b29296da61a82ecd76ce01994928ab11ba76ceb8d4033bfbd55dd`.
Both native macOS binaries and both `.pkg` installers build successfully, and
`npm audit --omit=dev` reports zero vulnerabilities.

New suites added for the criteria above:
`framework/tests/figma-tokens.test.mjs`,
`framework/tests/figma-round-trip.test.mjs`,
`framework/tests/reference-integrity.test.mjs`,
`installer/tests/link.test.mjs`, `installer/tests/practice-tools.test.mjs`,
`framework/tests/structure.test.mjs`,
`framework/tests/skill-taxonomy.test.mjs`,
`framework/tests/workspace-mutations.test.mjs`,
`framework/tests/workspace-transactions.test.mjs`,
`installer/tests/workspace-safety.test.mjs`,
`installer/tests/sync-link.test.mjs`,
`installer/tests/sync-repository.test.mjs`,
`installer/tests/sync-figma.test.mjs`,
plus extensions to `framework/tests/design-check.test.mjs`,
`framework/tests/skill-invocation.test.mjs`,
`framework/tests/guardrail-negative.test.mjs`, and
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
- **The evidence import model (W11, deferred to 0.10).** No
  `evidence-import/v1` schema, no `design/evidence/imports/`, no
  `retention: evergreen | transient`, no `evidence-source` kind on
  `linked-source`, no freshness-based staleness, no `doctor` import
  diagnostic. `collect` declares where evidence came from
  (`payload.source_pin`); storing and drift-guarding the raw extract behind
  an import (a Slack export, an analytics pull) is a separate workstream —
  `linked-source` can pin a git revision but has no notion of freshness,
  which is what a live, ever-changing source actually needs. Recorded in
  `BACKLOG.md`.
- No `product-analytics` provider or transport, and no ticketing/chat
  capability at all yet — `collect` and `measure` degrade through them
  honestly rather than pretending they are served.

## Known gaps

- Only one shipped Figma transport (`figma-console-mcp`) has been verified
  against a live server; `figma-official-mcp` has not. Carried over from 0.8.
- The default transport ordering heuristic is still deliberately thin.
  Carried over from 0.8.
