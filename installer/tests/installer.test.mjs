import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { doctorWorkspace } from "../doctor.mjs";
import { snapshotFiles } from "../lib/files.mjs";
import { setupWorkspace } from "../setup.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const expectedRoot = path.join(
  repositoryRoot,
  "fixtures",
  "blank-workspace",
  "expected",
);
const skillSourceRoot = path.join(repositoryRoot, "framework", "skills");
const referenceSystemSourceRoot = path.join(repositoryRoot, "reference-system");
const installedSkillIds = [
  "brand",
  "theme",
  "flow",
  "prototype",
  "design-check",
];

async function temporaryWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "design-practice-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

function comparableSnapshot(snapshot) {
  return [...snapshot.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relativePath, content]) => [relativePath, content.toString("utf8")]);
}

async function expectedBlankWorkspaceSnapshot() {
  const expected = await snapshotFiles(expectedRoot);
  for (const id of installedSkillIds) {
    for (const [relativePath, content] of await snapshotFiles(
      path.join(skillSourceRoot, id),
    )) {
      expected.set(path.join(".skills", id, relativePath), content);
    }
  }
  for (const [relativePath, content] of await snapshotFiles(
    referenceSystemSourceRoot,
  )) {
    expected.set(path.join("reference-system", relativePath), content);
  }
  return expected;
}

test("setup produces the expected blank workspace", async (t) => {
  const root = await temporaryWorkspace(t);
  const result = await setupWorkspace({
    root,
    name: "Example Product",
    id: "example-product",
    date: "2026-07-23",
    version: "0.1.0-dev",
    sourceReference: "framework-development-fixture",
  });

  assert.equal(result.mode, "new");
  assert.deepEqual(
    comparableSnapshot(await snapshotFiles(root)),
    comparableSnapshot(await expectedBlankWorkspaceSnapshot()),
  );
  assert.equal((await doctorWorkspace({ root })).ok, true);
});

test("setup is idempotent and preserves project edits", async (t) => {
  const root = await temporaryWorkspace(t);
  await setupWorkspace({
    root,
    name: "Example Product",
    id: "example-product",
    date: "2026-07-23",
    sourceReference: "framework-development-fixture",
  });
  const brandPath = path.join(root, "design", "brand.md");
  const referencePath = path.join(
    root,
    "reference-system",
    "examples",
    "static-html",
    "login-form.css",
  );
  const edited = `${await readFile(brandPath, "utf8")}\nProject-owned note.\n`;
  const editedReference = `${await readFile(referencePath, "utf8")}\n/* Product-owned note. */\n`;
  await writeFile(brandPath, edited);
  await writeFile(referencePath, editedReference);
  const before = comparableSnapshot(await snapshotFiles(root));

  const result = await setupWorkspace({
    root,
    name: "Ignored on resume",
    id: "ignored-on-resume",
    date: "2026-07-24",
  });

  assert.equal(result.mode, "existing");
  assert.equal(result.created.length, 0);
  assert.deepEqual(comparableSnapshot(await snapshotFiles(root)), before);
  assert.equal(await readFile(brandPath, "utf8"), edited);
  assert.equal(await readFile(referencePath, "utf8"), editedReference);
});

test("doctor reports missing artifacts and stale managed files", async (t) => {
  const root = await temporaryWorkspace(t);
  await setupWorkspace({
    root,
    name: "Example Product",
    id: "example-product",
    date: "2026-07-23",
  });
  await unlink(path.join(root, "design", "voice.md"));
  await writeFile(path.join(root, "design", "INDEX.md"), "stale\n");

  const result = await doctorWorkspace({ root });
  assert.equal(result.ok, false);
  assert.ok(
    result.diagnostics.some(
      ({ code, path: target }) =>
        code === "missing-artifact" && target === "design/voice.md",
    ),
  );
  assert.ok(
    result.diagnostics.some(
      ({ code, path: target }) =>
        code === "managed-file-stale" && target === "design/INDEX.md",
    ),
  );
});

test("doctor verifies framework-managed skills but permits reference-system edits", async (t) => {
  const root = await temporaryWorkspace(t);
  await setupWorkspace({
    root,
    name: "Example Product",
    id: "example-product",
    date: "2026-07-23",
  });
  const referencePath = path.join(
    root,
    "reference-system",
    "examples",
    "static-html",
    "login-form.css",
  );
  await writeFile(
    referencePath,
    `${await readFile(referencePath, "utf8")}\n/* Expected project edit. */\n`,
  );
  assert.equal((await doctorWorkspace({ root })).ok, true);

  const skillPath = path.join(root, ".skills", "brand", "SKILL.md");
  await writeFile(
    skillPath,
    `${await readFile(skillPath, "utf8")}\nUnexpected managed edit.\n`,
  );
  const result = await doctorWorkspace({ root });
  assert.equal(result.ok, false);
  assert.ok(
    result.diagnostics.some(
      ({ code, path: target }) =>
        code === "managed-package-stale" && target === ".skills/brand",
    ),
  );
});

test("setup refuses to guess that an existing codebase is blank", async (t) => {
  const root = await temporaryWorkspace(t);
  await writeFile(path.join(root, "package.json"), "{}\n");

  await assert.rejects(
    setupWorkspace({ root }),
    /Existing-codebase adoption is not implemented yet/,
  );
  assert.equal((await snapshotFiles(root)).size, 1);
});
