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
  workspacePath,
} from "./check-lib.mjs";

const profiles = new Set(["constrained", "partial", "suspended"]);
const requiredFields = [
  "schema",
  "id",
  "title",
  "status",
  "constraint_profile",
  "revision",
  "created",
  "updated",
];
const REVISION_PATTERN = /^(?:r[1-9][0-9]*|sha256:[a-f0-9]{64}|[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)$/;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

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
          file.endsWith(`${path.sep}prototype.json`),
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
      const prototype = JSON.parse(await readFile(absolute, "utf8"));
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
        prototype.revision !== undefined &&
        (typeof prototype.revision !== "string" || !REVISION_PATTERN.test(prototype.revision))
      ) {
        findings.push(
          finding({
            checker,
            rule: "prototype.contract-invalid",
            file,
            message: `Prototype revision is malformed: ${JSON.stringify(prototype.revision)}.`,
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

      // sources[] is immutable historical provenance, not a live claim — this
      // validates shape only (a well-formed citation), never freshness. Each
      // citation was already verified accurate against live state once, at
      // write time (invoke-skill.mjs's validateCurrentInputs); nothing here
      // re-checks that later.
      for (const source of prototype.sources ?? []) {
        const problems = [];
        if (typeof source.id !== "string" || !ID_PATTERN.test(source.id)) problems.push("id");
        if (typeof source.kind !== "string" || source.kind.length === 0) problems.push("kind");
        if (typeof source.revision !== "string" || !REVISION_PATTERN.test(source.revision)) problems.push("revision");
        if (typeof source.path !== "string" || source.path.length === 0) problems.push("path");
        if (problems.length > 0) {
          findings.push(
            finding({
              checker,
              rule: "prototype.source-malformed",
              file,
              message: `Prototype source citation is missing or malformed: ${problems.join(", ")}.`,
              observedValue: source,
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
