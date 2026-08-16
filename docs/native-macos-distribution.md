# Native macOS distribution

Silver's macOS delivery is a compiled Bun executable plus the versioned
framework payload it installs. The user runs a normal native `silver` command;
they do not need Node.js, npm, or Bun. Keeping the framework payload as files
beside the executable preserves Silver's existing byte-for-byte package
integrity and makes the installed framework inspectable.

## Build an unsigned local proof

```sh
npm run build:native
npm run package:macos
```

This produces one executable per architecture under `dist/native/` and these
installer archives:

- `dist/pkg/Silver-<version>-macos-arm64.pkg` for Apple Silicon
- `dist/pkg/Silver-<version>-macos-x64.pkg` for Intel Macs

Each package requires macOS 13 or newer and installs:

```text
/usr/local/bin/silver -> /usr/local/lib/silver/<version>/bin/silver
```

The installer needs an administrator password because `/usr/local/bin` is a
system-wide command location. It does not alter a user's shell configuration.

## Sign and notarize a public release

Build artifacts are intentionally unsigned. On the release Mac, first confirm
that the Keychain contains a **Developer ID Application** certificate and a
separate **Developer ID Installer** certificate. Keep the certificate names
and notarization credentials in Keychain or CI secrets; never commit them.

Sign each architecture's executable with the Developer ID Application identity
and `installer/macos/bun-entitlements.plist`, then rebuild the matching package
and sign that package with the Developer ID Installer identity. Submit each
signed package to Apple's notary service, wait for acceptance, staple the
notarization ticket, and verify the result with `spctl`.

The GitHub release should contain only the signed, notarized `.pkg` files plus
their SHA-256 checksums and the npm tarball/checksum. All release assets use
the same `0.9.0` version and `v0.9.0` tag.

## Update behavior

A future package installs its binary and payload under a new versioned
directory and replaces `/usr/local/bin/silver` with a link to that version.
Workspaces created by native Silver retain an absolute fallback to the exact
native executable that created them; if it is no longer present, their existing
npm fallback remains available for environments that use Node.
