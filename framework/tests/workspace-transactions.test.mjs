import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, readFile, readlink, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  listWorkspaceTransactions,
  prepareWorkspaceTransaction,
  recoverRollbackWorkspaceTransaction,
  resumeWorkspaceTransaction,
  runWorkspaceTransaction,
} from "../runtime/workspace-transactions.mjs";
import { workspaceContentIntegrity } from "../runtime/workspace-mutations.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-transaction-"));
  await mkdir(path.join(root, ".silver"));
  await mkdir(path.join(root, "design"));
  await writeFile(path.join(root, "design", "value.txt"), "before\n");
  await writeFile(path.join(root, ".silver", "lock.yaml"), "version: old\n");
  return root;
}

test("commits ordered mutations and activates the framework lock last", async () => {
  const root = await fixture();
  const activated = [];
  const result = await runWorkspaceTransaction({
    root,
    command: "test update",
    operations: [
      { id: "lock", type: "write", path: ".silver/lock.yaml", content: "version: next\n", lockLast: true },
      { id: "value", type: "write", path: "design/value.txt", content: "after\n", expectedIntegrity: workspaceContentIntegrity("before\n") },
    ],
    hooks: { afterActivate: ({ operation }) => activated.push(operation.id) },
    validate: async () => ({ status: "pass" }),
  });
  assert.equal(result.status, "committed");
  assert.deepEqual(activated, ["value", "lock"]);
  assert.equal(await readFile(path.join(root, "design/value.txt"), "utf8"), "after\n");
  assert.equal(await readFile(path.join(root, ".silver/lock.yaml"), "utf8"), "version: next\n");
});

test("managed Claude adapter links participate in activation and rollback", async () => {
  const root = await fixture();
  await mkdir(path.join(root, ".skills", "reconcile"), { recursive: true });
  const operation = {
    id: "adapter",
    type: "managed-link",
    path: ".claude/skills/silver-reconcile",
    target: "../../.skills/reconcile",
  };
  await assert.rejects(runWorkspaceTransaction({
    root,
    command: "test managed link rollback",
    operations: [operation],
    validate: async () => ({ status: "fail" }),
  }), /did not pass/);
  const adapter = path.join(root, ".claude/skills/silver-reconcile");
  await assert.rejects(lstat(adapter), { code: "ENOENT" });
  await runWorkspaceTransaction({
    root,
    command: "test managed link",
    operations: [operation],
  });
  assert.equal((await lstat(adapter)).isSymbolicLink(), true);
  assert.equal(await readlink(adapter), "../../.skills/reconcile");
});

test("a validation failure restores exact preimages", async () => {
  const root = await fixture();
  await assert.rejects(
    runWorkspaceTransaction({
      root,
      command: "test rollback",
      operations: [
        { id: "value", type: "write", path: "design/value.txt", content: "after\n" },
        { id: "new", type: "write", path: "design/new.txt", content: "new\n" },
        { id: "lock", type: "write", path: ".silver/lock.yaml", content: "version: next\n", lockLast: true },
      ],
      validate: async () => ({ status: "fail", reason: "injected" }),
    }),
    /did not pass/,
  );
  assert.equal(await readFile(path.join(root, "design/value.txt"), "utf8"), "before\n");
  assert.equal(await readFile(path.join(root, ".silver/lock.yaml"), "utf8"), "version: old\n");
  await assert.rejects(readFile(path.join(root, "design/new.txt"), "utf8"), { code: "ENOENT" });
});

test("prepared transactions are discoverable and explicitly recoverable by rollback", async () => {
  const root = await fixture();
  const journal = await prepareWorkspaceTransaction({
    root,
    command: "test interrupted",
    id: "interrupted-transaction",
    operations: [{ id: "value", type: "write", path: "design/value.txt", content: "after\n" }],
  });
  assert.equal(journal.phase, "prepared");
  assert.deepEqual(await listWorkspaceTransactions(root), [
    {
      id: "interrupted-transaction",
      command: "test interrupted",
      phase: "prepared",
      updated_at: journal.updated_at,
      recoverable: true,
    },
  ]);
  const result = await recoverRollbackWorkspaceTransaction({ root, id: journal.id });
  assert.equal(result.status, "rolled-back");
  assert.equal(await readFile(path.join(root, "design/value.txt"), "utf8"), "before\n");
});

test("stale expected integrity fails during preparation without mutating targets", async () => {
  const root = await fixture();
  await assert.rejects(
    runWorkspaceTransaction({
      root,
      command: "test stale",
      operations: [{ id: "value", type: "write", path: "design/value.txt", content: "after\n", expectedIntegrity: workspaceContentIntegrity("other\n") }],
    }),
    /input is stale/,
  );
  assert.equal(await readFile(path.join(root, "design/value.txt"), "utf8"), "before\n");
});

test("resume completes a process-death gap after the preimage rename", async () => {
  const root = await fixture();
  const journal = await prepareWorkspaceTransaction({
    root,
    command: "test killed",
    id: "killed-after-preimage",
    operations: [{ id: "value", type: "write", path: "design/value.txt", content: "after\n" }],
  });
  const operation = journal.operations[0];
  operation.state = "activating";
  journal.phase = "committing";
  await writeFile(
    path.join(root, ".silver/transactions", journal.id, "journal.json"),
    `${JSON.stringify(journal, null, 2)}\n`,
  );
  await rename(path.join(root, operation.path), path.join(root, operation.backup));
  const result = await resumeWorkspaceTransaction({
    root,
    id: journal.id,
    validate: async () => ({ status: "pass" }),
  });
  assert.equal(result.status, "committed");
  assert.equal(await readFile(path.join(root, "design/value.txt"), "utf8"), "after\n");
});

test("a concurrent lifecycle mutation is rejected with the owning transaction id", async () => {
  const root = await fixture();
  await prepareWorkspaceTransaction({
    root,
    command: "first",
    id: "first-transaction",
    operations: [{ id: "value", type: "write", path: "design/value.txt", content: "after\n" }],
  });
  await assert.rejects(
    prepareWorkspaceTransaction({
      root,
      command: "second",
      id: "second-transaction",
      operations: [{ id: "value", type: "write", path: "design/value.txt", content: "other\n" }],
    }),
    (error) => error.code === "SILVER_TRANSACTION_LOCKED" && error.transactionId === "first-transaction",
  );
  await recoverRollbackWorkspaceTransaction({ root, id: "first-transaction" });
});
