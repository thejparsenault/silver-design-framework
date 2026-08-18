import path from "node:path";

import { doctorWorkspace } from "./doctor.mjs";
import {
  listWorkspaceTransactions,
  recoverRollbackWorkspaceTransaction,
  resumeWorkspaceTransaction,
} from "../framework/runtime/workspace-transactions.mjs";
import {
  listSynchronizationSagas,
  resumeSynchronizationSaga,
  rollbackSynchronizationSaga,
} from "./sync.mjs";

export async function inspectRecovery(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const transactions = await listWorkspaceTransactions(root);
  const sagas = await listSynchronizationSagas(root);
  const records = [...transactions, ...sagas];
  return {
    root,
    recoverable: records.filter(({ recoverable }) => recoverable),
    history: records.filter(({ recoverable }) => !recoverable),
  };
}

export async function resumeRecovery({ root = process.cwd(), id }) {
  const workspace = path.resolve(root);
  if ((await listSynchronizationSagas(workspace)).some((saga) => saga.id === id)) {
    return resumeSynchronizationSaga({ root: workspace, id });
  }
  return resumeWorkspaceTransaction({
    root: workspace,
    id,
    validate: async ({ journal }) => {
      const diagnosis = await doctorWorkspace({
        root: workspace,
        ignoreTransactionId: journal.id,
      });
      return {
        status: diagnosis.ok ? "pass" : "fail",
        check: "doctor",
        diagnostics: diagnosis.diagnostics,
      };
    },
  });
}

export async function rollbackRecovery({ root = process.cwd(), id }) {
  const workspace = path.resolve(root);
  if ((await listSynchronizationSagas(workspace)).some((saga) => saga.id === id)) {
    return rollbackSynchronizationSaga({ root: workspace, id });
  }
  return recoverRollbackWorkspaceTransaction({ root: workspace, id });
}
