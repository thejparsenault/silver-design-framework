export const FRAMEWORK_VERSION = "0.6.0";
export const LOCAL_SOURCE_REFERENCE = "silver-design-framework-local";

// Canonical distribution artifact for this exact version. npm accepts a remote
// tarball as a package spec, so this runs anonymously from a public repository
// without an npm account or a registry token.
export const RELEASE_TAG = `v${FRAMEWORK_VERSION}`;
export const RELEASE_TARBALL_NAME = `silver-design-framework-${FRAMEWORK_VERSION}.tgz`;
export const RELEASE_TARBALL_URL = `https://github.com/thejparsenault/silver-design-framework/releases/download/${RELEASE_TAG}/${RELEASE_TARBALL_NAME}`;
