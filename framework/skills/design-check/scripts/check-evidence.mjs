#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkResult, exitCode, findFiles, finding, parseArguments, workspacePath } from "./check-lib.mjs";

const evidenceKinds = new Set(["evidence", "finding", "observation", "evaluation", "change-case", "problem-frame", "measurement"]);
export async function checkEvidence(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "evidence-provenance";
  const requested = ["design/evidence", "design/work", "design/pitches"];
  const completed = [];
  const findings = [];
  const files = await findFiles(path.join(root, "design"), (file) => file.endsWith(".json"));
  for (const absolute of files) {
    let artifact;
    try { artifact = JSON.parse(await readFile(absolute, "utf8")); } catch { continue; }
    if (artifact.schema !== "silver/working-artifact/v2" || !evidenceKinds.has(artifact.kind)) continue;
    const file = workspacePath(root, absolute);
    completed.push(file);
    // Evidence and observations pin their provenance externally (source_pin,
    // sanitized) rather than through other in-workspace artifacts, so the
    // internal-sources requirement below does not apply to them.
    if (!artifact.sources?.length && !["observation", "evidence"].includes(artifact.kind)) {
      findings.push(finding({ checker, rule: "evidence.sources-required", file, message: `${artifact.kind} must pin at least one source.` }));
    }
    if (artifact.kind === "evidence" && !artifact.payload?.source_pin?.source) {
      findings.push(finding({ checker, rule: "evidence.source-unpinned", file, message: "Evidence must pin the source it was collected from." }));
    }
    if (artifact.kind === "finding" && !artifact.payload?.evidence_refs?.length) {
      findings.push(finding({ checker, rule: "evidence.finding-untraceable", file, message: "Finding must list evidence_refs." }));
    }
    if (artifact.kind === "observation" && artifact.payload?.sanitized !== true) {
      findings.push(finding({ checker, rule: "evidence.observation-unsanitized", file, message: "Repository observations must be explicitly sanitized." }));
    }
    if (artifact.kind === "evaluation" && !artifact.payload?.observations?.length) {
      findings.push(finding({ checker, rule: "evidence.evaluation-empty", file, message: "Evaluation must reference observations rather than imply unsupported findings." }));
    }
    if (artifact.kind === "change-case") {
      const impact = artifact.payload?.impact;
      if (!impact || !["estimated", "proxy", "measured"].includes(impact.kind) || !impact.source) {
        findings.push(finding({ checker, rule: "evidence.impact-unqualified", file, message: "Change-case impact must name its kind and source." }));
      }
    }
  }
  return checkResult({ checker, requested, completed, findings });
}

async function main() { try { const result = await checkEvidence(parseArguments(process.argv.slice(2))); console.log(JSON.stringify(result, null, 2)); process.exitCode = exitCode(result); } catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 3; } }
if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await main();
