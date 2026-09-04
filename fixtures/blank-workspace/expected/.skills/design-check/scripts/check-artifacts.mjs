#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  advisory,
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
import {
  isDirectoryKind,
  registryContractFor,
  structuredSchemaFor,
} from "./artifact-kinds.mjs";

let contractsPromise;

async function runtimeContracts(injected) {
  if (injected) return injected;
  contractsPromise ??= import(
    "silver-design-framework/framework/runtime/contracts.mjs",
  ).catch(() => null);
  return contractsPromise;
}

async function validateV2(name, value, injected) {
  const contracts = await runtimeContracts(injected);
  if (contracts) {
    await contracts.assertV2(name, value);
    return;
  }
  // token-source is a resolved DTCG tree, not a schema-enveloped Silver
  // document — it has no schema/id/revision to check, only structure.
  if (name === "token-source.schema.json") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${name} structural validation failed in dependency-free installation.`);
    }
    return;
  }
  const expected = {
    "asset-catalog.schema.json": "silver/asset-catalog/v2",
    "component-catalog.schema.json": "silver/component-catalog/v1",
    "component-expression.schema.json": "silver/component-expression/v1",
    "design-context.schema.json": "silver/design-context/v1",
    "guidance-source.schema.json": "silver/guidance-source/v1",
    "linked-source.schema.json": "silver/linked-source/v1",
    "presentation-kit.schema.json": "silver/presentation-kit/v2",
    "working-artifact.schema.json": "silver/working-artifact/v2",
  }[name];
  if (
    !expected ||
    value?.schema !== expected ||
    typeof value.id !== "string" ||
    (![
      "guidance-source.schema.json",
      "linked-source.schema.json",
      "presentation-kit.schema.json",
    ].includes(name) &&
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

// Structured artifacts ship as .json or .yaml. check-lib's YAML reader is a
// deliberately dependency-free line parser rather than a full YAML
// implementation, so it cannot stand in for JSON.parse here.
async function readStructured(absolute) {
  return absolute.endsWith(".json")
    ? JSON.parse(await readFile(absolute, "utf8"))
    : readYaml(absolute);
}

export async function checkArtifacts(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "contract-integrity";
  const findings = [];
  const advisories = [];
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
      // How a kind is stored decides how it is checked. See artifact-kinds.mjs.
      if (artifact.kind === "permission-policy") {
        const policy = await readYaml(absolute);
        if (policy.schema !== "silver/permission-policy/v1") {
          throw new Error("Permission policy does not declare the v1 schema.");
        }
        continue;
      }
      // A directory-backed catalog's contract is the set of contracts it holds.
      if (isDirectoryKind(artifact.kind)) {
        continue;
      }
      const structuredSchema = structuredSchemaFor(artifact.kind);
      if (structuredSchema) {
        const value = await readStructured(absolute);
        await validateV2(structuredSchema, value, options.runtime?.contracts);
        // token-source is a resolved DTCG tree, not a Silver artifact document
        // — it has no id of its own to compare against the manifest mapping.
        if (value.id !== undefined && value.id !== artifact.id) {
          throw new Error(
            `${artifact.kind} ID "${value.id}" does not match its manifest mapping "${artifact.id}".`,
          );
        }
        continue;
      }
      const registry = registryContractFor(artifact.kind);
      if (registry) {
        const value = await readStructured(absolute);
        const variant = (registry.variants ?? [registry]).find(
          ({ schema }) => schema === value.schema,
        );
        if (!variant || !Array.isArray(value.sources)) {
          throw new Error(`${registry.label} does not declare a supported schema.`);
        }
        for (const source of value.sources) {
          await validateV2(variant.entrySchema, source, options.runtime?.contracts);
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
      await validateV2("working-artifact.schema.json", artifact, options.runtime?.contracts);
      // Artifact sources are immutable authorship provenance. Their current
      // availability and revision are deliberately irrelevant after this
      // artifact revision is recorded; live inputs are checked before writes.
      const enforceReviewSurface = ![
        "archived",
        "rejected",
        "stale",
      ].includes(artifact.status);
      if (artifact.kind === "visualization" && enforceReviewSurface) {
        const renders = Array.isArray(artifact.payload.renders)
          ? artifact.payload.renders
          : artifact.payload.view_path
            ? [{ id: "primary", medium: "local", path: artifact.payload.view_path }]
            : [];
        // A local render can be declared before its file exists — recording the
        // visualization and adding the render are legitimately two steps, and the
        // runtime's own handoff readiness already treats an unrendered declaration as
        // "not yet", not as broken. Whether that gap is expected or a defect is
        // exactly what the artifact's own status already says: a draft is still
        // being worked on, so a missing render is only worth a note; once it is
        // active or accepted it is something someone can be sent to review, and a
        // missing render there is a real finding.
        const missingLocalRenderSeverity = artifact.status === "draft" ? "advisory" : "finding";
        for (const render of renders) {
          if (render.medium === "local") {
            const localRender = path.resolve(root, render.path);
            if (
              !localRender.startsWith(`${root}${path.sep}`) ||
              !(await exists(localRender))
            ) {
              const args = {
                checker,
                rule: "artifact.visualization-render-unavailable",
                file,
                message: `Local visualization render ${render.id} is missing at its declared path.`,
                observedValue: render.path,
              };
              (missingLocalRenderSeverity === "advisory" ? advisories : findings).push(
                missingLocalRenderSeverity === "advisory" ? advisory(args) : finding(args),
              );
            }
          } else if (!render.binding) {
            findings.push(finding({
              checker,
              rule: "artifact.visualization-render-unverified",
              file,
              message: `External visualization render ${render.id} has a URL but no representation binding.`,
              observedValue: render.url,
            }));
          } else if (!(await exists(path.join(root, "design", "integrations", `${render.binding}.yaml`)))) {
            findings.push(finding({
              checker,
              rule: "artifact.visualization-binding-unavailable",
              file,
              message: `External visualization render ${render.id} references an unavailable binding.`,
              observedValue: render.binding,
            }));
          } else {
            try {
              const binding = await readYaml(path.join(root, "design", "integrations", `${render.binding}.yaml`));
              await validateV2("representation-binding-v2.schema.json", binding, options.runtime?.contracts);
              if (binding.id !== render.binding) {
                throw new Error(`Binding identifies ${binding.id}, not ${render.binding}.`);
              }
            } catch (error) {
              findings.push(finding({
                checker,
                rule: "artifact.visualization-binding-invalid",
                file,
                message: `External visualization render ${render.id} has an invalid representation binding: ${error.message}`,
                observedValue: render.binding,
              }));
            }
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
  return checkResult({ checker, requested, completed, findings, advisories });
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

if (import.meta.main ?? (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
)) {
  void main();
}
