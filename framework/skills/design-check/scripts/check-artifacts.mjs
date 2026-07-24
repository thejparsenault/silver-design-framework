#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkResult,
  exitCode,
  finding,
  loadManifest,
  parseArguments,
  parseFrontmatter,
  readYaml,
  workspacePath,
} from "./check-lib.mjs";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function checkArtifacts(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "artifact-schema";
  const findings = [];
  const requested = ["design/manifest.yaml"];
  const completed = [];
  let manifest;
  try {
    ({ value: manifest } = await loadManifest(root));
    completed.push("design/manifest.yaml");
  } catch (error) {
    findings.push(
      finding({
        checker,
        rule: "artifact.manifest-invalid",
        file: "design/manifest.yaml",
        message: error.message,
        suggestedCorrection: "Repair the manifest YAML before running other checks.",
      }),
    );
    return checkResult({ checker, requested, completed, findings });
  }

  for (const key of ["schema", "workspace", "artifacts", "flow_policy", "prototype_policy", "checks"]) {
    if (manifest[key] === undefined) {
      findings.push(
        finding({
          checker,
          rule: "artifact.manifest-required",
          file: "design/manifest.yaml",
          message: `Manifest is missing required field "${key}".`,
          observedValue: key,
        }),
      );
    }
  }
  if (
    manifest.schema !== "design-practice/manifest/v1" ||
    !Array.isArray(manifest.artifacts)
  ) {
    findings.push(
      finding({
        checker,
        rule: "artifact.manifest-contract",
        file: "design/manifest.yaml",
        message: "Manifest schema or artifact mappings do not match the v1 contract.",
      }),
    );
    return checkResult({ checker, requested, completed, findings });
  }

  const ids = new Set();
  for (const artifact of manifest.artifacts) {
    const relativePath = artifact?.path;
    if (relativePath) requested.push(relativePath);
    if (!artifact || typeof artifact !== "object") {
      findings.push(
        finding({
          checker,
          rule: "artifact.mapping-invalid",
          file: "design/manifest.yaml",
          message: "Every artifact mapping must be an object.",
        }),
      );
      continue;
    }
    for (const key of ["id", "kind", "path", "scope", "role", "status"]) {
      if (!artifact[key]) {
        findings.push(
          finding({
            checker,
            rule: "artifact.mapping-required",
            file: "design/manifest.yaml",
            message: `Artifact mapping is missing "${key}".`,
            observedValue: artifact.id ?? artifact.path ?? "unknown",
          }),
        );
      }
    }
    if (ids.has(artifact.id)) {
      findings.push(
        finding({
          checker,
          rule: "artifact.duplicate-id",
          file: "design/manifest.yaml",
          message: `Artifact id "${artifact.id}" is duplicated.`,
          observedValue: artifact.id,
        }),
      );
    }
    ids.add(artifact.id);
    if (!relativePath) continue;
    const absolute = path.resolve(root, relativePath);
    if (!absolute.startsWith(`${root}${path.sep}`) || !(await exists(absolute))) {
      findings.push(
        finding({
          checker,
          rule: "artifact.missing",
          file: relativePath,
          message: "Mapped artifact does not exist inside the workspace.",
        }),
      );
      continue;
    }
    completed.push(relativePath);
    try {
      if (artifact.kind === "permission-policy") {
        const policy = await readYaml(absolute);
        if (policy.schema !== "design-practice/permission-policy/v1") {
          throw new Error("Permission policy does not declare the v1 schema.");
        }
        continue;
      }
      const metadata = parseFrontmatter(await readFile(absolute, "utf8"));
      for (const key of [
        "schema",
        "id",
        "kind",
        "scope",
        "status",
        "owner",
        "updated",
        "authority",
      ]) {
        if (metadata[key] === undefined) {
          findings.push(
            finding({
              checker,
              rule: "artifact.frontmatter-required",
              file: relativePath,
              message: `Frontmatter is missing required field "${key}".`,
              observedValue: key,
            }),
          );
        }
      }
      if (metadata.schema !== "design-practice/artifact/v1") {
        findings.push(
          finding({
            checker,
            rule: "artifact.frontmatter-schema",
            file: relativePath,
            message: "Narrative artifact does not declare the v1 schema.",
            observedValue: metadata.schema,
          }),
        );
      }
      for (const key of ["id", "kind", "scope", "status"]) {
        if (metadata[key] !== artifact[key]) {
          findings.push(
            finding({
              checker,
              rule: "artifact.frontmatter-mismatch",
              file: relativePath,
              message: `Frontmatter "${key}" does not match the manifest mapping.`,
              observedValue: metadata[key],
              suggestedCorrection: `Use "${artifact[key]}" or update the canonical manifest intentionally.`,
            }),
          );
        }
      }
    } catch (error) {
      findings.push(
        finding({
          checker,
          rule: "artifact.metadata-invalid",
          file: workspacePath(root, absolute),
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
      console.log("Usage: check-artifacts.mjs [--root <workspace>]");
      return;
    }
    const result = await checkArtifacts(options);
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
