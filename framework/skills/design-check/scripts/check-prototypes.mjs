#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkResult,
  exitCode,
  findFiles,
  finding,
  loadManifest,
  parseArguments,
  readYaml,
  workspacePath,
} from "./check-lib.mjs";

const profiles = new Set(["constrained", "partial", "suspended"]);
const requiredFields = [
  "schema",
  "id",
  "title",
  "status",
  "constraint_profile",
  "created",
  "updated",
];

export async function checkPrototypes(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "prototype-policy";
  const findings = [];
  let roots = ["prototypes"];
  try {
    const { value: manifest } = await loadManifest(root);
    roots = manifest.prototype_policy?.roots ?? roots;
  } catch {
    // Artifact checker reports the malformed manifest independently.
  }
  const files = (
    await Promise.all(
      roots.map((relativeRoot) =>
        findFiles(path.resolve(root, relativeRoot), (file) =>
          file.endsWith(`${path.sep}prototype.yaml`),
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
      const prototype = await readYaml(absolute);
      for (const field of requiredFields) {
        if (prototype[field] === undefined) {
          findings.push(
            finding({
              checker,
              rule: "prototype.contract-required",
              file,
              message: `Prototype metadata is missing "${field}".`,
              observedValue: field,
            }),
          );
        }
      }
      if (
        prototype.schema !== "silver/prototype/v1" ||
        !profiles.has(prototype.constraint_profile)
      ) {
        findings.push(
          finding({
            checker,
            rule: "prototype.contract-invalid",
            file,
            message: "Prototype schema or constraint profile is invalid.",
          }),
        );
      }
      if (
        prototype.constraint_profile !== "constrained" &&
        (!prototype.override_reason ||
          !Array.isArray(prototype.suspended_constraints) ||
          prototype.suspended_constraints.length === 0)
      ) {
        findings.push(
          finding({
            checker,
            rule: "prototype.override-not-recorded",
            file,
            message:
              "A partial or suspended profile must record its reason and suspended constraints.",
          }),
        );
      }
      if (
        prototype.constraint_profile === "suspended" &&
        !prototype.suspended_constraints?.includes("all")
      ) {
        findings.push(
          finding({
            checker,
            rule: "prototype.suspension-incomplete",
            file,
            message: 'A suspended profile must include the "all" constraint.',
          }),
        );
      }

      for (const reference of prototype.flow_refs ?? []) {
        const flowPath = path.resolve(root, reference.path ?? "");
        if (!flowPath.startsWith(`${root}${path.sep}`)) {
          throw new Error("Prototype flow reference escapes the workspace.");
        }
        try {
          const flow = JSON.parse(await readFile(flowPath, "utf8"));
          if (flow.id !== reference.id || flow.revision !== reference.revision) {
            findings.push(
              finding({
                checker,
                rule: "prototype.flow-revision-mismatch",
                file,
                message:
                  "Prototype flow reference does not match the flow's current ID and revision.",
                observedValue: reference,
                suggestedCorrection:
                  "Review the flow changes and deliberately update or retain the pinned revision.",
              }),
            );
          }
        } catch (error) {
          findings.push(
            finding({
              checker,
              rule: "prototype.flow-unavailable",
              file,
              message: `Referenced flow cannot be read: ${error.message}`,
              observedValue: reference.path,
            }),
          );
        }
      }
    } catch (error) {
      findings.push(
        finding({
          checker,
          rule: "prototype.metadata-invalid",
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
      console.log("Usage: check-prototypes.mjs [--root <workspace>]");
      return;
    }
    const result = await checkPrototypes(options);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = exitCode(result);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 3;
  }
}

if (import.meta.main ?? (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
)) {
  void main();
}
