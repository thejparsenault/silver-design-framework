import { randomUUID, createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";

import {
  createWorkspaceMutator,
  retryWorkspaceRename,
  workspaceContentIntegrity,
} from "./workspace-mutations.mjs";

const JOURNAL_SCHEMA = "silver/workspace-transaction/v1";
const RESULT_SCHEMA = "silver/workspace-transaction-result/v1";
const LOCK_PATH = ".silver/transactions/active.lock";

async function info(filePath) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function treeDigest(root) {
  const hash = createHash("sha256");
  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = path.join(prefix, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Transaction target contains a link: ${relative}`);
      if (entry.isDirectory()) await visit(absolute, relative);
      else if (entry.isFile()) {
        hash.update(relative.split(path.sep).join("/"));
        hash.update("\0");
        hash.update(await readFile(absolute));
        hash.update("\0");
      }
    }
  }
  await visit(root);
  return `sha256:${hash.digest("hex")}`;
}

async function currentIdentity(absolute) {
  const current = await info(absolute);
  if (!current) return { state: "missing" };
  if (current.isSymbolicLink()) return { state: "link", target: await readlink(absolute) };
  if (current.isDirectory()) return { state: "directory", integrity: await treeDigest(absolute) };
  if (current.isFile()) return { state: "file", integrity: workspaceContentIntegrity(await readFile(absolute)) };
  throw new Error(`Transaction target is not a regular file or directory: ${absolute}`);
}

function transactionPath(id, nested = "journal.json") {
  return `.silver/transactions/${id}/${nested}`;
}

function serialized(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function orderedOperations(operations) {
  const seen = new Set();
  return [...operations]
    .map((operation, index) => {
      const id = operation.id ?? `operation-${index + 1}`;
      if (seen.has(id)) throw new Error(`Duplicate transaction operation id: ${id}`);
      seen.add(id);
      if (!["write", "replace-tree", "convert-tree", "delete", "managed-link", "delete-managed-link"].includes(operation.type)) {
        throw new Error(`Unsupported transaction operation type: ${operation.type}`);
      }
      if (!operation.path || path.isAbsolute(operation.path)) {
        throw new Error(`Transaction operation ${id} requires a workspace-relative path.`);
      }
      return { ...operation, id };
    })
    .sort((left, right) => Number(Boolean(left.lockLast)) - Number(Boolean(right.lockLast)));
}

async function persistJournal(mutator, journal) {
  journal.updated_at = new Date().toISOString();
  await mutator.write(transactionPath(journal.id), serialized(journal));
}

async function acquireLock(mutator, transactionId, command) {
  try {
    await mutator.create(
      LOCK_PATH,
      serialized({ transaction_id: transactionId, command, process_id: process.pid }),
    );
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const active = JSON.parse(await readFile(mutator.absolute(LOCK_PATH), "utf8"));
    const locked = new Error(
      `Workspace mutation is locked by transaction ${active.transaction_id}. Run silver recover.`,
    );
    locked.code = "SILVER_TRANSACTION_LOCKED";
    locked.transactionId = active.transaction_id;
    throw locked;
  }
}

async function releaseLock(mutator, transactionId) {
  const lock = await info(mutator.absolute(LOCK_PATH));
  if (!lock) return;
  const active = JSON.parse(await readFile(mutator.absolute(LOCK_PATH), "utf8"));
  if (active.transaction_id !== transactionId) {
    throw new Error(`Transaction ${transactionId} does not own the workspace mutation lock.`);
  }
  await mutator.remove(LOCK_PATH);
}

async function prepareOperation(mutator, transactionId, operation, index) {
  const allowLeafLink = ["managed-link", "delete-managed-link", "convert-tree"].includes(operation.type);
  if (
    operation.type === "delete-managed-link" &&
    !/^\.claude[\/]skills[\/][^\/]+$/.test(operation.path)
  ) {
    throw new Error("Managed link deletion is limited to direct .claude/skills leaves.");
  }
  if (operation.type === "convert-tree" && operation.path.split(path.sep).join("/") !== "design/system") {
    throw new Error("Reviewed linked-tree conversion is limited to design/system.");
  }
  await mutator.assertSafe(operation.path, { allowLeafLink });
  const before = await currentIdentity(mutator.absolute(operation.path));
  if (operation.expectedIntegrity && before.integrity !== operation.expectedIntegrity) {
    throw new Error(`Transaction input is stale: ${operation.path}`);
  }
  const stage = transactionPath(transactionId, `stage/${index}-${operation.id}`);
  const backup = transactionPath(transactionId, `preimages/${index}-${operation.id}`);
  if (operation.type === "write") {
    await mutator.write(stage, operation.content, {
      encoding: operation.encoding ?? "utf8",
      ...(operation.mode ? { mode: operation.mode } : {}),
    });
  } else if (["replace-tree", "convert-tree"].includes(operation.type)) {
    await mutator.copyTree(operation.sourcePath, stage);
  }
  const staged = ["delete", "delete-managed-link"].includes(operation.type)
    ? { state: "missing" }
    : operation.type === "managed-link"
      ? { state: "link", target: operation.target }
    : await currentIdentity(mutator.absolute(stage));
  return {
    id: operation.id,
    type: operation.type,
    path: operation.path.split(path.sep).join("/"),
    state: "prepared",
    before,
    stage,
    staged,
    backup,
    ...(operation.type === "managed-link" ? { target: operation.target } : {}),
    lock_last: Boolean(operation.lockLast),
  };
}

export async function prepareWorkspaceTransaction({
  root,
  command,
  operations,
  metadata = {},
  id = `${Date.now().toString(36)}-${randomUUID()}`,
  hooks = {},
}) {
  const mutator = await createWorkspaceMutator(root);
  await acquireLock(mutator, id, command);
  const createdAt = new Date().toISOString();
  const journal = {
    schema: JOURNAL_SCHEMA,
    id,
    command,
    root: mutator.root,
    root_identity: await lstat(mutator.root).then(({ dev, ino }) => ({
      realpath: mutator.root,
      device: String(dev),
      inode: String(ino),
    })),
    phase: "prepared",
    created_at: createdAt,
    updated_at: createdAt,
    metadata,
    validation: [],
    operations: [],
  };
  try {
    await mutator.ensureDirectory(transactionPath(id, "stage"));
    await mutator.ensureDirectory(transactionPath(id, "preimages"));
    const ordered = orderedOperations(operations);
    for (let index = 0; index < ordered.length; index += 1) {
      await hooks.beforePrepareOperation?.({ operation: ordered[index], index, journal });
      journal.operations.push(await prepareOperation(mutator, id, ordered[index], index));
      await hooks.afterPrepareOperation?.({ operation: ordered[index], index, journal });
    }
    await persistJournal(mutator, journal);
    return journal;
  } catch (error) {
    await mutator.remove(transactionPath(id, ""), { recursive: true }).catch(() => {});
    await releaseLock(mutator, id).catch(() => {});
    throw error;
  }
}

async function revalidatePrepared(mutator, operation) {
  await mutator.assertSafe(operation.path, {
    allowLeafLink: ["managed-link", "delete-managed-link", "convert-tree"].includes(operation.type),
  });
  const current = await currentIdentity(mutator.absolute(operation.path));
  if (JSON.stringify(current) !== JSON.stringify(operation.before)) {
    throw new Error(`Transaction input changed after preparation: ${operation.path}`);
  }
  if (!["delete", "delete-managed-link", "managed-link"].includes(operation.type)) {
    const staged = await currentIdentity(mutator.absolute(operation.stage));
    if (JSON.stringify(staged) !== JSON.stringify(operation.staged)) {
      throw new Error(`Transaction staged content changed: ${operation.id}`);
    }
  }
}

async function activateOperation(mutator, journal, operation, hooks) {
  await revalidatePrepared(mutator, operation);
  operation.state = "activating";
  await persistJournal(mutator, journal);
  await hooks.beforeActivate?.({ journal, operation });
  if (operation.before.state !== "missing") {
    await mutator.assertSafe(operation.backup);
    await retryWorkspaceRename(
      mutator.absolute(operation.path),
      mutator.absolute(operation.backup),
    );
  }
  if (operation.type === "managed-link") {
    await mutator.managedSkillLink(operation.path, operation.target);
  } else if (!["delete", "delete-managed-link"].includes(operation.type)) {
    const parent = path.dirname(operation.path);
    if (parent !== ".") await mutator.ensureDirectory(parent);
    await retryWorkspaceRename(
      mutator.absolute(operation.stage),
      mutator.absolute(operation.path),
    );
  }
  operation.state = "activated";
  await persistJournal(mutator, journal);
  await hooks.afterActivate?.({ journal, operation });
}

async function rollbackOperation(mutator, journal, operation, hooks) {
  if (!["activated", "activating", "rolling-back"].includes(operation.state)) return;
  const previousState = operation.state;
  operation.state = "rolling-back";
  await persistJournal(mutator, journal);
  await hooks.beforeRollback?.({ journal, operation });
  const target = await info(mutator.absolute(operation.path));
  const backup = await info(mutator.absolute(operation.backup));
  const targetIsOriginal =
    previousState === "activating" &&
    !backup &&
    operation.before.state !== "missing";
  if (target && !targetIsOriginal) {
    await mutator.remove(operation.path, {
      recursive: target.isDirectory(),
      allowLeafLink: target.isSymbolicLink(),
    });
  }
  if (backup) {
    await retryWorkspaceRename(mutator.absolute(operation.backup), mutator.absolute(operation.path));
  }
  operation.state = "rolled-back";
  await persistJournal(mutator, journal);
  await hooks.afterRollback?.({ journal, operation });
}

async function cleanup(mutator, journal) {
  await mutator.remove(transactionPath(journal.id, "stage"), { recursive: true }).catch(() => {});
  await mutator.remove(transactionPath(journal.id, "preimages"), { recursive: true }).catch(() => {});
}

export async function rollbackWorkspaceTransaction({ root, journal, hooks = {} }) {
  const mutator = await createWorkspaceMutator(root);
  journal.phase = "rolling-back";
  await persistJournal(mutator, journal);
  for (const operation of [...journal.operations].reverse()) {
    await rollbackOperation(mutator, journal, operation, hooks);
  }
  journal.phase = "rolled-back";
  await persistJournal(mutator, journal);
  await cleanup(mutator, journal);
  await releaseLock(mutator, journal.id);
  return {
    schema: RESULT_SCHEMA,
    transaction_id: journal.id,
    command: journal.command,
    status: "rolled-back",
    operations: journal.operations.map(({ id, state }) => ({ id, state })),
  };
}

export async function commitWorkspaceTransaction({
  root,
  journal,
  validate = async () => ({ status: "pass" }),
  hooks = {},
}) {
  const mutator = await createWorkspaceMutator(root);
  try {
    journal.phase = "committing";
    await persistJournal(mutator, journal);
    for (const operation of journal.operations) {
      if (operation.state === "activated") continue;
      await activateOperation(mutator, journal, operation, hooks);
    }
    journal.phase = "validating";
    await persistJournal(mutator, journal);
    const validation = await validate({ root: mutator.root, journal });
    journal.validation.push(validation);
    if (!validation || validation.status !== "pass") {
      throw new Error(`Transaction validation did not pass: ${validation?.status ?? "not-run"}`);
    }
    journal.phase = "committed";
    await persistJournal(mutator, journal);
    await cleanup(mutator, journal);
    await releaseLock(mutator, journal.id);
    return {
      schema: RESULT_SCHEMA,
      transaction_id: journal.id,
      command: journal.command,
      status: "committed",
      operations: journal.operations.map(({ id, state }) => ({ id, state })),
      validation,
    };
  } catch (error) {
    const rollback = await rollbackWorkspaceTransaction({ root, journal, hooks }).catch(
      (rollbackError) => ({ status: "recovery-required", error: rollbackError.message }),
    );
    error.transactionId = journal.id;
    error.rollback = rollback;
    throw error;
  }
}

export async function runWorkspaceTransaction(options) {
  const journal = await prepareWorkspaceTransaction(options);
  return commitWorkspaceTransaction({
    root: options.root,
    journal,
    validate: options.validate,
    hooks: options.hooks,
  });
}

export async function readWorkspaceTransaction(root, id) {
  const mutator = await createWorkspaceMutator(root);
  const journal = JSON.parse(await readFile(mutator.absolute(transactionPath(id)), "utf8"));
  if (journal.schema !== JOURNAL_SCHEMA || journal.id !== id) {
    throw new Error(`Invalid workspace transaction journal: ${id}`);
  }
  if (journal.root !== mutator.root) throw new Error(`Transaction ${id} belongs to another workspace.`);
  return journal;
}

export async function listWorkspaceTransactions(root) {
  const mutator = await createWorkspaceMutator(root);
  const directory = mutator.absolute(".silver/transactions");
  const directoryInfo = await info(directory);
  if (!directoryInfo) return [];
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const journal = await readWorkspaceTransaction(mutator.root, entry.name);
      output.push({
        id: journal.id,
        command: journal.command,
        phase: journal.phase,
        updated_at: journal.updated_at,
        recoverable: !["committed", "rolled-back"].includes(journal.phase),
      });
    } catch {
      output.push({ id: entry.name, phase: "invalid", recoverable: false });
    }
  }
  return output.sort((left, right) => left.id.localeCompare(right.id));
}

export async function resumeWorkspaceTransaction({ root, id, validate, hooks = {} }) {
  const journal = await readWorkspaceTransaction(root, id);
  if (["committed", "rolled-back"].includes(journal.phase)) {
    throw new Error(`Transaction ${id} is already ${journal.phase}.`);
  }
  const mutator = await createWorkspaceMutator(root);
  const lock = await info(mutator.absolute(LOCK_PATH));
  if (!lock) await acquireLock(mutator, id, journal.command);
  else {
    const active = JSON.parse(await readFile(mutator.absolute(LOCK_PATH), "utf8"));
    if (active.transaction_id !== id) throw new Error(`Workspace is locked by ${active.transaction_id}.`);
  }
  // Resolve a process death between the two activation renames.
  for (const operation of journal.operations) {
    if (operation.state !== "activating") continue;
    const staged = await info(mutator.absolute(operation.stage));
    const target = await info(mutator.absolute(operation.path));
    const backup = await info(mutator.absolute(operation.backup));
    if (["delete", "delete-managed-link"].includes(operation.type) && !target && (backup || operation.before.state === "missing")) {
      operation.state = "activated";
    } else if (operation.type === "managed-link" && target?.isSymbolicLink()) {
      operation.state = "activated";
    } else if (!staged && target) {
      operation.state = "activated";
    } else if (staged && !target && (backup || operation.before.state === "missing")) {
      await retryWorkspaceRename(mutator.absolute(operation.stage), mutator.absolute(operation.path));
      operation.state = "activated";
    } else {
      throw new Error(`Cannot determine activation state for ${operation.id}; roll it back.`);
    }
    await persistJournal(mutator, journal);
  }
  return commitWorkspaceTransaction({ root, journal, validate, hooks });
}

export async function recoverRollbackWorkspaceTransaction({ root, id, hooks = {} }) {
  const journal = await readWorkspaceTransaction(root, id);
  if (["committed", "rolled-back"].includes(journal.phase)) {
    throw new Error(`Transaction ${id} is already ${journal.phase}.`);
  }
  const mutator = await createWorkspaceMutator(root);
  const lock = await info(mutator.absolute(LOCK_PATH));
  if (!lock) await acquireLock(mutator, id, journal.command);
  return rollbackWorkspaceTransaction({ root, journal, hooks });
}
