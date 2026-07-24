#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
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
  parseFrontmatter,
  readYaml,
  workspacePath,
} from "./check-lib.mjs";

let contracts;
try {
  contracts = await import("silver-design-framework/framework/runtime/contracts.mjs");
} catch {
  contracts = null;
}

async function validateV2(name, value) {
  if (contracts) {
    await contracts.assertV2(name, value);
    return;
  }
  const expected = {
    "asset-catalog.schema.json": "silver/asset-catalog/v2",
    "presentation-kit.schema.json": "silver/presentation-kit/v2",
    "working-artifact.schema.json": "silver/working-artifact/v2",
  }[name];
  if (
    !expected ||
    value?.schema !== expected ||
    typeof value.id !== "string" ||
    (name !== "presentation-kit.schema.json" &&
      typeof value.revision !== "string")
  ) {
    throw new Error(`${name} structural validation failed in dependency-free installation.`);
  }
}

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
  const checker = "contract-integrity";
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
    manifest.schema !== "silver/manifest/v1" ||
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
        if (policy.schema !== "silver/permission-policy/v1") {
          throw new Error("Permission policy does not declare the v1 schema.");
        }
        continue;
      }
      if (artifact.kind === "asset-catalog") {
        const catalog = JSON.parse(await readFile(absolute, "utf8"));
        await validateV2("asset-catalog.schema.json", catalog);
        if (catalog.id !== artifact.id) {
          throw new Error("Asset catalog ID does not match its manifest mapping.");
        }
        continue;
      }
      if (artifact.kind === "presentation-kit") {
        const kit = JSON.parse(await readFile(absolute, "utf8"));
        await validateV2("presentation-kit.schema.json", kit);
        if (artifact.id !== "presentation-kit") {
          throw new Error("Presentation kit manifest identity is invalid.");
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
      if (metadata.schema !== "silver/artifact/v1") {
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

  const workingFiles = await findFiles(
    path.join(root, "design"),
    (file) =>
      file.endsWith(".json") &&
      !file.endsWith(`${path.sep}catalog.json`) &&
      !file.endsWith(`${path.sep}kit.json`) &&
      !file.includes(`${path.sep}presentation-kit${path.sep}templates${path.sep}`) &&
      !file.endsWith(`${path.sep}flow.json`),
  );
  for (const absolute of workingFiles) {
    const file = workspacePath(root, absolute);
    requested.push(file);
    try {
      const artifact = JSON.parse(await readFile(absolute, "utf8"));
      if (artifact.schema !== "silver/working-artifact/v2") continue;
      await validateV2("working-artifact.schema.json", artifact);
      for (const reference of artifact.sources) {
        const source = path.resolve(root, reference.path);
        if (!source.startsWith(`${root}${path.sep}`) || !(await exists(source))) {
          findings.push(
            finding({
              checker,
              rule: "artifact.reference-unavailable",
              file,
              message: `Pinned source ${reference.id}@${reference.revision} is unavailable.`,
              observedValue: reference.path,
            }),
          );
          continue;
        }
        if (source.endsWith(".json")) {
          const sourceValue = JSON.parse(await readFile(source, "utf8"));
          const sourceRevision =
            typeof sourceValue.revision === "number"
              ? `r${sourceValue.revision}`
              : sourceValue.revision;
          if (
            sourceValue.id &&
            (sourceValue.id !== reference.id ||
              sourceRevision !== reference.revision)
          ) {
            findings.push(
              finding({
                checker,
                rule: "artifact.reference-stale",
                file,
                message: `Pinned source ${reference.id}@${reference.revision} does not match the current source revision.`,
                observedValue: reference.path,
              }),
            );
          }
        }
      }
      completed.push(file);
    } catch (error) {
      findings.push(
        finding({
          checker,
          rule: "artifact.working-invalid",
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
