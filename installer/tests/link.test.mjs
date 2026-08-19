import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { parse } from "yaml";

import { inspectAdoption } from "../adopt.mjs";
import { doctorWorkspace } from "../doctor.mjs";
import { setupWorkspace } from "../setup.mjs";
import { inspectLinkedSources, linkCodebase } from "../sources.mjs";
import { readUtf8 } from "../lib/files.mjs";

const run = promisify(execFile);

async function temporaryDirectory(t, prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function git(root, args) {
  return run("git", ["-C", root, ...args], { encoding: "utf8" });
}

async function gitCodebase(t) {
  const codeRoot = await temporaryDirectory(t, "silver-link-codebase-");
  await git(codeRoot, ["init"]);
  await writeFile(path.join(codeRoot, "README.md"), "# Product\n");
  await git(codeRoot, ["add", "README.md"]);
  await git(codeRoot, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.com",
    "commit",
    "-m",
    "Initial commit",
  ]);
  const revision = (await git(codeRoot, ["rev-parse", "HEAD"])).stdout.trim();
  return { codeRoot, revision };
}

test("silver link registers a codebase as a relative, pinned linked-source and records it on the design context", async (t) => {
  const workspace = await temporaryDirectory(t, "silver-link-workspace-");
  await setupWorkspace({
    root: workspace,
    name: "Link Fixture",
    id: "link-fixture",
    date: "2026-08-11",
  });
  const { codeRoot, revision } = await gitCodebase(t);

  const result = await linkCodebase({
    root: workspace,
    targetPath: codeRoot,
    as: "primary-product",
    now: "2026-08-11T00:00:00.000Z",
  });

  assert.equal(result.source.id, "primary-product");
  assert.equal(result.source.kind, "codebase");
  assert.equal(result.source.source.type, "git");
  assert.equal(result.source.source.revision, revision);
  // Stored relative to the workspace, not as the absolute path it was given.
  assert.ok(!path.isAbsolute(result.source.source.reference));
  assert.equal(
    path.resolve(workspace, result.source.source.reference),
    codeRoot,
  );
  assert.equal(result.source.source.reference_hint, codeRoot);

  const registry = parse(
    await readUtf8(path.join(workspace, "design", "sources", "sources.yaml")),
  );
  assert.equal(registry.sources.length, 1);
  assert.equal(registry.sources[0].id, "primary-product");

  assert.ok(result.design_context);
  const context = parse(
    await readUtf8(path.join(workspace, result.design_context.path)),
  );
  assert.equal(context.codebase.linked_source, "primary-product");

  const doctorResult = await doctorWorkspace({ root: workspace });
  assert.ok(
    !doctorResult.diagnostics.some((item) => item.code?.startsWith("linked-source-")),
  );
});

test("adopt inspect --source resolves a linked-source id, not just a literal path", async (t) => {
  const workspace = await temporaryDirectory(t, "silver-link-workspace-");
  await setupWorkspace({
    root: workspace,
    name: "Link Fixture",
    id: "link-fixture",
    date: "2026-08-11",
  });
  const { codeRoot } = await gitCodebase(t);
  await linkCodebase({ root: workspace, targetPath: codeRoot, as: "primary-product" });

  const plan = await inspectAdoption({ root: workspace, source: "primary-product" });
  assert.equal(plan.source.reference, codeRoot);
  assert.ok(plan.discovered.entries.some((entry) => entry.path === "README.md"));
});

test("silver link refuses a duplicate --as id", async (t) => {
  const workspace = await temporaryDirectory(t, "silver-link-workspace-");
  await setupWorkspace({
    root: workspace,
    name: "Link Fixture",
    id: "link-fixture",
    date: "2026-08-11",
  });
  const { codeRoot } = await gitCodebase(t);
  await linkCodebase({ root: workspace, targetPath: codeRoot, as: "product" });

  await assert.rejects(
    () => linkCodebase({ root: workspace, targetPath: codeRoot, as: "product" }),
    /already linked/,
  );
});

test("doctor reports a specific unresolved codebase link after a clone loses the sibling repository", async (t) => {
  const workspace = await temporaryDirectory(t, "silver-link-workspace-");
  await setupWorkspace({
    root: workspace,
    name: "Link Fixture",
    id: "link-fixture",
    date: "2026-08-11",
  });
  const { codeRoot } = await gitCodebase(t);
  await linkCodebase({ root: workspace, targetPath: codeRoot, as: "product" });
  await rm(codeRoot, { recursive: true, force: true });

  const inspected = await inspectLinkedSources(workspace);
  const product = inspected.find((item) => item.id === "product");
  assert.equal(product.state, "unavailable");
  assert.ok(product.reference_hint);

  const doctorResult = await doctorWorkspace({ root: workspace });
  assert.ok(
    doctorResult.diagnostics.some(
      (item) =>
        item.code === "linked-source-unavailable" &&
        item.message.includes("codebase"),
    ),
  );
});

test("doctor reports a moved codebase link as external-changed, distinct from unavailable", async (t) => {
  const workspace = await temporaryDirectory(t, "silver-link-workspace-");
  await setupWorkspace({
    root: workspace,
    name: "Link Fixture",
    id: "link-fixture",
    date: "2026-08-11",
  });
  const { codeRoot } = await gitCodebase(t);
  await linkCodebase({ root: workspace, targetPath: codeRoot, as: "product" });

  await writeFile(path.join(codeRoot, "CHANGED.md"), "New work.\n");
  await git(codeRoot, ["add", "CHANGED.md"]);
  await git(codeRoot, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.com",
    "commit",
    "-m",
    "Advance the codebase",
  ]);

  const inspected = await inspectLinkedSources(workspace);
  const product = inspected.find((item) => item.id === "product");
  assert.equal(product.state, "external-changed");
  assert.ok(product.repin_proposal);

  const doctorResult = await doctorWorkspace({ root: workspace });
  assert.ok(
    doctorResult.diagnostics.some(
      (item) => item.code === "linked-source-external-changed",
    ),
  );
});

test("a same-repo linked source stays current after an unrelated workspace commit, but still detects a real change", async (t) => {
  const workspace = await temporaryDirectory(t, "silver-link-same-repo-");
  await setupWorkspace({
    root: workspace,
    name: "Same Repo Fixture",
    id: "same-repo-fixture",
    date: "2026-08-19",
  });
  await git(workspace, ["init"]);
  const commit = (message) =>
    git(workspace, [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "-m",
      message,
    ]);
  await git(workspace, ["add", "-A"]);
  await commit("Initial workspace commit");

  // The linked source lives inside the workspace's own repository, e.g. a
  // vendored snapshot — this is the shape that exposed the bug: comparing
  // against `git rev-parse HEAD` conflates "the repo advanced" with "the
  // linked source changed" when both are the same repo.
  const snapshotDir = path.join(workspace, "vendor", "snapshot");
  await mkdir(snapshotDir, { recursive: true });
  await writeFile(path.join(snapshotDir, "data.json"), '{"value":1}\n');
  await git(workspace, ["add", "-A"]);
  await commit("Add snapshot content");

  await linkCodebase({ root: workspace, targetPath: snapshotDir, as: "same-repo-source" });

  await writeFile(path.join(workspace, "UNRELATED.md"), "Unrelated change.\n");
  await git(workspace, ["add", "-A"]);
  await commit("Unrelated workspace commit");

  const inspected = await inspectLinkedSources(workspace);
  assert.equal(inspected.find((item) => item.id === "same-repo-source").state, "current");

  const doctorResult = await doctorWorkspace({ root: workspace });
  assert.ok(
    !doctorResult.diagnostics.some((item) => item.code === "linked-source-external-changed"),
  );

  // A commit that actually touches the linked path must still be caught.
  await writeFile(path.join(snapshotDir, "data.json"), '{"value":2}\n');
  await git(workspace, ["add", "-A"]);
  await commit("Change snapshot content");

  const reinspected = await inspectLinkedSources(workspace);
  assert.equal(
    reinspected.find((item) => item.id === "same-repo-source").state,
    "external-changed",
  );
});
