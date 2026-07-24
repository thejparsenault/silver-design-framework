#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkResult, exitCode, findFiles, finding, parseArguments, workspacePath } from "./check-lib.mjs";

export async function checkProduction(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "production-readiness";
  const requested = ["production"];
  const completed = [];
  const findings = [];
  for (const absolute of await findFiles(path.join(root, "production"), (file) => file.endsWith("index.html"))) {
    const file = workspacePath(root, absolute);
    const html = await readFile(absolute, "utf8");
    completed.push(file);
    for (const marker of ["data-silver-target=\"production\"", "data-handoff-id=", "data-handoff-revision="]) {
      if (!html.includes(marker)) findings.push(finding({ checker, rule: "production.intent-pin-missing", file, message: `Production target is missing ${marker}.` }));
    }
    if (html.includes("../prototypes/") || html.includes("/prototypes/")) findings.push(finding({ checker, rule: "production.prototype-source", file, message: "Production cannot consume prototype source directly." }));
    for (const linked of ["implementation.css", "implementation.js"]) {
      const target = path.join(path.dirname(absolute), linked);
      try { await readFile(target); completed.push(workspacePath(root, target)); }
      catch { findings.push(finding({ checker, rule: "production.file-missing", file, message: `Production recipe is missing ${linked}.` })); }
    }
  }
  return checkResult({ checker, requested, completed, findings, policyProfile: "production" });
}

async function main() { try { const result = await checkProduction(parseArguments(process.argv.slice(2))); console.log(JSON.stringify(result, null, 2)); process.exitCode = exitCode(result); } catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 3; } }
if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await main();
