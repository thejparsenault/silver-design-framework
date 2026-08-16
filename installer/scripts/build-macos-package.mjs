// Build unsigned macOS installer packages from native payloads. Signing and
// notarization are intentionally separate release steps: identities and Apple
// credentials never belong in this repository or its build output.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, symlink, writeFile, cp } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { FRAMEWORK_VERSION } from "../version.mjs";

const run = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const nativeRoot = path.join(repositoryRoot, "dist", "native");
const packageRoot = path.join(repositoryRoot, "dist", "pkg");
const architectures = ["arm64", "x64"];
const packageIdentifier = "com.thejparsenault.silver";

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function buildPackage(architecture) {
  const nativePayload = path.join(nativeRoot, `macos-${architecture}`, "payload");
  const stagingRoot = path.join(packageRoot, "staging", architecture);
  const installRoot = path.join(
    stagingRoot,
    "usr",
    "local",
    "lib",
    "silver",
    FRAMEWORK_VERSION,
  );
  const commandLink = path.join(stagingRoot, "usr", "local", "bin", "silver");
  const component = path.join(packageRoot, "components", `silver-${architecture}.pkg`);
  const requirements = path.join(packageRoot, "components", `requirements-${architecture}.plist`);

  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(path.dirname(installRoot), { recursive: true });
  await cp(nativePayload, installRoot, { recursive: true });
  await mkdir(path.dirname(commandLink), { recursive: true });
  await symlink(
    path.join("..", "lib", "silver", FRAMEWORK_VERSION, "bin", "silver"),
    commandLink,
  );
  await mkdir(path.dirname(component), { recursive: true });
  await rm(component, { force: true });
  await run(
    "pkgbuild",
    [
      "--root",
      stagingRoot,
      "--identifier",
      packageIdentifier,
      "--version",
      FRAMEWORK_VERSION,
      "--install-location",
      "/",
      "--ownership",
      "recommended",
      component,
    ],
    { cwd: repositoryRoot, maxBuffer: 64 * 1024 * 1024 },
  );
  await writeFile(
    requirements,
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>os</key><array><string>13.0</string></array><key>arch</key><array><string>${architecture === "arm64" ? "arm64" : "x86_64"}</string></array></dict></plist>\n`,
    "utf8",
  );
  const product = path.join(packageRoot, `Silver-${FRAMEWORK_VERSION}-macos-${architecture}.pkg`);
  await rm(product, { force: true });
  await run(
    "productbuild",
    [
      "--product",
      requirements,
      "--package",
      component,
      "--identifier",
      packageIdentifier,
      "--version",
      FRAMEWORK_VERSION,
      product,
    ],
    { cwd: repositoryRoot, maxBuffer: 64 * 1024 * 1024 },
  );
  return product;
}

const packageManifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
if (packageManifest.version !== FRAMEWORK_VERSION) {
  throw new Error(
    `package.json is ${packageManifest.version} but installer/version.mjs is ${FRAMEWORK_VERSION}.`,
  );
}

await mkdir(packageRoot, { recursive: true });
const packages = [];
for (const architecture of architectures) {
  packages.push(await buildPackage(architecture));
}
await writeFile(
  path.join(packageRoot, "README.txt"),
  `Silver ${FRAMEWORK_VERSION} macOS packages\n\nInstall the package matching your Mac:\n- arm64: Apple Silicon\n- x64: Intel\n\nThese are unsigned local build artifacts. Sign and notarize release copies before public distribution.\n`,
  "utf8",
);
await writeFile(
  path.join(packageRoot, "SHA256SUMS"),
  `${(await Promise.all(
    packages.map(async (component) => `${await sha256(component)}  ${path.basename(component)}`),
  )).join("\n")}\n`,
  "utf8",
);
for (const component of packages) {
  console.log(path.relative(repositoryRoot, component));
}
