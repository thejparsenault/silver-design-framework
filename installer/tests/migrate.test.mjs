import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parse, stringify } from "yaml";

import { doctorWorkspace } from "../doctor.mjs";
import { snapshotFiles } from "../lib/files.mjs";
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
    version: "0.3.0",
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
  assert.equal(lock.framework.version, "0.3.0");
  assert.equal(lock.packages.length, 25);
  assert.equal(lock.packages.filter(({ type }) => type === "skill").length, 18);
  const manifest = parse(await readFile(path.join(root, "design", "manifest.yaml"), "utf8"));
  assert.ok(manifest.artifacts.some(({ id }) => id === "project-assets"));
  assert.ok(manifest.artifacts.some(({ id }) => id === "presentation-kit"));
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

test("0.2 v2 workspace previews, applies, and reruns the 0.3 provider migration idempotently", async (t) => {
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
  assert.ok(preview.changes.some(({ package: id, action }) => id === "figma" && action === "install"));
  assert.deepEqual(comparable(await snapshotFiles(root)), before);

  const applied = await migrateWorkspace({ root, apply: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.applied, true);
  assert.equal(await readFile(brandPath, "utf8"), ownedBrand);
  const migrated = parse(await readFile(lockPath, "utf8"));
  assert.equal(migrated.framework.version, "0.3.0");
  assert.deepEqual(
    migrated.packages.filter(({ type }) => type === "provider").map(({ id }) => id).sort(),
    ["figma", "silver-portable"],
  );
  assert.equal((await doctorWorkspace({ root })).ok, true);

  const repeated = await migrateWorkspace({ root, apply: true });
  assert.equal(repeated.needed, false);
  assert.equal(repeated.applied, false);
});

test("0.2-to-0.3 migration surfaces edited managed packages without writing", async (t) => {
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
