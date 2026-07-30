# Silver 0.5 Audit

Date: 2026-07-30. Scope: whether Silver 0.5.0 works cleanly for users of Claude
Code and Claude Cowork. Resolved in 0.6.0 unless noted.

## Summary

The architecture is sound and is not what needed fixing. Portable artifact /
local view / external view as distinct roles, effects-based authority,
provenance envelopes, and the separation of execution from acceptance from
downstream readiness all held up under inspection. `npm run validate:contracts`
passed at 0.5.0 across 42 schemas and 21 skill contracts, and the acceptance
audits are backed by real evidence rather than assertion.

Two defects made an installed workspace unusable from a normal agent host, and
one architectural gap blocks Cowork entirely.

## F1 — An installed workspace could not run its own skill runtime

**Severity: blocker. Fixed in 0.6.0.**

`silver setup` copied `framework/runtime/` into `.silver/runtime/`, but that code
imports `ajv`, `ajv-formats`, and `yaml` as bare specifiers and setup never
provisioned them into the workspace. Node resolves bare specifiers by walking
`node_modules` upward from the importing file, so any workspace not nested inside
a `node_modules` tree containing those packages failed with
`ERR_MODULE_NOT_FOUND`.

This broke the durable-output path for all 21 skills
(`.skills/<id>/scripts/invoke.mjs` → `.silver/runtime/invoke-skill.mjs` →
`contracts.mjs`) and the `what-now` analyzer, which imports `yaml` directly. It
followed exactly the install path the 0.5 README documented: clone Silver, run
`npm install` in the checkout, then set up a workspace elsewhere.

Reproduction against 0.5.0:

```sh
node bin/silver.mjs setup /tmp/probe --name Probe --id probe
cd /tmp/probe && node .skills/what-now/scripts/analyze-workspace.mjs --root .
# Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'yaml'
```

The dependency-free `design-check` runners were unaffected — that design goal
held, and 22 checks kept working.

`installer/tests/package-smoke.mjs` could not catch this: it installs the
tarball into `consumer/` and creates the workspace at `consumer/campaign-studio`,
so `consumer/node_modules` sits above the workspace and masks the failure. The
only configuration that worked was the one the README did not describe.

**Fix.** Execution routes through the CLI, which always runs from a Silver
installation where dependencies resolve: `silver invoke <skill-id> <request.json>`
and `silver what-now`. Setup generates `.silver/bin/silver`, a launcher giving
the workspace one stable command. The per-skill shim keeps its
`silver-design-framework/...` import — load-bearing, because `bundleDependencies`
places `yaml` inside the package's own `node_modules`, reachable only through the
package name — and now fails with an actionable message naming the CLI instead of
a bare resolution error. `installer/tests/agent-hosts.test.mjs` sets up a
workspace under `os.tmpdir()`, which has no ancestor `node_modules`, and is the
regression test the packaged smoke could not be.

## F2 — Claude Code saw neither the instructions nor the skills

**Severity: blocker. Fixed in 0.6.0.**

Setup wrote `AGENTS.md` and installed skills to `.skills/`. Claude Code reads
`CLAUDE.md` and not `AGENTS.md`, and discovers skills only under
`~/.claude/skills/`, `.claude/skills/`, and plugins. A Claude Code user in a
freshly set-up workspace got zero framework context at session start and none of
the 21 skills in autocomplete. The framework's entire discovery mechanism was
invisible to its most likely host.

A related refusal: `allowedBlankEntries` in `installer/setup.mjs` did not include
`.claude` or `CLAUDE.md`, so setup rejected an otherwise-empty folder that a
Claude Code user had already opened as "an existing codebase".

**Fix.** A generated adapter layer — `CLAUDE.md` importing `@AGENTS.md`,
`.claude/skills/<id>` symlinks into `.skills/`, and `allowed-tools` frontmatter
on every `SKILL.md`. `.skills/` and `AGENTS.md` stay canonical. Agent
instruction files no longer count against a blank target. See
[`agent-host-compatibility.md`](agent-host-compatibility.md).

## F3 — Cowork is an architectural gap, not a missing adapter

**Severity: blocker for Cowork. Documented, not fixed.**

Cowork loads only account-level ZIP skills, does no folder discovery, reads
neither `CLAUDE.md` nor `AGENTS.md`, and runs code in an isolated remote
environment reaching local files through the Desktop app. Silver's only
sanctioned durable-output path is a guarded Node invocation in the workspace.

Support requires a Node-free durable-output path and an uploadable skill
package. Both are recorded in `BACKLOG.md` and
[`agent-host-compatibility.md`](agent-host-compatibility.md). A Cowork user can
today read and edit workspace artifacts as files, but cannot run guarded
invocations or record results.

## F4 — The skill catalog generator was a live landmine

**Severity: high. Resolved by retirement in 0.6.0.**

`framework/scripts/build-skill-catalog.mjs` regenerated `skill.yaml`, `SKILL.md`,
`agents/openai.yaml`, and `scripts/invoke.mjs` for every skill from
`framework/catalog/skills.yaml`. That catalog was two releases stale: `version:
0.4.0`, 19 of 21 skills, and it emitted the pre-0.5 `permissions:` model rather
than `effects:`. Running it would have downgraded all 21 contracts to `0.4.0`,
invalidated lock integrity, broken the
`request.skill.version === contract.version` gate, and silently dropped the 0.5
effects model. Nothing invoked it and no gate checked it, which is why the drift
went unnoticed through two releases.

**Fix.** Retired. The 21 contracts are hand-maintained and enforced by
`npm run validate:contracts` in `npm run build` — real schema enforcement rather
than a second representation claiming to be able to rebuild them. `map` and
`practice-review` had already been written by hand with a deliberately different
`SKILL.md` shape, so no single template could reproduce all 21 anyway.

Removed alongside it: `framework/scripts/validate_contracts.py` and
`requirements-dev.txt`. The Node validator supersedes the Python one and covers
v1 schemas too; nothing invoked the Python script, and its only remaining trace
was a `pip install` instruction in the README's contributing section.

## F5 — Authoring a guarded invocation was a failure mode

**Severity: medium. Mitigated in 0.6.0.**

Producing any durable output required hand-authoring a
`silver/skill-invocation/v2` JSON: `invocation_id`, ISO timestamps, full file
content inline, a provenance envelope, pinned design-context revisions, check
results with `result_path`s, and a `sha256` `expected_integrity` for any existing
file. Every schema is `additionalProperties: false`, so a small mistake is a hard
error. The repository's own `complete-blank.mjs` scenario needs 1,077 lines to
construct these programmatically. The 0.5 README said "You do not normally need
to create skill-invocation JSON by hand" while every `SKILL.md` instructed
exactly that.

**Fix.** `silver invoke --scaffold <skill-id>` emits a schema-valid request
prefilled with the mechanical parts: identifiers, timestamps, contract-derived
output stubs, a provenance envelope with the active design context, required
check entries, and computed `expected_integrity` for outputs that already exist.
The agent supplies content and reasons. Placeholders carry a sentinel and
`silver invoke` refuses any request that still contains one, so a scaffold cannot
be submitted unmodified.

The underlying contract is unchanged. The scaffold reduces the cost of using it
correctly; it does not lower the bar.

## F6 — Standalone binary distribution is not close

**Severity: informational. Spike recorded in `DECISIONS.md`.**

A Bun-compiled `silver` would drop the Git + Node + `npm install` prerequisite
chain, which matters for a designer audience. The spike found it compiles
(61 MB, Bun 1.3.14) and runs correctly *interpreted* — `bun bin/silver.mjs`
completes setup and guarded invocation, so ajv's runtime codegen survives Bun.
The compiled binary fails on two counts:

1. **Payload.** 254 files must be embedded, and 42 schemas are `readdir`ed from
   real paths at runtime. `silver setup` fails at
   `ENOENT: /$bunfs/docs/brand/ag-mark.txt`. `copyNewTree`, `replaceTree`,
   `treeIntegrity`, and `snapshotFiles` all walk real directories, and
   `treeIntegrity` produces the `sha256:` values `doctor` and `update` compare
   against, so it cannot change behaviour.
2. **Module identity.** 28 modules guard their CLI entry with
   `process.argv[1] === fileURLToPath(import.meta.url)`. Bundling collapses those
   paths, so `silver version` spuriously executed a full `what-now` analysis and
   printed 96 lines of JSON before its answer.

Neither is fatal, but together they are a payload-layer refactor plus a
main-guard audit — sequenced after this release, not into it.

## Verification

```sh
npm run validate:contracts   # 42 schemas, 21 v2 skill contracts
npm run build                # contracts + reference build + 86 tests
npm run test:package         # exact offline 0.6.0 archive
```
