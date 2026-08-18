// Produce the exact release artifact and print the commands that publish it.
// Runs both release gates first: a tarball nobody verified is not a release.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  FRAMEWORK_VERSION,
  PACKAGE_SPEC,
  RELEASE_TAG,
  RELEASE_TARBALL_NAME,
  RELEASE_TARBALL_URL,
} from "../version.mjs";

const execute = promisify(execFile);
const run = (file, args, options = {}) => execute(file, args, {
  timeout: 10 * 60 * 1000,
  killSignal: "SIGKILL",
  ...options,
});
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const distributionRoot = path.join(repositoryRoot, "dist");
const skipGates = process.argv.includes("--skip-gates");

async function gate(name, args, options = {}) {
  process.stdout.write(`  ${name}… `);
  try {
    await run("npm", args, {
      cwd: repositoryRoot,
      maxBuffer: 64 * 1024 * 1024,
      ...options,
    });
    process.stdout.write("pass\n");
  } catch (error) {
    process.stdout.write("FAIL\n");
    throw new Error(
      `${name} failed; release aborted.\n${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`,
    );
  }
}

const packageManifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
if (packageManifest.version !== FRAMEWORK_VERSION) {
  throw new Error(
    `package.json is ${packageManifest.version} but installer/version.mjs is ${FRAMEWORK_VERSION}.`,
  );
}

if (skipGates) {
  console.log("Skipping release gates (--skip-gates).");
} else {
  console.log("Release gates:");
  await gate("npm run build", ["run", "build"], { timeout: 20 * 60 * 1000 });
  await gate("npm run test:package", ["run", "test:package"]);
}

await rm(distributionRoot, { force: true, recursive: true });
await mkdir(distributionRoot, { recursive: true });
const { stdout } = await run(
  "npm",
  ["pack", "--ignore-scripts", "--json", "--pack-destination", distributionRoot],
  { cwd: repositoryRoot, maxBuffer: 32 * 1024 * 1024 },
);
const packed = JSON.parse(stdout)[0];
if (packed.filename !== RELEASE_TARBALL_NAME) {
  throw new Error(
    `Packed ${packed.filename} but the release URL expects ${RELEASE_TARBALL_NAME}.`,
  );
}

const tarballPath = path.join(distributionRoot, packed.filename);
const digest = createHash("sha256")
  .update(await readFile(tarballPath))
  .digest("hex");
await writeFile(
  path.join(distributionRoot, `${packed.filename}.sha256`),
  `${digest}  ${packed.filename}\n`,
  "utf8",
);

console.log(`
Artifact
  dist/${packed.filename}
  ${packed.files.length} files, ${packed.size} bytes
  sha256:${digest}

Publish — npm (primary channel; the launcher resolves through it)
  npm publish --access public
  # from CI with OIDC, add --provenance

Publish — GitHub release (auth-free fallback and provenance anchor)
  git tag -a ${RELEASE_TAG} -m "Silver ${FRAMEWORK_VERSION}"
  git push origin ${RELEASE_TAG}
  gh release create ${RELEASE_TAG} \\
    dist/${packed.filename} dist/${packed.filename}.sha256 \\
    --title "Silver ${FRAMEWORK_VERSION}" --notes-file docs/release-notes/${RELEASE_TAG}.md

Verify both, in a shell with no npm login
  npx --yes ${PACKAGE_SPEC} version
  npx --yes ${RELEASE_TARBALL_URL} version
`);
