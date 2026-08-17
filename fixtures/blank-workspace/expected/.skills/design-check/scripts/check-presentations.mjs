#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkResult, exitCode, findFiles, finding, parseArguments, workspacePath } from "./check-lib.mjs";

async function exists(file) { try { await access(file); return true; } catch { return false; } }
export async function checkPresentations(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "presentation-integrity";
  const requested = ["design/presentation-kit/kit.json", "presentations"];
  const completed = [];
  const findings = [];
  let kit;
  try {
    kit = JSON.parse(await readFile(path.join(root, requested[0]), "utf8"));
    if (kit.schema !== "silver/presentation-kit/v2") throw new Error("Kit does not declare the v2 contract.");
    const modes = new Set(kit.templates?.map(({ mode }) => mode));
    for (const mode of ["opportunity", "proposal", "outcome"]) if (!modes.has(mode)) throw new Error(`Kit is missing ${mode} template.`);
    for (const source of kit.source_revisions ?? []) if (!(await exists(path.join(root, source.path)))) throw new Error(`Pinned kit source is unavailable: ${source.path}.`);
    completed.push(requested[0]);
  } catch (error) {
    findings.push(finding({ checker, rule: "presentation.kit-invalid", file: requested[0], message: error.message }));
  }
  for (const absolute of await findFiles(path.join(root, "presentations"), (file) => file.endsWith(".html"))) {
    const file = workspacePath(root, absolute);
    const html = await readFile(absolute, "utf8");
    completed.push(file);
    for (const attribute of ["data-silver-target=\"presentation\"", "data-case-id=", "data-case-revision=", "data-kit-id=", "data-kit-revision="]) {
      if (!html.includes(attribute)) findings.push(finding({ checker, rule: "presentation.pin-missing", file, message: `Generated presentation is missing ${attribute}.` }));
    }
    if (kit && !html.includes(`data-kit-revision="${kit.revision}"`)) findings.push(finding({ checker, rule: "presentation.kit-stale", file, message: "Presentation does not pin the current kit revision." }));
  }
  return checkResult({ checker, requested, completed, findings });
}

async function main() { try { const result = await checkPresentations(parseArguments(process.argv.slice(2))); console.log(JSON.stringify(result, null, 2)); process.exitCode = exitCode(result); } catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 3; } }
if (import.meta.main ?? (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)))) void main();
