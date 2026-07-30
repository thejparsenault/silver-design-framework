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

Verified as of `0.6.0`:

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

Before the first publish:

1. **Choose the package name.** The launcher, the README, and
   `installer/agent-adapters.mjs` all reference `silver-design-framework`. A
   scoped name such as `@scope/silver` requires updating
   `launcherCommand()` in `agent-adapters.mjs`, the `package.json` `name`, the
   fallback import specifier in every `framework/skills/*/scripts/invoke.mjs`,
   and the README. Grep for `silver-design-framework` before deciding.
2. **Decide public or private.** A private scope means `npx` users need
   `npm login`, which removes most of the ergonomic benefit for a designer
   audience. Prefer public for the CLI even if the design repository stays
   private.
3. **Remove `"private": true`** from `package.json`. It is currently set and
   will block publishing.
4. **Publish with provenance** from CI rather than a laptop:
   `npm publish --access public --provenance`.
5. **Verify the npx launcher end to end.** Until the package is published, a
   workspace installed from a local tarball generates a launcher that resolves
   through npx and cannot find the package. This resolves on publication; run
   `npx --yes <name>@<version> version` once to confirm.
6. **Cut the matching immutable GitHub Release** so the npm artifact and the
   tagged source agree.
