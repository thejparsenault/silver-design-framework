import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { parse, stringify } from "yaml";

const run = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const expectedVersion = "0.4.0";

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
    "docs/brand/ag-mark.txt",
    "installer/brand.mjs",
    "installer/repair.mjs",
    "installer/migrate.mjs",
    "installer/update.mjs",
    "installer/what-now.mjs",
    "framework/skills/design-check/scripts/run-fast.mjs",
    "framework/skills/design-check/scripts/run-browser.mjs",
    "framework/skills/prototype/scripts/render-static-prototype.mjs",
    "framework/runtime/invoke-skill.mjs",
    "framework/schemas/v2/skill-result.schema.json",
    "framework/playbooks/default-design-loop.yaml",
    "framework/scenarios/complete-blank.mjs",
    "framework/scenarios/portable-reconciliation.mjs",
    "framework/providers/figma/adapter.mjs",
    "framework/providers/silver-portable/provider.yaml",
    "framework/schemas/v2/representation-binding.schema.json",
    "framework/runtime/reconciliation.mjs",
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
  const { stdout: setupOutput } = await command(
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
  assert.match(setupOutput, /^\*%{44}\*/);
  assert.match(setupOutput, /What Now recommends:/);
  assert.match(setupOutput, /No recommendation was started automatically\./);
  const setupResultFiles = await readdir(
    path.join(workspaceRoot, ".silver", "results", "skills"),
  );
  assert.equal(setupResultFiles.length, 1);
  const setupResult = JSON.parse(
    await readFile(
      path.join(
        workspaceRoot,
        ".silver",
        "results",
        "skills",
        setupResultFiles[0],
      ),
      "utf8",
    ),
  );
  assert.equal(setupResult.skill.id, "what-now");
  assert.equal(setupResult.execution.status, "complete");
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
  const browserCheck = path.join(
    workspaceRoot,
    ".skills",
    "design-check",
    "scripts",
    "run-browser.mjs",
  );
  const { stdout: browserOutput } = await command(
    process.execPath,
    [browserCheck, "--root", workspaceRoot],
    { cwd: workspaceRoot },
  );
  assert.equal(JSON.parse(browserOutput).status, "pass");
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
  assert.equal(lock.packages.length, 26);
  assert.equal(
    lock.packages.filter(({ type }) => type === "skill").length,
    19,
  );
  assert.ok(
    lock.packages.every(({ version }) => version === expectedVersion),
    "Every installed package must be pinned to the prerelease version.",
  );
  const v2MigrationRoot = path.join(consumerRoot, "silver-03-migration");
  await command(
    process.execPath,
    [cli, "setup", v2MigrationRoot, "--name", "Silver 0.3 Migration", "--id", "silver-03-migration"],
    { cwd: consumerRoot },
  );
  const v2LockPath = path.join(v2MigrationRoot, ".silver", "lock.yaml");
  const v2Lock = parse(await readFile(v2LockPath, "utf8"));
  v2Lock.framework.version = "0.3.0";
  v2Lock.framework.source.reference = "packed-0.3-fixture";
  v2Lock.packages = v2Lock.packages
    .filter(({ id }) => id !== "what-now")
    .map((record) =>
      record.ownership === "framework-managed"
        ? { ...record, version: "0.3.0" }
        : record,
    );
  await writeFile(v2LockPath, stringify(v2Lock), "utf8");
  await rm(path.join(v2MigrationRoot, ".skills", "what-now"), {
    recursive: true,
    force: true,
  });
  const v2BrandPath = path.join(v2MigrationRoot, "design", "brand.md");
  const v2OwnedBrand = `${await readFile(v2BrandPath, "utf8")}\nPacked project-owned 0.3 note.\n`;
  await writeFile(v2BrandPath, v2OwnedBrand, "utf8");
  const v2Preview = JSON.parse(
    (await command(process.execPath, [cli, "migrate", v2MigrationRoot, "--json"], { cwd: consumerRoot })).stdout,
  );
  assert.equal(v2Preview.needed, true);
  assert.equal(v2Preview.applied, false);
  assert.ok(v2Preview.changes.some(({ package: id }) => id === "what-now"));
  const v2Applied = JSON.parse(
    (await command(process.execPath, [cli, "migrate", v2MigrationRoot, "--apply", "--json"], { cwd: consumerRoot })).stdout,
  );
  assert.equal(v2Applied.applied, true);
  assert.equal(await readFile(v2BrandPath, "utf8"), v2OwnedBrand);
  await access(path.join(v2MigrationRoot, ".skills", "what-now", "SKILL.md"));
  const v2Repeated = JSON.parse(
    (await command(process.execPath, [cli, "migrate", v2MigrationRoot, "--apply", "--json"], { cwd: consumerRoot })).stdout,
  );
  assert.equal(v2Repeated.needed, false);
  await command(process.execPath, [cli, "doctor", v2MigrationRoot], { cwd: consumerRoot });
  const legacyBrand = lock.packages.find(({ id }) => id === "brand");
  const legacyReference = lock.packages.find(({ id }) => id === "reference-system");
  await writeFile(
    path.join(workspaceRoot, ".silver", "lock.yaml"),
    stringify({
      schema: "silver/lock/v1",
      framework: {
        version: "0.1.0-alpha.1",
        source: { type: "local", reference: "packed-legacy-fixture" },
      },
      packages: [
        {
          id: "brand",
          type: "skill",
          version: "0.1.0-alpha.1",
          ownership: "framework-managed",
          integrity: legacyBrand.integrity,
        },
        {
          id: "reference-system",
          type: "reference-system",
          version: "0.1.0-alpha.1",
          ownership: "copied-and-owned",
          integrity: legacyReference.integrity,
        },
      ],
      managed_files: lock.managed_files,
    }),
    "utf8",
  );
  await rm(path.join(workspaceRoot, ".skills", "product"), {
    recursive: true,
    force: true,
  });
  await rm(path.join(workspaceRoot, ".silver", "playbooks"), {
    recursive: true,
    force: true,
  });
  const migrationPreview = JSON.parse(
    (
      await command(
        process.execPath,
        [cli, "migrate", workspaceRoot, "--json"],
        { cwd: consumerRoot },
      )
    ).stdout,
  );
  assert.equal(migrationPreview.needed, true);
  assert.equal(migrationPreview.applied, false);
  await access(path.join(workspaceRoot, ".skills", "brand"));
  await assert.rejects(access(path.join(workspaceRoot, ".skills", "product")));
  const migrationApplied = JSON.parse(
    (
      await command(
        process.execPath,
        [cli, "migrate", workspaceRoot, "--apply", "--json"],
        { cwd: consumerRoot },
      )
    ).stdout,
  );
  assert.equal(migrationApplied.applied, true);
  const migratedLock = parse(
    await readFile(path.join(workspaceRoot, ".silver", "lock.yaml"), "utf8"),
  );
  assert.equal(migratedLock.schema, "silver/lock/v2");
  assert.equal(migratedLock.packages.length, 26);
  await access(path.join(workspaceRoot, ".skills", "product", "SKILL.md"));
  await command(process.execPath, [cli, "doctor", workspaceRoot], {
    cwd: consumerRoot,
  });
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
  const completeRoot = path.join(consumerRoot, "complete-suite");
  await command(
    process.execPath,
    [
      cli,
      "setup",
      completeRoot,
      "--name",
      "Complete Suite",
      "--id",
      "complete-suite",
    ],
    { cwd: consumerRoot },
  );
  const completeScenario = path.join(
    packageRoot,
    "framework",
    "scenarios",
    "complete-blank.mjs",
  );
  const completeResult = JSON.parse(
    (
      await command(
        process.execPath,
        [completeScenario, "--root", completeRoot],
        { cwd: completeRoot },
      )
    ).stdout,
  );
  assert.equal(completeResult.status, "pass");
  assert.equal(completeResult.skills.length, 19);
  assert.deepEqual(
    Object.keys(completeResult.portable_baselines).sort(),
    [...completeResult.skills].sort(),
  );
  assert.ok(
    Object.values(completeResult.portable_baselines).every(
      (provider) => provider === "silver-portable",
    ),
  );
  assert.equal(completeResult.fast, "pass");
  assert.equal(completeResult.browser, "pass");
  for (const [kind, relativePath] of Object.entries(completeResult.local_views)) {
    const content = await readFile(path.join(completeRoot, relativePath), "utf8");
    assert.ok(content.length > 0, `${kind} is empty`);
    if (relativePath.endsWith(".html")) {
      assert.match(content, /data-source-revision=/, `${kind} lacks source provenance`);
      assert.match(content, /data-renderer-version=/, `${kind} lacks renderer provenance`);
      assert.match(content, /data-design-system-revision=/, `${kind} lacks design-system provenance`);
    }
  }

  const reconciliationRoot = path.join(consumerRoot, "portable-reconciliation");
  await command(
    process.execPath,
    [cli, "setup", reconciliationRoot, "--name", "Portable Reconciliation", "--id", "portable-reconciliation"],
    { cwd: consumerRoot },
  );
  const reconciliationScenario = path.join(packageRoot, "framework", "scenarios", "portable-reconciliation.mjs");
  const reconciliationResult = JSON.parse(
    (await command(process.execPath, [reconciliationScenario, "--root", reconciliationRoot], { cwd: reconciliationRoot })).stdout,
  );
  assert.equal(reconciliationResult.status, "pass");
  assert.equal(reconciliationResult.provider_operation, "previewed");
  assert.equal(reconciliationResult.provider_operation_expected_revision, "v18");
  assert.deepEqual(reconciliationResult.bindings, ["guided-flow-html", "guided-figma"]);
  assert.equal(reconciliationResult.local_authority, "external-changed");
  assert.equal(reconciliationResult.applied, "applied");
  assert.deepEqual(reconciliationResult.behavioral_proposals, ["flow", "specification"]);
  assert.ok(reconciliationResult.unknown_findings > 0);
  assert.equal(reconciliationResult.divergence, "diverged");
  assert.equal(reconciliationResult.external_authority_unavailable, "unverified");
  await access(path.join(reconciliationRoot, reconciliationResult.prototype));
  await access(path.join(reconciliationRoot, ".silver/results/reconciliation/operations/guided-figma-token-preview.json"));
  await access(path.join(reconciliationRoot, ".silver/results/reconciliation/snapshots/guided-figma-current.json"));
  const representationCheckRunner = path.join(
    reconciliationRoot,
    ".skills/design-check/scripts/run-representation-check.mjs",
  );
  for (const checker of [
    "binding-integrity",
    "provider-revision-pins",
    "view-provenance",
    "synchronization-status",
    "semantic-mapping",
    "stale-proposals",
    "authority",
    "secret-free-configuration",
  ]) {
    const checkResult = JSON.parse(
      (
        await command(
          process.execPath,
          [representationCheckRunner, "--checker", checker, "--root", reconciliationRoot],
          { cwd: reconciliationRoot },
        )
      ).stdout,
    );
    assert.equal(
      checkResult.status,
      "pass",
      `${checker} did not pass against packed reconciliation records`,
    );
  }

  process.stdout.write(
    `Package smoke test passed: ${packed.filename} (${packed.size} bytes, ${packed.files.length} files)\n`,
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
