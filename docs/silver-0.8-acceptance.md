# Silver 0.8 — Tools That Are Actually There

## Why this release exists

0.7 made the runtime honest about checks. This release makes it honest about
tools.

The vocabulary for capabilities, providers, and degraded coverage was complete
and enforced. The layer that chooses between them was not built:

- `resolveCapabilities()` mapped a capability to a provider by **alphabetical
  first-wins**, ignoring even the skill's own `optional[].providers` hints.
- `selectProvider(providers, capability, preferred)` implemented ordered
  preference and had **zero callers**.
- `tool-profile.schema.json` carried a `priority` per (capability, provider) and
  **nothing loaded one from disk**; its only instance was a test fixture.
- `permissions.mjs:155` contained an unreachable `local-fallback` branch.
- `framework/providers/figma/scripts/health.mjs` returned `available: false`
  unconditionally.

So there was nothing to choose between, and nothing doing the choosing.

"Figma" was also the wrong unit. What a designer picks is a *transport*, and the
transports to one tool are good at different jobs — one writes into the document
you have open, another is better at structured reads. That distinction cannot be
expressed while `figma` is a single provider.

## Goal

A designer's preferred tool is used when it is there, and when it is not, they
are told which one, why, and what they can do about it — rather than having a
substitute chosen for them.

## Criteria

Each criterion needs direct automated evidence. `S08-*` ids are stable.

### Naming the work

- **S08-A-01** Activities name a capability, its actions, and optionally the
  artifact kinds involved. Provider and skill support is **derived** from their
  existing contracts; no provider or skill declares an activity.
- **S08-A-02** A provider serving only some of an activity's actions does not
  support it, and artifact kinds separate pushing a token source from pushing a
  flow when both are `(design-file, write)`.
- **S08-A-03** Catalog drift fails the contract gate in both directions: a
  `served` activity with no provider, and a `planned` activity that a shipped
  provider covers.

### Transports

- **S08-T-01** Providers declare a `target`, a `variant`, and `aliases`, so
  several transports to one tool are separate and individually selectable.
- **S08-T-02** A transport declares a setup ladder of typed steps, each naming
  who owns it and who can verify it. An unavailable transport reports the
  failing step rather than a bare absence.
- **S08-T-03** Availability distinguishes `configured` from `responding`. Silver
  never claims `responding`, because only the agent can call an MCP server.
- **S08-T-04** A superseded provider package is removed by migration rather than
  left to compete for the activities it used to serve.

### Choosing

- **S08-C-01** Order is personal, project, team, framework; the first source
  that binds an activity wins outright, and sources are not merged.
- **S08-C-02** Two filters always apply: availability, and a veto from a
  project, team, organization, or machine policy. A veto is not overridable by
  preferring something.
- **S08-C-03** Pulling from and pushing to the same tool resolve to different
  transports in one workspace.
- **S08-C-04** A chain is an offer list. With the preferred transport
  unavailable, nothing below it is selected unless `on_unavailable: use_next`
  was chosen deliberately.
- **S08-C-05** Where nobody can be asked, the run stops rather than choosing
  unattended.

### Nothing removed silently

- **S08-N-01** Every removed transport is recorded with its reason, its source
  when vetoed, the failing setup step when unavailable, and who can lift it.
- **S08-N-02** `silver tools` reports, per activity, the selected transport,
  which source ordered it, everything removed, and what would work if set up.
- **S08-N-03** A fallback is reported as a fallback and names what it replaced.

### Declaring, never installing

- **S08-D-01** Silver writes an agent host's MCP declaration only for an
  installed tool and only on explicit `--connect`.
- **S08-D-02** No code path executes a `terminal` or `background-process` setup
  step. Silver installs nothing, clones nothing, and launches nothing.
- **S08-D-03** A generated declaration never contains a credential, and Silver
  refuses to rewrite a host config that already holds one.
- **S08-D-04** Where Silver does not know how a server is launched, it says so
  and returns the manual steps rather than guessing a command.

### Knowing only what it knows

- **S08-K-01** An MCP server in the host that no shipped adapter claims is
  reported as unmapped, and is never selected for any activity.
- **S08-K-02** When nothing can serve an activity, Silver names the shipped
  transports that could and prints their ladders. It does not search for tools
  and does not propose ones it has not shipped.

### Carried forward from 0.7

- **S08-P-01** A studio-voice practice change writes `studio-voice.md` and
  changes what `resolveStudioVoice()` returns. Before this it appended prose to
  `PRACTICE.md`, which the resolver never reads — validating, committing,
  reporting success, and doing nothing.

## Evidence

`installer/tests/tools-that-are-there.test.mjs` covers the above directly. The
release gates are `npm run build` and `npm run test:package`.

## Deliberately not in this release

Deferred to 0.9, with the shapes they need already in place:

- **`My Practice/tools.yaml`.** Personal is the first ordering source and the
  resolver reads it today; the file and its authoring path are 0.9. Project
  preferences work now.
- **Conversational override and promotion.** `aliases` are declared and unique
  so "use the official Figma MCP instead" can resolve, but nothing resolves them
  yet, and no override is promoted to a durable binding.
- **Team layer.** The veto and order shapes are in the contract and the resolver
  reads a `team` source; nothing links one yet.
- **Presets.** Saved options and default overrides.
- **Git-optional My Practice.** Sync-service detection and `synced-folder`.
- **`PRACTICE.md` as a generated view.** `practice apply` routes studio voice to
  its real file now; the remaining sections still land as prose.

Out of scope entirely:

- Any Silver-owned network transport, credential handling, or process
  supervision. This is a boundary, not a gap.
- A maintained ranking of third-party tools.
- Claude Cowork support.

## Known gaps

- **Only one shipped transport is verified end to end.** `figma-console-mcp` was
  developed against a live server; `figma-official-mcp` is declared from Figma's
  published remote endpoint and has not been exercised here.
- **The default ordering heuristic is thin on purpose** — prefer configured,
  prefer no local build, then alphabetical. It is not a claim about which tool is
  better, and it should get stronger from real use rather than from guessing.
- **`silver setup <dir>` still refuses any folder containing `package.json`**,
  which after `npm install` is every folder. Carried over from 0.7.
