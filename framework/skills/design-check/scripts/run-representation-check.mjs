#!/usr/bin/env node

import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkRepresentationRule } from "./check-representation-lib.mjs";

export async function runRepresentationCheckCli(args = process.argv.slice(2)) {
  const checkerIndex = args.indexOf("--checker");
  const rootIndex = args.indexOf("--root");
  if (checkerIndex < 0 || !args[checkerIndex + 1]) {
    throw new Error("Usage: run-representation-check.mjs --checker <id> [--root <workspace>]");
  }
  const result = await checkRepresentationRule({
    checker: args[checkerIndex + 1],
    root: rootIndex >= 0 ? args[rootIndex + 1] : process.cwd(),
  });
  return result;
}

if (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    const result = await runRepresentationCheckCli();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "pass" ? 0 : result.status === "fail" ? 1 : 2;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 3;
  }
}
