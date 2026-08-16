#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkResult, exitCode, findFiles, finding, parseArguments, resolvePolicyProfile, workspacePath } from "./check-lib.mjs";

export async function checkAccessibility(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "accessibility";
  const policyProfile = await resolvePolicyProfile(root);
  const requested = ["design/system", "prototypes", "design/work/sketches", "design/work/visualizations", "presentations", "production"];
  const completed = [];
  const findings = [];
  const files = (await Promise.all(requested.map((directory) => findFiles(path.join(root, directory), (file) => file.endsWith(".html"))))).flat();
  for (const absolute of files) {
    const file = workspacePath(root, absolute);
    const html = await readFile(absolute, "utf8");
    completed.push(file);
    const rules = [
      [/<html[^>]+lang=/i, "accessibility.document-language", "HTML target needs a document language."],
      [/<meta[^>]+name=["']viewport["']/i, "accessibility.viewport-meta", "HTML target needs a viewport meta tag."],
      [/<main(?:\s|>)/i, "accessibility.main-landmark", "HTML target needs a main landmark."],
      [/<h1(?:\s|>)/i, "accessibility.h1", "HTML target needs a level-one heading."]
    ];
    for (const [pattern, rule, message] of rules) if (!pattern.test(html)) findings.push(finding({ checker, rule, file, message, policyProfile }));
    for (const match of html.matchAll(/<button\b([^>]*)>/gi)) if (!/\btype=/.test(match[1])) findings.push(finding({ checker, rule: "accessibility.button-type", file, message: "Buttons need an explicit type.", policyProfile }));
    for (const match of html.matchAll(/<img\b([^>]*)>/gi)) if (!/\balt=/.test(match[1])) findings.push(finding({ checker, rule: "accessibility.image-alt", file, message: "Images need an alt attribute.", policyProfile }));
    for (const match of html.matchAll(/<input\b([^>]*)>/gi)) {
      const id = match[1].match(/\bid=["']([^"']+)/)?.[1];
      if (id && !new RegExp(`<label[^>]+for=["']${id}["']`, "i").test(html)) findings.push(finding({ checker, rule: "accessibility.input-label", file, message: `Input ${id} needs an associated label.`, policyProfile }));
    }
  }
  return checkResult({ checker, policyProfile, requested, completed, findings });
}

async function main() { try { const result = await checkAccessibility(parseArguments(process.argv.slice(2))); console.log(JSON.stringify(result, null, 2)); process.exitCode = exitCode(result); } catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 3; } }
if (import.meta.main ?? (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)))) void main();
