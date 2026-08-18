import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  UnsafeWorkspacePathError,
  createWorkspaceMutator,
  inspectWorkspacePath,
  workspaceContentIntegrity,
} from "../runtime/workspace-mutations.mjs";

async function fixture() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "silver-mutation-"));
  const workspace = path.join(temporary, "workspace");
  const outside = path.join(temporary, "outside");
  await mkdir(workspace);
  await mkdir(outside);
  return { temporary, workspace, outside };
}

test("canonicalizes a symlinked workspace root but rejects linked ancestors beneath it", async () => {
  const { temporary, workspace, outside } = await fixture();
  const alias = path.join(temporary, "workspace-alias");
  await symlink(workspace, alias, "dir");
  await writeFile(path.join(outside, "sentinel.txt"), "unchanged\n");
  await symlink(outside, path.join(workspace, ".silver"), "dir");

  const mutator = await createWorkspaceMutator(alias);
  assert.equal(mutator.root, await import("node:fs/promises").then(({ realpath }) => realpath(workspace)));
  await assert.rejects(
    mutator.write(".silver/lock.yaml", "escaped\n"),
    (error) => error instanceof UnsafeWorkspacePathError,
  );
  assert.equal(await readFile(path.join(outside, "sentinel.txt"), "utf8"), "unchanged\n");
  await assert.rejects(readFile(path.join(outside, "lock.yaml"), "utf8"), { code: "ENOENT" });
});

test("rejects dangling links, linked file leaves, sibling prefixes, and absolute paths", async () => {
  const { workspace, outside } = await fixture();
  await mkdir(path.join(workspace, "design"));
  await symlink(path.join(outside, "missing"), path.join(workspace, "design", "dangling"));
  await symlink(path.join(outside, "leaf.txt"), path.join(workspace, "design", "leaf.txt"));
  const mutator = await createWorkspaceMutator(workspace);
  await assert.rejects(mutator.write("design/dangling/value.txt", "no"), UnsafeWorkspacePathError);
  await assert.rejects(mutator.write("design/leaf.txt", "no"), UnsafeWorkspacePathError);
  await assert.rejects(mutator.write("../workspace-other/value.txt", "no"), /escapes workspace/);
  await assert.rejects(mutator.write(path.join(outside, "value.txt"), "no"), /must be relative/);
});

test("rechecks ancestors immediately before activation", async () => {
  const { workspace, outside } = await fixture();
  await mkdir(path.join(workspace, "design"));
  const mutator = await createWorkspaceMutator(workspace, {
    beforeCommit: async () => {
      await rename(path.join(workspace, "design"), path.join(workspace, "design-original"));
      await symlink(outside, path.join(workspace, "design"), "dir");
    },
  });
  await assert.rejects(mutator.write("design/value.txt", "no"), UnsafeWorkspacePathError);
  await assert.rejects(readFile(path.join(outside, "value.txt"), "utf8"), { code: "ENOENT" });
});

test("create and expected-integrity replacement reject unintended overwrites", async () => {
  const { workspace } = await fixture();
  const mutator = await createWorkspaceMutator(workspace);
  await mutator.create("design/value.txt", "one\n");
  await assert.rejects(mutator.create("design/value.txt", "two\n"), { code: "EEXIST" });
  await assert.rejects(
    mutator.replace("design/value.txt", "two\n", workspaceContentIntegrity("stale\n")),
    /changed since inspection/,
  );
  await mutator.replace(
    "design/value.txt",
    "two\n",
    workspaceContentIntegrity("one\n"),
  );
  assert.equal(await readFile(path.join(workspace, "design/value.txt"), "utf8"), "two\n");
});

test("managed links are constrained to Claude skill adapter leaves resolving into .skills", async () => {
  const { workspace } = await fixture();
  const mutator = await createWorkspaceMutator(workspace);
  await mutator.ensureDirectory(".skills/theme");
  const link = await mutator.managedSkillLink(
    ".claude/skills/silver-theme",
    "../../.skills/theme",
  );
  assert.equal(link.path, ".claude/skills/silver-theme");
  assert.equal((await inspectWorkspacePath(workspace, link.path, { allowLeafLink: true })).safe, true);
  await assert.rejects(
    mutator.managedSkillLink("design/theme", "../.skills/theme"),
    /limited to/,
  );
  await assert.rejects(
    mutator.managedSkillLink(".claude/skills/silver-bad", "../../../outside"),
    /resolve into/,
  );
});
