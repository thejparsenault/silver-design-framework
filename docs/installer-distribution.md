# Installer and Configuration Distribution

## Recommendation

Keep the installer source in this repository and release it with the framework. Use:

1. **GitHub repository** as the canonical source, issue tracker, changelog, and release host.
2. **Immutable GitHub Releases** as the canonical downloadable artifacts and provenance boundary.
3. **A small scoped npm CLI** as the primary convenience command for the first public/internal users.

Working command shape:

```sh
npx --yes @scope/design-practice@0.1.0 setup
npx --yes @scope/design-practice@0.1.0 update
npx --yes @scope/design-practice@0.1.0 doctor
```

The exact package scope and final repository name should be selected when implementation starts. The current `design-system-base` name should not be published.

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
    design-practice
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

- `setup` — initialize or adopt a workspace and select project packages;
- `update` — compare a pinned installed base with a newer release and prepare reviewable changes;
- `doctor` — diagnose malformed config, missing files, incompatible packages, and stale generated indexes;
- `repair` — regenerate derived files and safe pointers;
- `migrate` — apply an explicit versioned schema migration;
- `version` — report CLI, payload, and workspace versions.

The CLI must not:

- run brand, theme, research, or prototype exercises;
- silently change production source;
- install workflow skills globally;
- select a new application stack after a workspace profile exists;
- apply updates or migrations without showing their effect;
- auto-start recommended next actions.

## Configuration Locations

### User Tool Profile

Use an XDG-style configuration location:

```text
$XDG_CONFIG_HOME/design-practice/config.yaml
```

Fallback:

```text
~/.config/design-practice/config.yaml
```

This file may contain:

- capability-to-provider preferences;
- default permission ceilings;
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
.design-framework/lock.yaml
```

The manifest describes the workspace and its logical artifacts. The lock describes the installed framework release, package versions, hashes, and managed-file bases needed for safe updates.

### Organization Configuration

Organization defaults are distributed as a pinned foundation package or referenced manifest. They do not silently modify user-global configuration.

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

When broader use begins, the source repository should ideally be public so users can inspect the code they are executing. If the framework must remain private, use a private npm scope and authenticated GitHub Releases rather than a public bootstrap that fetches private content.

## Security Basis

GitHub documents Releases as tag-based packaged iterations, and immutable releases prevent published tags and assets from being changed. Immutable releases also provide release attestations. GitHub artifact attestations can bind released software to its source commit and build workflow. npm supports scoped/versioned packages and provenance-oriented publishing workflows.

References:

- [About GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
- [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
- [npm packages and modules](https://docs.npmjs.com/packages-and-modules/)
