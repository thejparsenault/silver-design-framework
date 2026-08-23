export const FRAMEWORK_VERSION = "0.9.0";
export const LOCAL_SOURCE_REFERENCE = "silver-design-framework-local";
export const PACKAGE_NAME = "silver-design-framework";

// Primary channel. The registry serves an integrity hash, published versions are
// immutable, and corporate npm proxies can mirror it.
export const PACKAGE_SPEC = `${PACKAGE_NAME}@${FRAMEWORK_VERSION}`;

// Auth-free fallback for anyone who cannot reach the registry. npm accepts a
// remote tarball as a package spec, so this runs anonymously from the public
// repository without an npm account or token.
export const RELEASE_TAG = `v${FRAMEWORK_VERSION}`;
export const RELEASE_TARBALL_NAME = `${PACKAGE_NAME}-${FRAMEWORK_VERSION}.tgz`;
export const RELEASE_TARBALL_URL = `https://github.com/thejparsenault/${PACKAGE_NAME}/releases/download/${RELEASE_TAG}/${RELEASE_TARBALL_NAME}`;

// Where a person lands when they have nothing installed yet — the macOS
// installer package and the tarball both hang off this page. The launcher
// points here rather than at a tarball, because someone reading that message
// does not yet know which of the two they want.
export const RELEASE_PAGE_URL = `https://github.com/thejparsenault/${PACKAGE_NAME}/releases/tag/${RELEASE_TAG}`;
