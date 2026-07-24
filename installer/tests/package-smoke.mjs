import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { parse } from "yaml";

const run = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const expectedVersion = "0.2.0";

async function command(executable, args, options = {}) {
  return run(executable, args, {
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), "silver-package-"),
);

try {
  const packRoot = path.join(temporaryRoot, "pack");
  const npmCache = path.join(temporaryRoot, "npm-cache");
  const consumerRoot = path.join(temporaryRoot, "consumer");
  const workspaceRoot = path.join(consumerRoot, "campaign-studio");
  await mkdir(packRoot, { recursive: true });
  const { stdout: packOutput } = await command(
    "npm",
    [
      "pack",
      repositoryRoot,
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      packRoot,
      "--cache",
      npmCache,
    ],
    { cwd: repositoryRoot },
  );
  const packed = JSON.parse(packOutput)[0];
  assert.equal(packed.version, expectedVersion);
  const packedPaths = new Set(packed.files.map(({ path: file }) => file));
  for (const required of [
    "bin/silver.mjs",
    "installer/repair.mjs",
    "installer/update.mjs",
    "framework/skills/design-check/scripts/run-fast.mjs",
    "framework/skills/prototype/scripts/render-static-prototype.mjs",
    "framework/runtime/invoke-skill.mjs",
    "framework/schemas/v2/skill-result.schema.json",
    "framework/playbooks/default-design-loop.yaml",
    "reference-system/packages/css/src/tokens.css",
  ]) {
    assert.ok(packedPaths.has(required), `Package is missing ${required}`);
  }

  const tarball = path.join(packRoot, packed.filename);
  await command(
    "npm",
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      npmCache,
      "--prefix",
      consumerRoot,
      tarball,
    ],
    { cwd: temporaryRoot },
  );
  const packageRoot = path.join(
    consumerRoot,
    "node_modules",
    "silver-design-framework",
  );
  const cli = path.join(packageRoot, "bin", "silver.mjs");
  assert.equal(
    (await command(process.execPath, [cli, "version"], { cwd: consumerRoot }))
      .stdout.trim(),
    expectedVersion,
  );
  await command(
    process.execPath,
    [
      cli,
      "setup",
      workspaceRoot,
      "--name",
      "Campaign Studio",
      "--id",
      "campaign-studio",
    ],
    { cwd: consumerRoot },
  );
  await command(process.execPath, [cli, "doctor", workspaceRoot], {
    cwd: consumerRoot,
  });
  const fastCheck = path.join(
    workspaceRoot,
    ".skills",
    "design-check",
    "scripts",
    "run-fast.mjs",
  );
  const { stdout: checkOutput } = await command(
    process.execPath,
    [fastCheck, "--root", workspaceRoot],
    { cwd: workspaceRoot },
  );
  assert.equal(JSON.parse(checkOutput).status, "pass");
  const invocationPath = path.join(workspaceRoot, "check-invocation.json");
  await writeFile(
    invocationPath,
    `${JSON.stringify(
      {
        schema: "silver/skill-invocation/v2",
        invocation_id: "packed-design-check",
        skill: { id: "design-check", version: expectedVersion },
        started_at: "2026-07-24T22:00:00Z",
        inputs: [],
        outputs: [],
        permission_layers: [
          {
            schema: "silver/permission-policy/v2",
            id: "packed-framework",
            layer: "framework-default",
            rules: [
              {
                capability: "repository",
                actions: ["read", "inspect"],
                decision: "allow",
                paths: ["design/**", "reference-system/**"],
              },
            ],
          },
        ],
        available_providers: [],
        approvals: [],
        relaxations: [],
        checks: [],
        unresolved_questions: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const installedInvocation = path.join(
    workspaceRoot,
    ".skills",
    "design-check",
    "scripts",
    "invoke.mjs",
  );
  const { stdout: invocationOutput } = await command(
    process.execPath,
    [installedInvocation, invocationPath, "--root", workspaceRoot],
    { cwd: workspaceRoot },
  );
  const invocationResult = JSON.parse(invocationOutput);
  assert.equal(invocationResult.execution.status, "complete");
  assert.ok(
    invocationResult.recommended_next_actions.every(
      ({ automatic }) => automatic === false,
    ),
  );
  const lock = parse(
    await readFile(
      path.join(workspaceRoot, ".silver", "lock.yaml"),
      "utf8",
    ),
  );
  assert.equal(lock.framework.version, expectedVersion);
  assert.equal(lock.schema, "silver/lock/v2");
  assert.equal(lock.packages.length, 23);
  assert.equal(
    lock.packages.filter(({ type }) => type === "skill").length,
    18,
  );
  assert.ok(
    lock.packages.every(({ version }) => version === expectedVersion),
    "Every installed package must be pinned to the prerelease version.",
  );
  await access(
    path.join(
      workspaceRoot,
      "reference-system",
      "packages",
      "css",
      "src",
      "tokens.css",
    ),
  );

  process.stdout.write(
    `Package smoke test passed: ${packed.filename} (${packed.size} bytes, ${packed.files.length} files)\n`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
