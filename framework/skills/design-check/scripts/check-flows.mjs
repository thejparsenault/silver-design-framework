#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkFlowStructure } from "../../flow/scripts/check-flow.mjs";
import {
  checkResult,
  exitCode,
  findFiles,
  finding,
  loadManifest,
  parseArguments,
  workspacePath,
} from "./check-lib.mjs";

const requiredFields = [
  "schema",
  "id",
  "title",
  "kind",
  "scope",
  "status",
  "revision",
  "purpose",
  "actors",
  "desired_outcomes",
  "start_nodes",
  "nodes",
  "transitions",
  "created",
  "updated",
];

export async function checkFlows(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "flow-structure";
  const findings = [];
  let roots = ["design/flows"];
  try {
    const { value: manifest } = await loadManifest(root);
    roots = manifest.flow_policy?.roots ?? roots;
  } catch {
    // Artifact checker reports the malformed manifest independently.
  }
  const files = (
    await Promise.all(
      roots.map((relativeRoot) =>
        findFiles(path.resolve(root, relativeRoot), (file) =>
          file.endsWith(`${path.sep}flow.json`),
        ),
      ),
    )
  ).flat();
  const requested = roots;
  const completed = [];

  for (const absolute of files) {
    const file = workspacePath(root, absolute);
    completed.push(file);
    try {
      const flow = JSON.parse(await readFile(absolute, "utf8"));
      for (const field of requiredFields) {
        if (flow[field] === undefined) {
          findings.push(
            finding({
              checker,
              rule: "flow.contract-required",
              file,
              message: `Flow is missing required field "${field}".`,
              observedValue: field,
            }),
          );
        }
      }
      if (flow.schema !== "design-practice/flow/v1") {
        findings.push(
          finding({
            checker,
            rule: "flow.contract-schema",
            file,
            message: "Flow does not declare the v1 schema.",
            observedValue: flow.schema,
          }),
        );
      }
      findings.push(
        ...checkFlowStructure(flow, { file }).map((item) => ({
          ...item,
          policy_profile: "prototype",
        })),
      );
    } catch (error) {
      findings.push(
        finding({
          checker,
          rule: "flow.unreadable",
          file,
          message: error.message,
        }),
      );
    }
  }
  return checkResult({ checker, requested, completed, findings });
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: check-flows.mjs [--root <workspace>]");
      return;
    }
    const result = await checkFlows(options);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = exitCode(result);
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
