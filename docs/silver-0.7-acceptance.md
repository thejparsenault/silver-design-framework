# Silver 0.7 — One Good Step

## Why this release exists

A real session took Silver `0.6.1` from `npm install` through brand, design
system, and a Vite prototype in `~/Projects/exploring/task-tracker`. It
finished, but only after manual diagnosis, manifest editing, two `silver repair`
runs, Git initialization, recovery from a half-applied invocation, a second
nested `npm install`, and moving `node_modules` out of the workspace to get
checks to pass. The report is `SILVER_DESIGN_FRAMEWORK_BUG_REPORT.md`, and it
lists 22 issues.

Underneath most of them were three things:

1. **The runtime never ran a check.** `silver invoke --scaffold` hard-coded
   `not-run` for every required check and the runtime believed whatever the
   request claimed. A result could report six passing checks while
   `.silver/results/checks/` did not exist. Accepted artifacts never reached
   `ready`, the manifest never advanced past `draft`, and `what-now` kept
   recommending work that was already done.
2. **A failure after the first write was unrecoverable.** Outputs landed, then
   the Git checkpoint failed, and an identical retry was refused for overwriting
   files the failed attempt had created.
3. **Nothing told the agent to stop.** The rule that a leaf skill runs only
   itself lived in `docs/`, which is not shipped into a workspace. The README
   presented the design loop as a ten-step chain. So the agent ran brand into
   system into prototype unattended, and the designer waited an hour for a
   result they could not steer.

The release also separates *how the agent talks* from *what the skills do*, so
tone can be set once and skills can be upgraded without changing register.

## Goal

A workspace where one skill runs, its checks actually run, the result tells the
truth, and the agent comes back with a couple of directions rather than an hour
of unattended work.

## Criteria

Each criterion needs direct automated evidence. `S07-*` ids are stable.

### Honest results

- **S07-R-01** A required check status is believed only when its evidence file
  exists and agrees. A claimed `pass` without resolvable evidence is recorded as
  `not-run` with the reason, in both completed and blocked results.
- **S07-R-02** A guarded invocation runs its own required checks and writes one
  evidence file per checker under `.silver/results/checks/`.
- **S07-R-03** `execution.status` distinguishes `complete`,
  `complete-awaiting-verification` (nothing wrong, but a required check could
  not run), and `complete-with-findings` (something is wrong).
- **S07-R-04** Persisting a result is recorded as a declared and observed
  effect for every skill, so no operation can describe itself as read-only while
  writing.
- **S07-R-05** Declared and observed effects are deduplicated before validation
  and persistence.

### Atomic canonical activation

- **S07-A-01** When an accepted invocation writes a canonical artifact that
  declares itself `active`, the manifest, `design/INDEX.md`, and
  `.silver/lock.yaml` are updated in the same invocation.
- **S07-A-02** All of those paths appear in the same Git checkpoint commit.
- **S07-A-03** A manifest status edit preserves surrounding formatting and
  comments; flipping one field produces a one-line diff.
- **S07-A-04** `silver repair` and the 0.6-to-0.7 migration reconcile a manifest
  that already disagrees with its artifacts.

### Recoverable invocations

- **S07-C-01** An accepted invocation confirms Git can commit before writing
  canonical files, and refuses with nothing written when it cannot.
- **S07-C-02** A failure after outputs are written leaves a resumable request
  with fresh `expected_integrity` values and an exact retry command.

### One step at a time

- **S07-S-01** Generated `AGENTS.md` and `CLAUDE.md` state that the agent runs
  one skill, reports what its checks said, offers two or three next moves, and
  waits.
- **S07-S-02** Recipes and implementation profiles carry
  `status: offered | selected` and are never adopted by default.
- **S07-S-03** A playbook declaring `autonomy.mode: single-step` advances
  exactly one node at a time; the shipped default loop declares it.

### My Practice as the single home for personal preference

- **S07-V-01** A framework default studio voice ships, is schema-valid, and
  renders into generated `AGENTS.md`.
- **S07-V-02** A personal studio voice in My Practice replaces the default, and
  method overlays in My Practice are loaded, validated, and applied.
- **S07-V-03** Personal preference is materialized into a workspace as one
  untracked file, never appears in a committed file, and `.gitignore` is
  maintained so it cannot be.
- **S07-V-04** No skill package prose is required to change for a tone or
  preference change, and no personal content lives in a skill package or a
  workspace-authored file.
- **S07-V-05** A new practice seeds both override points so they are
  discoverable, and the seeded starters are inert until deliberately activated.
- **S07-V-06** An invalid personal file is reported by `doctor` rather than
  silently ignored, and never prevents using the workspace.
- **S07-V-07** Removing personal files reverts a workspace completely.

### Installed-path correctness

- **S07-I-01** The generated launcher resolves the CLI relative to the workspace
  and contains no absolute path when Silver was installed into that workspace.
  A Windows launcher never carries a POSIX path.
- **S07-I-02** `allowed-tools` advertises only paths that work; no skill offers
  direct script execution that cannot resolve its dependencies.
- **S07-I-03** Adapter skill names are namespaced so generic ids cannot be
  shadowed, while `.skills/<id>` and contract ids are unchanged.
- **S07-I-04** Installing the package prints the safe next command.

### Clean by default

- **S07-D-01** A freshly created workspace produces zero doctor diagnostics, no
  `repair-workspace` recommendation, and no fixture language in its manifest.
- **S07-D-02** Directory-backed and structured artifact kinds are classified
  once and inspected the same way by `what-now`, `doctor`, and `design-check`.
- **S07-D-03** Design checks skip dependency, build, and cache directories.
- **S07-D-04** Setup questions carry a plain-language explanation, per-option
  effects, external paths, and reversibility — including that My Practice lives
  outside the project, and that Git is worth having before apply.
- **S07-D-05** Setup states the reference system's separate install step.
- **S07-D-06** A runnable prototype ships human-facing run instructions.

## Evidence

`installer/tests/one-good-step.test.mjs` covers the reported defects directly.
The release gates are `npm run build` and `npm run test:package`.

## Out of scope

- Claude Cowork support and the Node-free durable-output path it needs.
- A `silver playbook` command.
- The broader recipe set beyond `static-html`.
- Deep existing-codebase adoption.
- Recording studio-voice revisions in provenance envelopes, which would put
  personal practice revisions into committed result records.
