# Installer and Configuration Distribution

## Recommendation

Keep the installer source in this repository and release it with the framework. Use:

1. **GitHub repository** as the canonical source, issue tracker, changelog, and release host.
2. **Immutable GitHub Releases** as the canonical downloadable artifacts and provenance boundary.
3. **A small scoped npm CLI** as the primary convenience command for the first public/internal users.

Working command shape:

```sh
npx --yes @scope/silver@0.5.0 setup inspect . --answers ./answers.json --json
npx --yes @scope/silver@0.5.0 setup apply ./setup-plan.json --json
npx --yes @scope/silver@0.5.0 doctor .
```

The repository name is `silver-design-framework`, the local package identity is
`silver-design-framework`, and the executable is `silver`. A future scoped
publication should use a package such as `@scope/silver`; the exact publishing
scope remains to be selected.

## Why This Shape

The installer and the framework contracts evolve together. Keeping them in one repository makes every release testable as a unit and avoids compatibility drift between an installer repository and a payload repository.

The npm package is a release channel, not the source of truth and not a permanent runtime dependency. It provides:

- a familiar one-command experience;
- explicit versions;
- integrity-checked package downloads;
- no global installation;
- straightforward Node-based fixture testing;
- a path to npm provenance and trusted publishing.

The package should have no install-time lifecycle scripts, keep runtime dependencies minimal, and state its supported Node versions explicitly.

GitHub Releases provide versioned archives, notes, checksums, and attestable provenance. Published releases should be immutable so tags and assets cannot be changed after users install them.

Do not make `curl .../main/install.sh | sh` the primary path. It executes mutable remote code, obscures the version being installed, and is difficult to audit or reproduce. A future shell bootstrap may download a specific immutable release, verify its checksum or attestation, and then run it, but that is not needed for the first iteration.

## Package Contents

The npm CLI should contain enough of one framework release to install offline after package download:

```text
package/
  bin/
    silver
  installer/
  payload/
    framework/
    skills/
    checks/
    recipes/
    adapters/
    reference-system/
  release-manifest.json
```

Bundling the matching payload avoids a second unpinned request to GitHub during setup. `release-manifest.json` records package versions and hashes.

The CLI package should stay thin. Skill-specific scripts remain inside their skill packages even when those packages are bundled in the release payload.

## Release Model

Use semantic versions:

- patch: safe fixes to installer behavior, checks, or skill instructions;
- minor: backward-compatible schemas, packages, recipes, or capabilities;
- major: breaking contract or ownership changes.

Recommended channels:

- exact versions for reproducible setup and CI;
- `next` for prerelease testing;
- `latest` only after fixture validation;
- optional organization-pinned channel later.

Release workflow:

1. Run schema, fixture, installer idempotence, update-preservation, and package-content tests.
2. Build the npm package and matching GitHub release archive from the same commit.
3. Generate checksums and provenance.
4. Publish a draft GitHub Release with all assets.
5. Publish the immutable release.
6. Publish the npm package using trusted publishing/provenance.
7. Verify a clean blank-folder install from the published artifact.

The project lock records the exact installed version, not `latest`.

## CLI Boundaries

Supported responsibilities:

- `setup inspect` — discover state and produce a reviewable, state-locked
  integrated or separate repository plan;
- `setup apply` — initialize or adopt a workspace from that approved plan;
- `practice apply` — apply an approved sanitized My Practice proposal and
  create its local revision;
- `trace` — render durable artifact provenance;
- `update` — compare a pinned installed base with a newer release and prepare reviewable changes;
- `doctor` — diagnose malformed config, missing files, incompatible packages, and stale generated indexes;
- `repair` — regenerate derived files and safe pointers;
- `migrate` — apply an explicit versioned schema migration;
- `version` — report CLI, payload, and workspace versions.

The CLI must not:

- run brand, theme, flow, research, or prototype exercises;
- silently change production source;
- install workflow skills globally;
- select a new application stack after a workspace profile exists;
- apply updates or migrations without showing their effect;
- auto-start recommended next actions.

## Configuration Locations

### User Tool Profile

Use an XDG-style configuration location:

```text
$XDG_CONFIG_HOME/silver/config.yaml
```

Fallback:

```text
~/.config/silver/config.yaml
```

This file may contain:

- capability-to-provider preferences;
- provider and interaction preferences;
- non-secret provider identifiers;
- display and interaction preferences.

It must not contain:

- workflow skills;
- project design guidance;
- credentials or access tokens;
- project-specific authority rules.

Authentication stays with the provider, environment, or operating-system credential store.

### Project Configuration

```text
design/manifest.yaml
design/integrations/<binding-id>.yaml
design/guidance/sources.yaml
design/sources/sources.yaml
.silver/lock.yaml
.silver/providers/<provider-id>/
.silver/results/reconciliation/
```

The manifest describes the workspace and its logical artifacts. Project-owned
integration bindings declare external object IDs, authority, mapping profiles,
and synchronization policy without storing credentials. Installed provider
packages are framework-managed. Reconciliation results are generated,
reviewable records rather than canonical artifacts. The lock describes the
installed framework release, package versions, hashes, and managed-file bases
needed for safe updates.

### Organization Configuration

Company or team guidance is manually linked to a workspace from selected paths
in a local folder or Git repository. Silver never discovers or activates it
automatically. Git sources pin a commit; non-Git sources snapshot only reviewed
files. Influence is declared as `reference`, `preferred`, or `required`, and
updates are reviewable re-pin proposals rather than semantic synchronization.

## Update Behavior

Installed content falls into four ownership classes:

- **generated** — safe to regenerate from canonical inputs;
- **framework-managed** — update through an exact known base;
- **copied-and-owned** — seeded once, then changed only through an explicit proposal;
- **project-owned** — never overwritten by the updater.

Updates should use a three-way comparison:

```text
installed base ↔ project version ↔ new release
```

Unambiguous framework-only changes may be proposed automatically. Any overlap with project edits becomes a conflict requiring review. The default update policy is notify, not automatic application.

## Private First, Public Later

For the first iteration:

- keep the GitHub repository private if desired;
- test the package as a local tarball and then a private prerelease;
- avoid reserving a public npm name until the product name is settled;
- validate blank setup and update fixtures before creating a public install command.

Verify the exact `0.5.0` packed payload and its behavior in an isolated consumer
with:

```sh
npm run build
npm run test:package
```

The prerelease tarball bundles the CLI's small runtime dependencies. The smoke
test therefore installs fully offline using a temporary npm cache and does not
write a tarball or installed dependencies into the repository. Publishing
remains deferred until a private package scope or GitHub release destination is
selected.

When broader use begins, the source repository should ideally be public so users can inspect the code they are executing. If the framework must remain private, use a private npm scope and authenticated GitHub Releases rather than a public bootstrap that fetches private content.

## Security Basis

GitHub documents Releases as tag-based packaged iterations, and immutable releases prevent published tags and assets from being changed. Immutable releases also provide release attestations. GitHub artifact attestations can bind released software to its source commit and build workflow. npm supports scoped/versioned packages and provenance-oriented publishing workflows.

References:

- [About GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
- [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
- [npm packages and modules](https://docs.npmjs.com/packages-and-modules/)

## Publish Checklist

The package is publish-ready. What remains is a scope decision and the publish
itself, which is not automated because it needs an npm account.

Verified as of `0.6.1`:

- `npm pack` produces a 1,073-file archive that installs fully offline and
  passes `npm run test:package`.
- `npx --package <tarball> silver setup inspect . --json` works from a directory
  with no Silver checkout, and the full
  `setup inspect … --json | setup apply -` pipeline installs a working
  workspace.
- `bin/silver.mjs` refuses Node older than 20.11 with install instructions
  rather than a syntax error.
- The generated workspace launcher detects an ephemeral npx install and resolves
  through `npx --yes silver-design-framework@<version>` instead of an absolute
  path into the npx cache, which npm garbage-collects.

### How npx resolves the command

`npx <spec>` installs the package, then picks a binary from it. A package with
exactly one `bin` runs that binary whether or not its name matches the package.
`@anthropic-ai/claude-code` exposing `claude`, and `@11ty/eleventy` exposing
`eleventy`, both work this way; the latter was verified directly:

```sh
$ npx --yes @11ty/eleventy@3.0.0 --version
3.0.0
```

Silver declares exactly one bin, `silver`, so `npx silver-design-framework@0.6.1
setup inspect . --json` resolves to it. This cannot be verified against the
registry before publishing, so confirm it immediately after the first publish.
The unambiguous form always works and is the safe fallback for documentation:

```sh
npx --yes --package silver-design-framework@0.6.1 silver setup inspect . --json
```

**Never document `npx silver`.** An unrelated `silver` package already exists on
npm at version 1.0.0, so that command runs a stranger's code.

### Choosing a registry

The choice is dictated by what a consumer must do before `npx` works, not by
where the code lives.

| Channel | Consumer needs | Name required | Repo visibility |
| --- | --- | --- | --- |
| npmjs.com, public | nothing | any, `silver-design-framework` is free | any |
| GitHub Release asset | nothing | any | **public** |
| GitHub Packages | a GitHub PAT and an `.npmrc` | `@OWNER/NAME` | any |

**GitHub Packages requires every consumer to authenticate, including for public
packages.** GitHub's own documentation states you need an access token to
"publish, install, and delete private, internal, and public packages", and the
npm registry there only accepts scoped names. Publishing Silver's CLI to GitHub
Packages means a designer must create a GitHub account, mint a `read:packages`
token, and write `~/.npmrc` before `npx` will run. That is worse than the
current clone-from-source path and defeats the purpose of publishing. Use it
only if every intended user already has GitHub access to this repository.

**A GitHub Release asset needs no npm account at all.** npm accepts a remote
tarball as a package spec and resolves its single bin, verified directly:

```sh
$ npx --yes https://registry.npmjs.org/cowsay/-/cowsay-1.6.0.tgz "url spec works"
 ________________
< url spec works >
```

So this works anonymously, provided the repository is public so the asset is
anonymously downloadable:

```sh
npx --yes https://github.com/thejparsenault/silver-design-framework/releases/download/v0.6.1/silver-design-framework-0.6.1.tgz setup inspect . --json
```

Release assets on a **private** repository require authentication to download,
so this option depends on making the repository public.

### Where a token goes

Never in a committed file. `.npmrc` is gitignored for this reason.

For a laptop, put credentials in `~/.npmrc` and restrict it with
`chmod 600 ~/.npmrc`:

```ini
@OWNER:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
```

To keep a project-level `.npmrc` that is safe to commit, reference an
environment variable instead of the secret. npm expands `${VAR}` at read time:

```ini
@OWNER:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Export `NODE_AUTH_TOKEN` from a password manager rather than typing it into a
shell that records history.

In GitHub Actions no PAT is needed; the automatic `GITHUB_TOKEN` can publish to
GitHub Packages for its own repository:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    registry-url: https://npm.pkg.github.com
- run: npm publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

For npmjs.com, use a granular automation token in
`secrets.NPM_TOKEN` with `registry-url: https://registry.npmjs.org`.

Publishing to GitHub Packages also requires a scoped name and a matching
`publishConfig` in `package.json`:

```json
{
  "name": "@OWNER/silver-design-framework",
  "publishConfig": { "registry": "https://npm.pkg.github.com" }
}
```

That rename touches the 82 files listed below, including the workspace launcher
and the fallback import in every skill shim.

### Before the first publish

1. **Keep the name `silver-design-framework`.** It is unclaimed on npm, and 82
   files already reference it — the workspace launcher, the fallback import in
   every `framework/skills/*/scripts/invoke.mjs`, the README, and the tests.
   A scoped rename such as `@scope/silver` buys nothing here, because npx
   resolves the single bin either way, and costs a repo-wide rename plus a
   `launcherCommand()` change in `installer/agent-adapters.mjs`.
2. **Publish public.** A private scope makes `npx` users run `npm login` first,
   which removes the entire ergonomic benefit for a designer audience. The CLI
   can be public while design repositories stay private.
3. **Remove `"private": true`** from `package.json`. It is set deliberately and
   blocks both `npm publish` and `npm publish --dry-run`.
4. **Dry run first:** `npm publish --dry-run` and check the file list.
   `prepublishOnly` runs `npm run build` and `npm run test:package`, so a
   failing gate blocks the publish.
5. **Publish with provenance from CI**, not a laptop:
   `npm publish --access public --provenance`. Provenance requires a supported
   CI environment; from a laptop, `npm publish --access public`.
6. **Verify immediately:**

   ```sh
   npx --yes silver-design-framework@0.6.1 version          # expect 0.6.1
   npx --yes silver-design-framework@0.6.1 setup inspect . --json
   ```

7. **Verify the npx launcher.** Until publication, a workspace installed from a
   local tarball generates a launcher that resolves through npx and cannot find
   the package. After publishing, run `.silver/bin/silver version` in such a
   workspace.
8. **Cut the matching immutable GitHub Release** so the npm artifact and the
   tagged source agree.
