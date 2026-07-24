#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkResult, exitCode, findFiles, finding, parseArguments, workspacePath } from "./check-lib.mjs";

export async function checkInteractions(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "critical-interactions";
  const requested = ["prototypes", "production"];
  const completed = [];
  const findings = [];
  for (const absolute of (await Promise.all(requested.map((directory) => findFiles(path.join(root, directory), (file) => file.endsWith("index.html"))))).flat()) {
    const file = workspacePath(root, absolute);
    const html = await readFile(absolute, "utf8");
    completed.push(file);
    const interactive = /data-(?:target|action)=/.test(html);
    if (!interactive) continue;
    const script = html.match(/<script[^>]+src=["']([^"']+)["']/i)?.[1];
    if (!script) {
      findings.push(finding({ checker, rule: "interaction.script-missing", file, message: "Declared critical actions have no local interaction script." }));
      continue;
    }
    try {
      const scriptPath = path.resolve(path.dirname(absolute), script);
      const source = await readFile(scriptPath, "utf8");
      completed.push(workspacePath(root, scriptPath));
      if (!/(?:addEventListener|onclick)/.test(source)) throw new Error("Script has no event handler.");
    } catch (error) {
      findings.push(finding({ checker, rule: "interaction.handler-unavailable", file, message: error.message }));
    }
  }
  return checkResult({ checker, requested, completed, findings });
}

async function main() { try { const result = await checkInteractions(parseArguments(process.argv.slice(2))); console.log(JSON.stringify(result, null, 2)); process.exitCode = exitCode(result); } catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 3; } }
if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await main();
