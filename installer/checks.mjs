// Running deterministic checks and persisting their evidence.
//
// Until 0.7 nothing outside the release scenario ever wrote
// `.silver/results/checks/*.json`. `silver invoke --scaffold` prefilled every
// required check as `not-run`, the runtime believed whatever the request said,
// and the agent was expected to run a script, split the suite output into
// per-checker files, and hand-copy statuses back into the request. In practice
// that step was skipped: results recorded six passing checks whose evidence
// files did not exist, and accepted work never reached `ready`.
//
// The CLI owns this because it can reach the design-check scripts. The runtime
// only verifies the evidence, so neither half has to trust the other.
import path from "node:path";

import {
  FAST_CHECK_IDS,
  runFastSuite,
} from "../framework/skills/design-check/scripts/run-fast.mjs";
import { createWorkspaceMutator } from "../framework/runtime/workspace-mutations.mjs";

export const CHECK_RESULT_DIRECTORY = ".silver/results/checks";

export function checkResultPath(checker) {
  return `${CHECK_RESULT_DIRECTORY}/${checker}.json`;
}

// Checks that need a live browser. They cannot run in the fast suite, and
// reporting them as anything but `not-run` would claim verification that did not
// happen — the reported session had exactly this problem when enterprise policy
// blocked the local preview.
const BROWSER_ONLY_CHECKS = new Set([
  "responsive-behavior",
  "critical-interactions",
]);

// Run the fast suite and persist one evidence file per checker.
export async function runCheckSuite({ root, only } = {}) {
  const mutator = await createWorkspaceMutator(root);
  const workspaceRoot = mutator.root;
  const suite = await runFastSuite({ root: workspaceRoot, ...(only ? { only } : {}) });
  const selected = suite.results;

  for (const result of selected) {
    await mutator.write(
      checkResultPath(result.checker),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  }

  return {
    suite: suite.suite,
    status: selected.some(({ status }) => status === "fail")
      ? "fail"
      : selected.some(({ status }) => status === "not-run")
        ? "not-run"
        : "pass",
    results: selected,
  };
}

// Run the required checks declared by one skill contract, as part of an
// invocation. Returns the shape the runtime records in `result.checks`.
export async function runContractChecks({ root, contract }) {
  const required = contract.checks.filter(({ required }) => required);
  if (required.length === 0) return { checks: [] };

  const runnable = required
    .map(({ id }) => id)
    // The design-check skill owns the fast suite, whose responsive and
    // interaction checks are deterministic source inspections. Other skills
    // declare these ids as live verification requirements, so they remain
    // not-run until a browser suite actually exercises their render target.
    .filter(
      (id) => contract.id === "design-check" || !BROWSER_ONLY_CHECKS.has(id),
    );
  const suite = await runCheckSuite({ root, only: runnable });
  const byChecker = new Map(
    suite.results.map((result) => [result.checker, result]),
  );

  const checks = required.map(({ id }) => {
    if (contract.id !== "design-check" && BROWSER_ONLY_CHECKS.has(id)) {
      return {
        id,
        status: "not-run",
        result_path: checkResultPath(id),
        reason:
          "This check needs a live browser. Run the browser suite against a render target to verify it.",
      };
    }
    const result = byChecker.get(id);
    if (!result) {
      return {
        id,
        status: "not-run",
        result_path: checkResultPath(id),
        reason: `No checker named ${id} is installed in this workspace.`,
      };
    }
    return {
      id,
      status: result.status,
      result_path: checkResultPath(id),
      ...(result.status === "fail"
        ? {
            reason: `${result.findings.length} finding(s); see ${checkResultPath(id)}.`,
          }
        : {}),
    };
  });

  return { checks };
}

export { FAST_CHECK_IDS };
