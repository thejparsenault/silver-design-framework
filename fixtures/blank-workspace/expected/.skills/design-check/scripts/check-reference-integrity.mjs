#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkResult, exitCode, finding, parseArguments, workspacePath } from "./check-lib.mjs";

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
const KNOWN_USAGE = new Set(["inspiration-only", "internal", "production", "unrestricted"]);

async function collectionFiles(root) {
  const directory = path.join(root, "design", "references");
  if (!(await exists(directory))) return [];
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

async function resultFiles(root) {
  const directory = path.join(root, ".silver", "results", "skills");
  if (!(await exists(directory))) return [];
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

export async function checkReferenceIntegrity(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "reference-integrity";
  const files = await collectionFiles(root);
  const requested = files.map((absolute) => workspacePath(root, absolute));
  const completed = [];
  const findings = [];
  const collections = new Map();

  for (const absolute of files) {
    const relative = workspacePath(root, absolute);
    try {
      const catalog = JSON.parse(await readFile(absolute, "utf8"));
      if (catalog.schema !== "silver/reference-collection/v1") {
        throw new Error("Collection does not declare silver/reference-collection/v1.");
      }
      collections.set(catalog.id, catalog);
      const ids = new Set();
      for (const item of catalog.references ?? []) {
        if (ids.has(item.id)) {
          findings.push(finding({ checker, rule: "reference.duplicate-id", file: relative, message: `Duplicate reference id: ${item.id}.` }));
          continue;
        }
        ids.add(item.id);

        if (!KNOWN_USAGE.has(item.rights?.usage)) {
          findings.push(finding({ checker, rule: "reference.unknown-rights", file: relative, message: `Reference ${item.id} has an unrecognized rights.usage.`, observedValue: item.rights?.usage }));
        }

        const target = path.resolve(root, item.path);
        if (!target.startsWith(`${root}${path.sep}`) || !(await exists(target))) {
          findings.push(finding({ checker, rule: "reference.file-unavailable", file: relative, message: `Reference file is unavailable: ${item.path}.`, observedValue: item.id }));
          continue;
        }
        if (sha256(await readFile(target)) !== item.integrity) {
          findings.push(finding({ checker, rule: "reference.integrity-mismatch", file: workspacePath(root, target), message: `Integrity does not match collection entry ${item.id}.` }));
        }
      }
      completed.push(relative);
    } catch (error) {
      findings.push(finding({ checker, rule: "reference.collection-invalid", file: relative, message: error.message }));
    }
  }

  // A reference marked inspiration-only informs thinking; it must never be
  // what production output is shown to have cited. Citations live in the
  // recorded invocation results, not in rendered output, so that is where
  // this looks.
  for (const absolute of await resultFiles(root)) {
    const relative = workspacePath(root, absolute);
    let result;
    try {
      result = JSON.parse(await readFile(absolute, "utf8"));
    } catch {
      continue;
    }
    const citations = result?.provenance?.references ?? [];
    if (citations.length === 0) continue;
    const touchesProduction = (result.outputs ?? []).some((output) =>
      (output.path ?? "").startsWith("production/"),
    );
    if (!touchesProduction) continue;
    for (const citation of citations) {
      const collection = collections.get(citation.collection);
      if (!collection) continue;
      for (const id of citation.ids) {
        const item = collection.references?.find((entry) => entry.id === id);
        if (item?.rights?.usage === "inspiration-only") {
          findings.push(
            finding({
              checker,
              rule: "reference.inspiration-only-cited-by-production",
              file: relative,
              message: `Production invocation ${result.invocation_id} cites inspiration-only reference ${citation.collection}/${id}.`,
              observedValue: id,
            }),
          );
        }
      }
    }
  }

  return checkResult({ checker, requested, completed, findings });
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: check-reference-integrity.mjs [--root <workspace>]");
      return;
    }
    const result = await checkReferenceIntegrity(options);
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
