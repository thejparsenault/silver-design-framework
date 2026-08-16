// Build the native Silver command and the inspectable payload it installs.
// The executable contains Bun, the CLI, and its npm dependencies; framework
// content stays as normal files beside it so setup/update integrity remains
// byte-identical to npm distribution.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { FRAMEWORK_VERSION } from "../version.mjs";

const run = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const nativeRoot = path.join(repositoryRoot, "dist", "native");
const targets = new Map([
  ["arm64", "bun-darwin-arm64"],
  ["x64", "bun-darwin-x64"],
]);

function requestedArchitectures(args) {
  const requested = args.filter((arg) => arg !== "--all");
  if (requested.length === 0 || args.includes("--all")) return [...targets.keys()];
  for (const architecture of requested) {
    if (!targets.has(architecture)) {
      throw new Error(`Unknown architecture ${architecture}. Use arm64, x64, or --all.`);
    }
  }
  return requested;
}

async function copyPayload(payloadRoot) {
  await Promise.all([
    cp(path.join(repositoryRoot, "framework"), path.join(payloadRoot, "framework"), {
      recursive: true,
    }),
    cp(
      path.join(repositoryRoot, "installer", "templates"),
      path.join(payloadRoot, "installer", "templates"),
      { recursive: true },
    ),
    cp(
      path.join(repositoryRoot, "docs", "brand", "ag-mark.txt"),
      path.join(payloadRoot, "docs", "brand", "ag-mark.txt"),
    ),
  ]);
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function buildArchitecture(architecture) {
  const target = targets.get(architecture);
  const outputRoot = path.join(nativeRoot, `macos-${architecture}`);
  const payloadRoot = path.join(outputRoot, "payload");
  const executable = path.join(payloadRoot, "bin", "silver");

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.dirname(executable), { recursive: true });
  await copyPayload(payloadRoot);
  await run(
    "bun",
    [
      "build",
      "--compile",
      "--bytecode",
      `--target=${target}`,
      "--outfile",
      executable,
      "bin/silver-native.mjs",
    ],
    { cwd: repositoryRoot, maxBuffer: 64 * 1024 * 1024 },
  );

  const metadata = await stat(executable);
  const digest = await sha256(executable);
  await writeFile(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify({
      product: "silver",
      version: FRAMEWORK_VERSION,
      platform: "macos",
      architecture,
      executable: "payload/bin/silver",
      sha256: digest,
      bytes: metadata.size,
    }, null, 2)}\n`,
    "utf8",
  );
  return { architecture, executable, digest, bytes: metadata.size };
}

const packageManifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
);
if (packageManifest.version !== FRAMEWORK_VERSION) {
  throw new Error(
    `package.json is ${packageManifest.version} but installer/version.mjs is ${FRAMEWORK_VERSION}.`,
  );
}

const results = [];
for (const architecture of requestedArchitectures(process.argv.slice(2))) {
  results.push(await buildArchitecture(architecture));
}

for (const result of results) {
  console.log(
    `${result.architecture}: dist/native/macos-${result.architecture}/payload/bin/silver (${result.bytes} bytes, sha256:${result.digest})`,
  );
}
