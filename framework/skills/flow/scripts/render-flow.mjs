#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseArguments } from "./flow-lib.mjs";

function mermaidId(id) {
  return `node_${id.replaceAll("-", "_")}`;
}

function label(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function renderNode(node) {
  const id = mermaidId(node.id);
  const title = label(node.title);
  const shapes = {
    screen: `${id}["${title}"]`,
    "component-state": `${id}[["${title}"]]`,
    "user-action": `${id}(["${title}"])`,
    "system-action": `${id}["${title}"]`,
    decision: `${id}{"${title}"}`,
    external: `${id}[/"${title}"/]`,
    outcome: `${id}(("${title}"))`,
  };
  return shapes[node.type] ?? `${id}["${title}"]`;
}

function transitionLabel(transition) {
  const parts = [];
  if (transition.trigger) {
    parts.push(transition.trigger);
  }
  if (transition.condition) {
    parts.push(`[${transition.condition}]`);
  }
  return parts.length > 0 ? `|"${label(parts.join(" "))}"|` : "";
}

export function renderFlow(flow) {
  const lines = [
    `%% Generated from ${flow.id} revision ${flow.revision}. Edit flow.json, then rerender.`,
    "flowchart TD",
  ];
  for (const node of flow.nodes ?? []) {
    lines.push(`  ${renderNode(node)}`);
  }
  for (const transition of flow.transitions ?? []) {
    lines.push(
      `  ${mermaidId(transition.from)} -->${transitionLabel(transition)} ${mermaidId(transition.to)}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export async function renderFlowFile(inputPath, outputPath) {
  const absoluteInput = path.resolve(inputPath);
  const flow = JSON.parse(await readFile(absoluteInput, "utf8"));
  const absoluteOutput = path.resolve(
    outputPath ?? path.join(path.dirname(absoluteInput), "flow.mmd"),
  );
  await writeFile(absoluteOutput, renderFlow(flow), "utf8");
  return { flow, outputPath: absoluteOutput };
}

async function main() {
  try {
    if (process.argv.slice(2).includes("--help")) {
      console.log("Usage: render-flow.mjs <flow.json> [--output <flow.mmd>]");
      return;
    }
    const options = parseArguments(process.argv.slice(2));
    if (options.positional.length !== 1) {
      throw new Error("Provide exactly one flow.json path.");
    }
    for (const key of Object.keys(options)) {
      if (!["positional", "output"].includes(key)) {
        throw new Error(`Unknown option: --${key}`);
      }
    }
    const result = await renderFlowFile(
      options.positional[0],
      options.output,
    );
    console.log(path.relative(process.cwd(), result.outputPath));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
