import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { migrateWorkspace } from "../migrate.mjs";
import { setupWorkspace } from "../setup.mjs";

for (const managedPath of [".silver", ".skills", "design"]) {
  test(`setup rejects a linked ${managedPath} without modifying its target`, async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "silver-setup-symlink-"));
    const root = path.join(temporary, "workspace");
    const outside = path.join(temporary, "outside");
    await mkdir(root);
    await mkdir(outside);
    await writeFile(path.join(outside, "sentinel.txt"), "unchanged\n");
    await symlink(outside, path.join(root, managedPath), "dir");
    await assert.rejects(
      setupWorkspace({ root, name: "Unsafe", id: "unsafe" }),
      /Unsafe workspace path/,
    );
    assert.equal(await readFile(path.join(outside, "sentinel.txt"), "utf8"), "unchanged\n");
    const outsideEntries = await import("node:fs/promises").then(({ readdir }) => readdir(outside));
    assert.deepEqual(outsideEntries, ["sentinel.txt"]);
  });
}

test("migration previews a reviewed conversion when design/system is a symlink", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-system-link-"));
  const root = path.join(temporary, "workspace");
  const external = path.join(temporary, "external-system");
  await setupWorkspace({ root, name: "Linked", id: "linked", version: "0.8.0" });
  await mkdir(external);
  await writeFile(path.join(external, "sentinel.txt"), "unchanged\n");
  const system = path.join(root, "design/system");
  await import("node:fs/promises").then(({ rm }) => rm(system, { recursive: true }));
  await symlink(external, system, "dir");
  const preview = await migrateWorkspace({ root });
  assert.equal(preview.applied, false);
  assert.equal(preview.conversion_plan.target, external);
  assert.match(preview.conflicts[0].reason, /will not traverse/);
  const apply = await migrateWorkspace({ root, apply: true });
  assert.equal(apply.applied, false);
  assert.equal(await readFile(path.join(external, "sentinel.txt"), "utf8"), "unchanged\n");
});
