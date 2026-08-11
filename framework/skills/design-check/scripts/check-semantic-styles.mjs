#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkResult,
  exitCode,
  findFiles,
  finding,
  parseArguments,
  workspacePath,
} from "./check-lib.mjs";

const extensions = new Set([
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);
const excluded = new Set([
  "design/system/expressions/html/styles/tokens.css",
  // The showcase dumps every resolved token's literal value as text — that is
  // its whole purpose, not a case of markup bypassing the semantic layer.
  "design/system/showcase.html",
]);
const literalPatterns = [
  {
    rule: "semantic-style.raw-color",
    pattern:
      /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\s*\(/gi,
    message: "Raw color literal bypasses the semantic token layer.",
    correction: "Use an approved semantic color custom property.",
  },
  {
    rule: "semantic-style.raw-dimension",
    pattern:
      /(?:^|[^\w-])(-?(?:[0-9]*\.)?[0-9]+(?:px|rem|em|ch|ex|cm|mm|in|pt|pc))\b/gi,
    message: "Raw fixed dimension bypasses the approved token scale.",
    correction: "Use an approved semantic, component, or structural custom property.",
  },
];

function withoutComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

function location(content, offset) {
  const before = content.slice(0, offset);
  const lines = before.split("\n");
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

export async function checkSemanticStyles(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "semantic-styles";
  const roots = ["design/system", "prototypes", "design/work/sketches", "presentations", "production"];
  const files = (
    await Promise.all(
      roots.map((relativeRoot) =>
        findFiles(
          path.resolve(root, relativeRoot),
          (file) => extensions.has(path.extname(file)),
        ),
      ),
    )
  ).flat();
  const requested = roots;
  const completed = [];
  const findings = [];

  for (const absolute of files) {
    const file = workspacePath(root, absolute);
    if (excluded.has(file)) continue;
    completed.push(file);
    const content = withoutComments(await readFile(absolute, "utf8"));
    for (const definition of literalPatterns) {
      definition.pattern.lastIndex = 0;
      for (const match of content.matchAll(definition.pattern)) {
        const observed = match[1] ?? match[0].trim();
        if (/^-?0(?:\.0+)?[a-z]+$/i.test(observed)) continue;
        const { line, column } = location(content, match.index);
        findings.push(
          finding({
            checker,
            rule: definition.rule,
            file,
            line,
            column,
            message: definition.message,
            observedValue: observed,
            suggestedCorrection: definition.correction,
          }),
        );
      }
    }
  }
  return checkResult({ checker, requested, completed, findings });
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: check-semantic-styles.mjs [--root <workspace>]");
      return;
    }
    const result = await checkSemanticStyles(options);
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
