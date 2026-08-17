import assert from "node:assert/strict";
import { cp, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

import { setupWorkspace } from "../setup.mjs";
import { applySourceLinkPlan, inspectSourceLink } from "../sources.mjs";
import {
  applySynchronization,
  inspectSynchronization,
  syncStatus,
} from "../sync.mjs";
import { inspectRecovery, resumeRecovery, rollbackRecovery } from "../recover.mjs";
import { runGit } from "../../framework/runtime/git.mjs";

async function linkedFixture({ checks = [] } = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "silver-sync-repository-"));
  const workspace = path.join(temporary, "workspace");
  const external = path.join(temporary, "system");
  await mkdir(external);
  await writeFile(path.join(external, "tokens.json"), `${JSON.stringify({ color: { value: "#fff" } }, null, 2)}\n`);
  await setupWorkspace({ root: workspace, name: "Sync", id: "sync" });
  const plan = await inspectSourceLink({
    root: workspace,
    targetPath: external,
    kind: "design-system",
    as: "shared-system",
    answers: {
      paths: ["tokens.json"],
      mappings: [{ id: "tokens", external_path: "tokens.json", local_path: "design/system/imported.tokens.json", format: "dtcg-json", artifact_kind: "token-source" }],
      checks,
    },
  });
  await applySourceLinkPlan({ plan });
  return { workspace, external, bindingId: "shared-system-tokens" };
}

test("initial import is explicit, transactional, and advances the shared base", async () => {
  const { workspace, external, bindingId } = await linkedFixture();
  const status = await syncStatus({ root: workspace, bindingId });
  assert.equal(status.bindings[0].state, "uninitialized");
  const inspected = await inspectSynchronization({
    root: workspace,
    bindingId,
    direction: "external-to-local",
  });
  const externalSnapshot = JSON.parse(await readFile(
    path.join(workspace, inspected.proposal.adapter_payload.external_snapshot_path),
    "utf8",
  ));
  assert.equal(externalSnapshot.schema, "silver/external-snapshot/v2");
  assert.equal(externalSnapshot.counterpart, "shared-system:tokens.json");
  assert.equal(inspected.proposal.operations[0].type, "create");
  const result = await applySynchronization({
    root: workspace,
    input: inspected,
    only: [inspected.proposal.operations[0].id],
  });
  assert.equal(result.status, "applied");
  assert.deepEqual(
    JSON.parse(await readFile(path.join(workspace, "design/system/imported.tokens.json"), "utf8")),
    { color: { value: "#fff" } },
  );
  const binding = parse(await readFile(path.join(workspace, "design/integrations/shared-system-tokens.yaml"), "utf8"));
  assert.equal(binding.base.state, "initialized");
  assert.equal((await syncStatus({ root: workspace, bindingId })).bindings[0].state, "current");
  await assert.rejects(readFile(path.join(external, ".silver/lock.yaml"), "utf8"), { code: "ENOENT" });
});

test("an accepted import converts only the reviewed design/system symlink leaf", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "silver-sync-conversion-"));
  const workspace = path.join(temporary, "workspace");
  const external = path.join(temporary, "shared-system");
  await setupWorkspace({ root: workspace, name: "Conversion", id: "conversion" });
  await cp(path.join(workspace, "design/system"), external, { recursive: true });
  await writeFile(path.join(external, "sentinel.txt"), "external-unchanged\n");
  await rm(path.join(workspace, "design/system"), { recursive: true });
  await symlink(external, path.join(workspace, "design/system"), "dir");
  const plan = await inspectSourceLink({
    root: workspace,
    targetPath: external,
    kind: "design-system",
    as: "linked-primary",
    answers: {
      paths: ["tokens.json"],
      mappings: [{
        id: "tokens",
        external_path: "tokens.json",
        local_path: "design/system/tokens.json",
        format: "dtcg-json",
        artifact_kind: "token-source",
      }],
    },
  });
  await applySourceLinkPlan({ plan });
  const inspected = await inspectSynchronization({
    root: workspace,
    bindingId: "linked-primary-tokens",
    direction: "external-to-local",
  });
  const result = await applySynchronization({
    root: workspace,
    input: inspected,
    only: [inspected.proposal.operations[0].id],
  });
  assert.equal(result.status, "applied");
  assert.equal((await lstat(path.join(workspace, "design/system"))).isSymbolicLink(), false);
  assert.equal(await readFile(path.join(external, "sentinel.txt"), "utf8"), "external-unchanged\n");
});

test("dual edits become a conflict and cannot be selected", async () => {
  const { workspace, external, bindingId } = await linkedFixture();
  const initial = await inspectSynchronization({ root: workspace, bindingId, direction: "external-to-local" });
  await applySynchronization({ root: workspace, input: initial, only: [initial.proposal.operations[0].id] });
  await writeFile(path.join(workspace, "design/system/imported.tokens.json"), '{"color":{"value":"#000"}}\n');
  await writeFile(path.join(external, "tokens.json"), '{"color":{"value":"#f00"}}\n');
  const conflict = await inspectSynchronization({ root: workspace, bindingId, direction: "external-to-local" });
  assert.equal(conflict.result.state, "conflict");
  assert.equal(conflict.proposal.operations[0].type, "finding");
  await assert.rejects(
    applySynchronization({ root: workspace, input: conflict, only: [conflict.proposal.operations[0].id] }),
    /cannot be applied/,
  );
});

test("required non-Git export check failure restores the external preimage", async () => {
  const { workspace, external, bindingId } = await linkedFixture({
    checks: [{ id: "reject", argv: [process.execPath, "-e", "process.exit(3)"], cwd: ".", required: true, timeout_seconds: 5 }],
  });
  const initial = await inspectSynchronization({ root: workspace, bindingId, direction: "external-to-local" });
  await applySynchronization({ root: workspace, input: initial, only: [initial.proposal.operations[0].id] });
  await writeFile(path.join(workspace, "design/system/imported.tokens.json"), '{"color":{"value":"#000"}}\n');
  const exportPlan = await inspectSynchronization({ root: workspace, bindingId, direction: "local-to-external" });
  const before = await readFile(path.join(external, "tokens.json"), "utf8");
  await assert.rejects(
    applySynchronization({ root: workspace, input: exportPlan, only: [exportPlan.proposal.operations[0].id] }),
    /Required source check reject fail/,
  );
  assert.equal(await readFile(path.join(external, "tokens.json"), "utf8"), before);
});

test("a timed-out required source check is terminated and restores the external preimage", async () => {
  const { workspace, external, bindingId } = await linkedFixture({
    checks: [{
      id: "hang",
      argv: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
      cwd: ".",
      required: true,
      timeout_seconds: 1,
    }],
  });
  const initial = await inspectSynchronization({ root: workspace, bindingId, direction: "external-to-local" });
  await applySynchronization({ root: workspace, input: initial, only: [initial.proposal.operations[0].id] });
  await writeFile(path.join(workspace, "design/system/imported.tokens.json"), '{"color":{"value":"#222"}}\n');
  const proposal = await inspectSynchronization({ root: workspace, bindingId, direction: "local-to-external" });
  const before = await readFile(path.join(external, "tokens.json"), "utf8");
  const started = Date.now();
  await assert.rejects(
    applySynchronization({ root: workspace, input: proposal, only: [proposal.proposal.operations[0].id] }),
    /Required source check hang timeout/,
  );
  assert.ok(Date.now() - started < 5_000, "the timed-out child process must finish promptly");
  assert.equal(await readFile(path.join(external, "tokens.json"), "utf8"), before);
});

test("a workspace-finalization failure rolls back a non-Git export", async () => {
  const { workspace, external, bindingId } = await linkedFixture();
  const initial = await inspectSynchronization({ root: workspace, bindingId, direction: "external-to-local" });
  await applySynchronization({ root: workspace, input: initial, only: [initial.proposal.operations[0].id] });
  await writeFile(path.join(workspace, "design/system/imported.tokens.json"), '{"color":{"value":"#333"}}\n');
  const proposal = await inspectSynchronization({ root: workspace, bindingId, direction: "local-to-external" });
  const before = await readFile(path.join(external, "tokens.json"), "utf8");
  await assert.rejects(
    applySynchronization({
      root: workspace,
      input: proposal,
      only: [proposal.proposal.operations[0].id],
      hooks: { beforeWorkspaceTransaction: () => { throw new Error("injected metadata failure"); } },
    }),
    /injected metadata failure/,
  );
  assert.equal(await readFile(path.join(external, "tokens.json"), "utf8"), before);
});

test("Git export recovers forward after its external commit and never pushes", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "silver-sync-git-"));
  const workspace = path.join(temporary, "workspace");
  const external = path.join(temporary, "system");
  await mkdir(external);
  await runGit(external, ["init"]);
  await runGit(external, ["config", "user.name", "Silver Test"]);
  await runGit(external, ["config", "user.email", "silver@example.test"]);
  await writeFile(path.join(external, "tokens.json"), '{"color":{"value":"#fff"}}\n');
  await writeFile(path.join(external, "unrelated.txt"), "untouched\n");
  await runGit(external, ["add", "tokens.json", "unrelated.txt"]);
  await runGit(external, ["commit", "-m", "initial"]);
  await setupWorkspace({ root: workspace, name: "Git Sync", id: "git-sync" });
  const plan = await inspectSourceLink({
    root: workspace,
    targetPath: external,
    kind: "design-system",
    as: "shared-system",
    answers: {
      paths: ["tokens.json"],
      mappings: [{ id: "tokens", external_path: "tokens.json", local_path: "design/system/imported.tokens.json", format: "dtcg-json", artifact_kind: "token-source" }],
    },
  });
  await applySourceLinkPlan({ plan });
  const bindingId = "shared-system-tokens";
  const initial = await inspectSynchronization({ root: workspace, bindingId, direction: "external-to-local" });
  await applySynchronization({ root: workspace, input: initial, only: [initial.proposal.operations[0].id] });
  await writeFile(path.join(workspace, "design/system/imported.tokens.json"), '{"color":{"value":"#000"}}\n');
  const proposal = await inspectSynchronization({ root: workspace, bindingId, direction: "local-to-external" });
  await assert.rejects(
    applySynchronization({
      root: workspace,
      input: proposal,
      only: [proposal.proposal.operations[0].id],
      hooks: { afterExternalCommit: () => { throw new Error("simulated process death"); } },
    }),
    /simulated process death/,
  );
  const recovery = await inspectRecovery({ root: workspace });
  assert.equal(recovery.recoverable.some(({ id }) => id === proposal.proposal.id), true);
  await assert.rejects(
    rollbackRecovery({ root: workspace, id: proposal.proposal.id }),
    /can only resume forward/,
  );
  const result = await resumeRecovery({ root: workspace, id: proposal.proposal.id });
  assert.equal(result.status, "applied");
  assert.equal((await runGit(external, ["branch", "--show-current"])).stdout.trim(), "silver/sync-git-sync-shared-system");
  assert.match((await runGit(external, ["log", "-1", "--pretty=%s"])).stdout, /silver: synchronize/);
  assert.equal(await readFile(path.join(external, "unrelated.txt"), "utf8"), "untouched\n");
  assert.equal((await runGit(external, ["remote"])).stdout.trim(), "");
  await writeFile(path.join(workspace, "design/system/imported.tokens.json"), '{"color":{"value":"#111"}}\n');
  const second = await inspectSynchronization({ root: workspace, bindingId, direction: "local-to-external" });
  await applySynchronization({ root: workspace, input: second, only: [second.proposal.operations[0].id] });
  assert.equal((await runGit(external, ["branch", "--show-current"])).stdout.trim(), "silver/sync-git-sync-shared-system");
  assert.equal((await runGit(external, ["rev-list", "--count", "HEAD"])).stdout.trim(), "3");
});
