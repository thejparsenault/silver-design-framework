import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parse, stringify } from "yaml";

import { doctorWorkspace } from "../doctor.mjs";
import { exists, snapshotFiles } from "../lib/files.mjs";
import { migrateWorkspace } from "../migrate.mjs";
import { setupWorkspace } from "../setup.mjs";

async function legacyWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({
    root,
    name: "Legacy Product",
    id: "legacy-product",
    date: "2026-07-23",
    version: "0.4.0",
    sourceReference: "migration-fixture-source",
  });
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const currentLock = parse(await readFile(lockPath, "utf8"));
  const brand = currentLock.packages.find(({ id }) => id === "brand");
  const reference = currentLock.packages.find(({ id }) => id === "reference-system");
  const legacyLock = {
    schema: "silver/lock/v1",
    framework: {
      version: "0.1.0-alpha.1",
      source: { type: "local", reference: "legacy-fixture" },
    },
    packages: [
      {
        id: "brand",
        type: "skill",
        version: "0.1.0-alpha.1",
        ownership: "framework-managed",
        integrity: brand.integrity,
      },
      {
        id: "reference-system",
        type: "reference-system",
        version: "0.1.0-alpha.1",
        ownership: "copied-and-owned",
        integrity: reference.integrity,
      },
    ],
    managed_files: currentLock.managed_files,
  };
  await writeFile(lockPath, stringify(legacyLock), "utf8");

  for (const skill of await readdir(path.join(root, ".skills"))) {
    if (skill !== "brand") await rm(path.join(root, ".skills", skill), { recursive: true, force: true });
  }
  for (const relative of ["schemas", "guardrails", "runtime", "playbooks"]) {
    await rm(path.join(root, ".silver", relative), { recursive: true, force: true });
  }
  for (const relative of [
    "design/assets",
    "design/presentation-kit",
    "design/work",
    "presentations",
    "production",
  ]) {
    await rm(path.join(root, relative), { recursive: true, force: true });
  }
  const manifestPath = path.join(root, "design", "manifest.yaml");
  const manifest = parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts = manifest.artifacts.filter(
    ({ id }) => !["project-assets", "presentation-kit"].includes(id),
  );
  manifest.artifacts.push({
    id: "permissions",
    kind: "permission-policy",
    path: "design/permissions.yaml",
    scope: "codebase",
    role: "canonical",
    status: "active",
    authority: { type: "local" },
  });
  manifest.permission_policy = "design/permissions.yaml";
  await writeFile(
    path.join(root, "design", "permissions.yaml"),
    "schema: silver/permission-policy/v1\nid: legacy-policy\ndefault_decision: ask\nrules: []\n",
    "utf8",
  );
  manifest.checks.enabled = [
    "artifact-schema",
    "flow-structure",
    "semantic-style",
    "prototype-policy",
    "accessibility",
    "responsive",
  ];
  manifest.checks.suites = {
    fast: ["artifact-schema", "flow-structure", "semantic-style", "prototype-policy"],
    browser: ["accessibility", "responsive"],
    full: ["artifact-schema", "flow-structure", "semantic-style", "prototype-policy", "accessibility", "responsive"],
  };
  await writeFile(manifestPath, stringify(manifest), "utf8");
  return root;
}

function comparable(snapshot) {
  return [...snapshot.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, content]) => [name, content.toString("base64")]);
}

test("migration preview is read-only and apply upgrades the installed shape without changing owned work", async (t) => {
  const root = await legacyWorkspace(t);
  const brandPath = path.join(root, "design", "brand.md");
  const ownedBrand = `${await readFile(brandPath, "utf8")}\nProject-owned legacy note.\n`;
  await writeFile(brandPath, ownedBrand, "utf8");
  const before = comparable(await snapshotFiles(root));

  const preview = await migrateWorkspace({
    root,
    date: "2026-07-24",
    sourceReference: "migration-test",
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.applied, false);
  assert.ok(preview.changes.some(({ action }) => action === "upgrade-lock"));
  assert.deepEqual(comparable(await snapshotFiles(root)), before);

  const applied = await migrateWorkspace({
    root,
    apply: true,
    date: "2026-07-24",
    sourceReference: "migration-test",
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.applied, true);
  assert.equal(await readFile(brandPath, "utf8"), ownedBrand);
  const lock = parse(await readFile(path.join(root, ".silver", "lock.yaml"), "utf8"));
  assert.equal(lock.schema, "silver/lock/v2");
  assert.equal(lock.framework.version, "0.8.0");
  // 0.9 adds the silver-browser-local provider and the shipped transport catalog.
  assert.equal(lock.packages.length, 32);
  assert.equal(lock.packages.filter(({ type }) => type === "skill").length, 21);
  const manifest = parse(await readFile(path.join(root, "design", "manifest.yaml"), "utf8"));
  assert.ok(manifest.artifacts.some(({ id }) => id === "project-assets"));
  assert.ok(manifest.artifacts.some(({ id }) => id === "presentation-kit"));
  assert.ok(manifest.artifacts.some(({ id }) => id === "default-design-context"));
  assert.ok(manifest.artifacts.some(({ id }) => id === "component-catalog"));
  assert.ok(!manifest.artifacts.some(({ kind }) => kind === "permission-policy"));
  assert.equal(manifest.permission_policy, undefined);
  assert.equal(applied.inactiveArtifacts[0].path, "design/permissions.yaml");
  await readFile(path.join(root, "design", "permissions.yaml"), "utf8");
  const bootstrap = JSON.parse(
    await readFile(
      path.join(root, ".silver", "provenance", "legacy-artifacts.json"),
      "utf8",
    ),
  );
  assert.equal(bootstrap.schema, "silver/provenance-bootstrap/v1");
  assert.equal(
    bootstrap.artifacts.find(({ id }) => id === "brand").origin,
    "legacy",
  );
  assert.ok(manifest.checks.enabled.includes("critical-interactions"));
  assert.equal((await doctorWorkspace({ root })).ok, true);

  const repeat = await migrateWorkspace({ root, apply: true });
  assert.equal(repeat.needed, false);
  assert.equal(repeat.applied, false);
});

test("migration stops before all writes when a managed legacy skill was edited", async (t) => {
  const root = await legacyWorkspace(t);
  const skillPath = path.join(root, ".skills", "brand", "SKILL.md");
  await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\nLocal edit.\n`, "utf8");
  const before = comparable(await snapshotFiles(root));
  const result = await migrateWorkspace({ root, apply: true, date: "2026-07-24" });
  assert.equal(result.ok, false);
  assert.equal(result.applied, false);
  assert.ok(result.conflicts.some(({ package: id }) => id === "brand"));
  assert.deepEqual(comparable(await snapshotFiles(root)), before);
});

test("0.4-to-current migration preserves an edited legacy policy as inactive and bootstraps provenance", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-04-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({
    root,
    name: "Silver 0.4 workspace",
    id: "silver-04-workspace",
    date: "2026-07-30",
  });
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.4.0";
  await writeFile(lockPath, stringify(lock), "utf8");

  const manifestPath = path.join(root, "design", "manifest.yaml");
  const manifest = parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts.push({
    id: "permissions",
    kind: "permission-policy",
    path: "design/permissions.yaml",
    scope: "codebase",
    role: "canonical",
    status: "active",
    authority: { type: "local" },
  });
  manifest.permission_policy = "design/permissions.yaml";
  await writeFile(manifestPath, stringify(manifest), "utf8");
  const editedPolicy = "Project-owned legacy policy notes.\n";
  await writeFile(path.join(root, "design", "permissions.yaml"), editedPolicy);
  await writeFile(
    path.join(root, "design", "work", "legacy-note.md"),
    "Legacy working artifact.\n",
  );

  const preview = await migrateWorkspace({ root });
  assert.equal(preview.fromVersion, "0.4.0");
  assert.equal(preview.toVersion, "0.8.0");
  assert.ok(
    preview.changes.some(({ action }) => action === "bootstrap-provenance"),
  );
  assert.equal(preview.inactiveArtifacts[0].path, "design/permissions.yaml");

  const applied = await migrateWorkspace({
    root,
    apply: true,
    date: "2026-07-30",
  });
  assert.equal(applied.applied, true);
  assert.equal(
    await readFile(path.join(root, "design", "permissions.yaml"), "utf8"),
    editedPolicy,
  );
  const bootstrap = JSON.parse(
    await readFile(
      path.join(root, ".silver", "provenance", "legacy-artifacts.json"),
      "utf8",
    ),
  );
  assert.ok(
    bootstrap.artifacts.some(
      ({ path: artifactPath }) =>
        artifactPath === "design/work/legacy-note.md",
    ),
  );
});

test("0.3 workspace previews and applies the current installation idempotently", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-03-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({
    root,
    name: "Silver 0.3 workspace",
    id: "silver-03-workspace",
    date: "2026-07-25",
  });
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.3.0";
  lock.framework.source.reference = "silver-0.3-fixture";
  lock.packages = lock.packages
    .filter(({ id }) => id !== "what-now")
    .map((record) =>
      record.ownership === "framework-managed"
        ? { ...record, version: "0.3.0" }
        : record,
    );
  await writeFile(lockPath, stringify(lock), "utf8");
  await rm(path.join(root, ".skills", "what-now"), {
    recursive: true,
    force: true,
  });
  const brandPath = path.join(root, "design", "brand.md");
  const ownedBrand = `${await readFile(brandPath, "utf8")}\nProject-owned 0.3 content.\n`;
  await writeFile(brandPath, ownedBrand, "utf8");

  const before = comparable(await snapshotFiles(root));
  const preview = await migrateWorkspace({ root });
  assert.equal(preview.ok, true);
  assert.equal(preview.needed, true);
  assert.equal(preview.applied, false);
  assert.ok(
    preview.changes.some(
      ({ package: id, action }) =>
        id === "what-now" && action === "install",
    ),
  );
  assert.deepEqual(comparable(await snapshotFiles(root)), before);

  const applied = await migrateWorkspace({ root, apply: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.applied, true);
  assert.equal(await readFile(brandPath, "utf8"), ownedBrand);
  await readFile(path.join(root, ".skills", "what-now", "SKILL.md"), "utf8");
  assert.equal((await doctorWorkspace({ root })).ok, true);

  const repeated = await migrateWorkspace({ root, apply: true });
  assert.equal(repeated.needed, false);
  assert.equal(repeated.applied, false);
});

test("0.2 v2 workspace previews, applies, and reruns the current migration idempotently", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-v2-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({
    root,
    name: "Silver 0.2 workspace",
    id: "silver-02-workspace",
    date: "2026-07-24",
  });
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.2.0";
  lock.framework.source.reference = "silver-0.2-fixture";
  lock.packages = lock.packages
    .filter(({ type }) => type !== "provider")
    .map((record) =>
      record.ownership === "framework-managed"
        ? { ...record, version: "0.2.0" }
        : record,
    );
  await writeFile(lockPath, stringify(lock), "utf8");
  await rm(path.join(root, ".silver", "providers"), { recursive: true, force: true });
  const brandPath = path.join(root, "design", "brand.md");
  const ownedBrand = `${await readFile(brandPath, "utf8")}\nProject-owned 0.2 content.\n`;
  await writeFile(brandPath, ownedBrand, "utf8");

  const before = comparable(await snapshotFiles(root));
  const preview = await migrateWorkspace({ root });
  assert.equal(preview.ok, true);
  assert.equal(preview.needed, true);
  assert.equal(preview.applied, false);
  assert.ok(preview.changes.some(({ package: id, action }) => id === "silver-portable" && action === "install"));
  // 0.8 installs Figma as separate transports rather than one provider.
  assert.ok(preview.changes.some(({ package: id, action }) => id === "figma-console-mcp" && action === "install"));
  assert.ok(preview.changes.some(({ package: id, action }) => id === "figma-official-mcp" && action === "install"));
  assert.deepEqual(comparable(await snapshotFiles(root)), before);

  const applied = await migrateWorkspace({ root, apply: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.applied, true);
  assert.equal(await readFile(brandPath, "utf8"), ownedBrand);
  const migrated = parse(await readFile(lockPath, "utf8"));
  assert.equal(migrated.framework.version, "0.8.0");
  assert.deepEqual(
    migrated.packages.filter(({ type }) => type === "provider").map(({ id }) => id).sort(),
    ["figma-console-mcp", "figma-official-mcp", "silver-browser-local", "silver-portable"],
  );
  assert.equal((await doctorWorkspace({ root })).ok, true);

  const repeated = await migrateWorkspace({ root, apply: true });
  assert.equal(repeated.needed, false);
  assert.equal(repeated.applied, false);
});

test("0.2-to-current migration surfaces edited managed packages without writing", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-v2-conflict-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Edited 0.2", id: "edited-02", date: "2026-07-24" });
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.2.0";
  lock.packages = lock.packages.filter(({ type }) => type !== "provider");
  await writeFile(lockPath, stringify(lock), "utf8");
  await rm(path.join(root, ".silver", "providers"), { recursive: true, force: true });
  const managedPath = path.join(root, ".skills", "brand", "SKILL.md");
  await writeFile(managedPath, `${await readFile(managedPath, "utf8")}\nEdited by project.\n`, "utf8");
  const before = comparable(await snapshotFiles(root));
  const result = await migrateWorkspace({ root, apply: true });
  assert.equal(result.ok, false);
  assert.equal(result.applied, false);
  assert.ok(result.conflicts.some(({ package: id }) => id === "brand"));
  assert.deepEqual(comparable(await snapshotFiles(root)), before);
});

test("a pre-adapter workspace gains the agent-host adapters without touching owned work", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-06-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({
    root,
    name: "Legacy Product",
    id: "legacy-product",
    date: "2026-07-23",
    sourceReference: "migration-fixture-source",
  });

  // Rewind the workspace to the 0.5 shape: no adapters, older lock version.
  await rm(path.join(root, "CLAUDE.md"), { force: true });
  await rm(path.join(root, ".claude"), { force: true, recursive: true });
  await rm(path.join(root, ".silver", "bin"), { force: true, recursive: true });
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.5.0";
  lock.managed_files = lock.managed_files.filter(
    ({ path: managedPath }) => managedPath !== "CLAUDE.md",
  );
  await writeFile(lockPath, stringify(lock), "utf8");
  const ownedNote = "Project-owned brand note.\n";
  const brandPath = path.join(root, "design", "brand.md");
  await writeFile(brandPath, `${await readFile(brandPath, "utf8")}${ownedNote}`);

  const preview = await migrateWorkspace({ root });
  assert.equal(preview.fromVersion, "0.5.0");
  assert.equal(preview.toVersion, "0.8.0");
  assert.equal(preview.applied, false);
  for (const expected of ["CLAUDE.md", ".claude/skills", ".silver/bin/silver"]) {
    assert.ok(
      preview.changes.some(({ path: changed }) => changed === expected),
      `preview should plan ${expected}`,
    );
  }
  assert.equal(await exists(path.join(root, "CLAUDE.md")), false);

  const applied = await migrateWorkspace({ root, apply: true });
  assert.equal(applied.applied, true);
  assert.match(
    await readFile(path.join(root, "CLAUDE.md"), "utf8"),
    /^@AGENTS\.md$/m,
  );
  assert.equal((await readdir(path.join(root, ".claude", "skills"))).length, 21);
  assert.ok(await exists(path.join(root, ".silver", "bin", "silver")));
  assert.ok(
    (await readFile(brandPath, "utf8")).endsWith(ownedNote),
    "project-owned edits survive the migration",
  );

  assert.equal((await migrateWorkspace({ root })).needed, false);
});

test("a 0.6.0 workspace migrates to the current release idempotently", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-061-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Published Product", id: "published-product" });

  // 0.6.0 shipped only as a GitHub release, so its launcher pinned the release
  // tarball URL rather than the npm package spec.
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.6.0";
  for (const installed of lock.packages) {
    if (installed.version === "0.8.0") installed.version = "0.6.0";
  }
  await writeFile(lockPath, stringify(lock), "utf8");
  const launcherPath = path.join(root, ".silver", "bin", "silver");
  await writeFile(
    launcherPath,
    '#!/bin/sh\nexec npx --yes https://github.com/thejparsenault/silver-design-framework/releases/download/v0.6.0/silver-design-framework-0.6.0.tgz "$@"\n',
  );
  const ownedNote = "Project-owned voice note.\n";
  const voicePath = path.join(root, "design", "voice.md");
  await writeFile(voicePath, `${await readFile(voicePath, "utf8")}${ownedNote}`);

  const preview = await migrateWorkspace({ root });
  assert.equal(preview.fromVersion, "0.6.0");
  assert.equal(preview.toVersion, "0.8.0");
  assert.equal(preview.applied, false);

  const applied = await migrateWorkspace({ root, apply: true });
  assert.equal(applied.applied, true);
  // The launcher is regenerated for however this CLI was delivered, so the
  // pin on the superseded 0.6.0 release artifact is gone either way.
  const launcher = await readFile(launcherPath, "utf8");
  assert.doesNotMatch(launcher, /releases\/download\/v0\.6\.0/);
  assert.match(launcher, /^exec (node "|npx --yes silver-design-framework@0\.8\.0)/m);
  assert.ok((await readFile(voicePath, "utf8")).endsWith(ownedNote));
  assert.equal((await migrateWorkspace({ root })).needed, false);
});
