#!/usr/bin/env node

import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkArtifacts } from "./check-artifacts.mjs";
import { checkFlows } from "./check-flows.mjs";
import {
  checkResult,
  finding,
  parseArguments,
} from "./check-lib.mjs";
import { checkPrototypes } from "./check-prototypes.mjs";
import { checkSemanticStyles } from "./check-semantic-styles.mjs";

const checkers = [
  ["artifact-schema", checkArtifacts],
  ["flow-structure", checkFlows],
  ["semantic-style", checkSemanticStyles],
  ["prototype-policy", checkPrototypes],
];

export async function runFastSuite(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const results = [];
  for (const [checker, run] of checkers) {
    try {
      results.push(await run({ root }));
    } catch (error) {
      results.push(
        checkResult({
          checker,
          requested: [checker],
          completed: [checker],
          findings: [
            finding({
              checker,
              rule: `${checker}.checker-error`,
              message: error.message,
            }),
          ],
        }),
      );
    }
  }
  const status = results.some(({ status }) => status === "fail")
    ? "fail"
    : results.some(({ status }) => status === "not-run")
      ? "not-run"
      : "pass";
  return {
    schema: "design-practice/check-suite-result/v1",
    suite: "fast",
    status,
    results,
  };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: run-fast.mjs [--root <workspace>]");
      return;
    }
    const result = await runFastSuite(options);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode =
      result.status === "pass"
        ? 0
        : result.status === "fail"
          ? 1
          : 2;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 3;
  }
}

if (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
) {
  await main();
}
