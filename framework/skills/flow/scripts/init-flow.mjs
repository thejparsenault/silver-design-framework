#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  flowKinds,
  flowScopes,
  idPattern,
  parseArguments,
  safeRelativePath,
  validDate,
} from "./flow-lib.mjs";

const usage = `Initialize a portable design flow

Usage:
  init-flow.mjs --id <id> --title <title> --purpose <purpose> --outcome <outcome> [options]

Options:
  --kind <kind>             user-flow, interaction-flow, or component-flow
  --scope <scope>           product or prototype
  --flow-root <path>        Defaults to design/flows
  --actor-id <id>           Defaults to user
  --actor-name <name>       Defaults to User
  --date <YYYY-MM-DD>
`;

export async function initFlow(options) {
  const root = path.resolve(options.root ?? process.cwd());
  const id = options.id;
  const title = options.title?.trim();
  const purpose = options.purpose?.trim();
  const outcome = options.outcome?.trim();
  const kind = options.kind ?? "user-flow";
  const scope = options.scope ?? "product";
  const actorId = options.actorId ?? "user";
  const actorName = options.actorName?.trim() || "User";
  const flowRoot = safeRelativePath(
    options.flowRoot ?? "design/flows",
    "Flow root",
  );
  const date = options.date ?? new Date().toISOString().slice(0, 10);

  if (!idPattern.test(id ?? "")) {
    throw new Error("Flow id must be lowercase kebab-case.");
  }
  if (!idPattern.test(actorId)) {
    throw new Error("Actor id must be lowercase kebab-case.");
  }
  if (!title || title.length > 120) {
    throw new Error("Flow title is required and must be 120 characters or fewer.");
  }
  if (!purpose || purpose.length > 500) {
    throw new Error("Flow purpose is required and must be 500 characters or fewer.");
  }
  if (!outcome || outcome.length > 500) {
    throw new Error("Flow outcome is required and must be 500 characters or fewer.");
  }
  if (actorName.length > 120) {
    throw new Error("Actor name must be 120 characters or fewer.");
  }
  if (!flowKinds.has(kind)) {
    throw new Error(`Unknown flow kind: ${kind}`);
  }
  if (!flowScopes.has(scope)) {
    throw new Error(`Unknown flow scope: ${scope}`);
  }
  if (!validDate(date)) {
    throw new Error("Date must be a valid YYYY-MM-DD value.");
  }

  const flow = {
    schema: "silver/flow/v1",
    id,
    title,
    kind,
    scope,
    status: "draft",
    revision: 1,
    purpose,
    actors: [{ id: actorId, name: actorName }],
    desired_outcomes: [outcome],
    start_nodes: ["start"],
    nodes: [
      {
        id: "start",
        type: kind === "component-flow" ? "component-state" : "screen",
        title: "Starting point",
        actor: actorId,
      },
      {
        id: "complete",
        type: "outcome",
        title: outcome,
        actor: actorId,
      },
    ],
    transitions: [
      {
        id: "complete-flow",
        from: "start",
        to: "complete",
        trigger: "Continue",
        actor: actorId,
      },
    ],
    created: date,
    updated: date,
  };

  const directory = path.resolve(root, flowRoot, id);
  if (!directory.startsWith(`${root}${path.sep}`)) {
    throw new Error("Flow output escapes the workspace.");
  }
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, "flow.json");
  await writeFile(outputPath, `${JSON.stringify(flow, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return { flow, outputPath };
}

function cliOptions(args) {
  const parsed = parseArguments(args);
  const known = new Set([
    "actor-id",
    "actor-name",
    "date",
    "flow-root",
    "id",
    "kind",
    "outcome",
    "purpose",
    "root",
    "scope",
    "title",
  ]);
  for (const key of Object.keys(parsed)) {
    if (key !== "positional" && !known.has(key)) {
      throw new Error(`Unknown option: --${key}`);
    }
  }
  if (parsed.positional.length > 0) {
    throw new Error(`Unexpected argument: ${parsed.positional[0]}`);
  }
  return {
    actorId: parsed["actor-id"],
    actorName: parsed["actor-name"],
    date: parsed.date,
    flowRoot: parsed["flow-root"],
    id: parsed.id,
    kind: parsed.kind,
    outcome: parsed.outcome,
    purpose: parsed.purpose,
    root: parsed.root,
    scope: parsed.scope,
    title: parsed.title,
  };
}

async function main() {
  try {
    if (process.argv.slice(2).includes("--help")) {
      console.log(usage);
      return;
    }
    const result = await initFlow(cliOptions(process.argv.slice(2)));
    console.log(path.relative(process.cwd(), result.outputPath));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
) {
  await main();
}
