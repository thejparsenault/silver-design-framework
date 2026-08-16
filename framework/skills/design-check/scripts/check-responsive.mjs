#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkResult, exitCode, findFiles, finding, parseArguments, resolvePolicyProfile, workspacePath } from "./check-lib.mjs";

export async function checkResponsive(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "responsive-behavior";
  const policyProfile = await resolvePolicyProfile(root);
  const requested = ["design/system", "prototypes", "design/work/sketches", "design/work/visualizations", "presentations", "production"];
  const completed = [];
  const findings = [];
  for (const absolute of (await Promise.all(requested.map((directory) => findFiles(path.join(root, directory), (file) => file.endsWith(".html"))))).flat()) {
    const file = workspacePath(root, absolute);
    const html = await readFile(absolute, "utf8");
    completed.push(file);
    if (!/<meta[^>]+name=["']viewport["']/i.test(html)) findings.push(finding({ checker, rule: "responsive.viewport-missing", file, message: "Target does not declare a responsive viewport.", policyProfile }));
    if (/\bwidth\s*:\s*[1-9][0-9]{3,}px/i.test(html)) findings.push(finding({ checker, rule: "responsive.fixed-wide-width", file, message: "Target contains a fixed width likely to overflow narrow viewports.", policyProfile }));
  }
  return checkResult({ checker, policyProfile, requested, completed, findings });
}

async function main() { try { const result = await checkResponsive(parseArguments(process.argv.slice(2))); console.log(JSON.stringify(result, null, 2)); process.exitCode = exitCode(result); } catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 3; } }
if (import.meta.main ?? (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)))) void main();
