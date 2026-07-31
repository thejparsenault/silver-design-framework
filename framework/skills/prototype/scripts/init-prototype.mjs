#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const profiles = new Set(["constrained", "partial", "suspended"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const usage = `Initialize prototype metadata

Usage:
  init-prototype.mjs --id <id> --title <title> [options]

Options:
  --question <question>
  --flow-ref <reference>         Repeat; <id>@<revision>=<workspace-path>
  --prototype-root <path>       Defaults to prototypes
  --profile <profile>           constrained, partial, or suspended
  --suspend <constraint>        Repeat for a partial profile
  --override-reason <reason>    Required for partial or suspended
  --confirm-override            Required for partial or suspended
`;

function quote(value) {
  return JSON.stringify(value);
}

function safeRelativePath(value, label) {
  if (
    !value ||
    path.isAbsolute(value) ||
    value.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`${label} must be a safe workspace-relative path.`);
  }
  return value;
}

function renderMetadata(metadata) {
  const lines = [
    `schema: ${metadata.schema}`,
    `id: ${metadata.id}`,
    `title: ${quote(metadata.title)}`,
    `status: ${metadata.status}`,
    `constraint_profile: ${metadata.constraint_profile}`,
  ];
  if (metadata.question) {
    lines.push(`question: ${quote(metadata.question)}`);
  }
  if (metadata.flow_refs) {
    lines.push("flow_refs:");
    for (const flow of metadata.flow_refs) {
      lines.push(
        `  - id: ${flow.id}`,
        `    path: ${quote(flow.path)}`,
        `    revision: ${flow.revision}`,
      );
    }
  }
  if (metadata.suspended_constraints) {
    lines.push("suspended_constraints:");
    for (const constraint of metadata.suspended_constraints) {
      lines.push(`  - ${quote(constraint)}`);
    }
  }
  if (metadata.override_reason) {
    lines.push(`override_reason: ${quote(metadata.override_reason)}`);
  }
  lines.push(`created: ${metadata.created}`, `updated: ${metadata.updated}`, "");
  return lines.join("\n");
}

function parseFlowRef(value) {
  const match = value.match(
    /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)@([1-9][0-9]*)=(.+)$/,
  );
  if (!match) {
    throw new Error(
      "Flow references must use <id>@<revision>=<workspace-path>.",
    );
  }
  return {
    id: match[1],
    revision: Number(match[2]),
    path: safeRelativePath(match[3], "Flow reference path"),
  };
}

export async function initPrototype(options) {
  const root = path.resolve(options.root ?? process.cwd());
  const id = options.id;
  const title = options.title?.trim();
  const profile = options.profile ?? "constrained";
  const prototypeRoot = safeRelativePath(
    options.prototypeRoot ?? "prototypes",
    "Prototype root",
  );
  const suspended = [...new Set(options.suspendedConstraints ?? [])];
  const flowRefs = (options.flowRefs ?? []).map(parseFlowRef);

  if (!idPattern.test(id ?? "")) {
    throw new Error("Prototype id must be lowercase kebab-case.");
  }
  if (!title) {
    throw new Error("Prototype title is required.");
  }
  if (title.length > 120) {
    throw new Error("Prototype title must be 120 characters or fewer.");
  }
  if ((options.question?.trim().length ?? 0) > 500) {
    throw new Error("Prototype question must be 500 characters or fewer.");
  }
  if (!profiles.has(profile)) {
    throw new Error(`Unknown constraint profile: ${profile}`);
  }
  if (profile === "constrained") {
    if (options.confirmOverride || options.overrideReason || suspended.length > 0) {
      throw new Error(
        "A constrained prototype cannot declare suspended constraints or an override.",
      );
    }
  } else {
    if (!options.confirmOverride) {
      throw new Error(
        `${profile} requires --confirm-override after explicit user instruction.`,
      );
    }
    if (!options.overrideReason?.trim()) {
      throw new Error(`${profile} requires --override-reason.`);
    }
    if (options.overrideReason.trim().length > 500) {
      throw new Error("Override reason must be 500 characters or fewer.");
    }
    if (profile === "partial" && suspended.length === 0) {
      throw new Error("partial requires at least one --suspend value.");
    }
    if (suspended.some((constraint) => constraint.length > 120)) {
      throw new Error("Suspended constraints must be 120 characters or fewer.");
    }
  }

  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (
    !datePattern.test(date) ||
    Number.isNaN(parsedDate.valueOf()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("Date must be a valid YYYY-MM-DD value.");
  }
  const metadata = {
    schema: "silver/prototype/v1",
    id,
    title,
    status: "active",
    constraint_profile: profile,
    ...(options.question?.trim() ? { question: options.question.trim() } : {}),
    ...(flowRefs.length > 0 ? { flow_refs: flowRefs } : {}),
    ...(profile === "partial"
      ? { suspended_constraints: suspended }
      : profile === "suspended"
        ? { suspended_constraints: ["all"] }
        : {}),
    ...(profile !== "constrained"
      ? { override_reason: options.overrideReason.trim() }
      : {}),
    created: date,
    updated: date,
  };
  const directory = path.resolve(root, prototypeRoot, id);
  const rootPrefix = `${root}${path.sep}`;
  if (!directory.startsWith(rootPrefix)) {
    throw new Error("Prototype output escapes the workspace.");
  }
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, "prototype.yaml");
  await writeFile(outputPath, renderMetadata(metadata), {
    encoding: "utf8",
    flag: "wx",
  });
  const notesPath = path.join(directory, "NOTES.md");
  await writeFile(notesPath, renderNotes(metadata, prototypeRoot), {
    encoding: "utf8",
    flag: "wx",
  });
  return { metadata, outputPath, notesPath };
}

// A prototype exists to be looked at. `prototype.yaml` recorded `run: npm run
// dev` and nothing else — not the directory to run it from, whether to install
// first, or what URL to open — so the person it was built for had to ask how to
// see their own prototype. This is the human-facing half.
export function renderNotes(metadata, prototypeRoot) {
  const directory = `${prototypeRoot}/${metadata.id}`;
  return [
    `# ${metadata.title}`,
    "",
    ...(metadata.question ? [`**Testing:** ${metadata.question}`, ""] : []),
    `Constraint profile: \`${metadata.constraint_profile}\``,
    ...(metadata.constraint_profile !== "constrained"
      ? [
          "",
          `> This prototype suspends design-system constraints (${(metadata.suspended_constraints ?? []).join(", ")}).`,
          "> It is not a production candidate; promoting it means rebuilding against the",
          "> active design system.",
        ]
      : []),
    "",
    "## Run it",
    "",
    "```sh",
    `cd ${directory}`,
    "npm install       # first time only",
    "npm run dev",
    "```",
    "",
    "Vite prints the local URL when it starts — usually <http://localhost:5173>.",
    "Stop the server with Ctrl+C.",
    "",
    "To check the production build instead:",
    "",
    "```sh",
    "npm run build",
    "npm run preview   # usually http://localhost:4173",
    "```",
    "",
    "If this prototype has no `package.json`, it is a static prototype: open",
    "`index.html` in a browser, or serve the directory over HTTP.",
    "",
    "## Checking it",
    "",
    "```sh",
    ".silver/bin/silver check .",
    "```",
    "",
    "Browser checks — contrast, responsive behaviour, and interaction — need a",
    "reachable local URL. If the browser cannot open one, those checks report",
    "`not-run` rather than passing, and the prototype stays unverified.",
    "",
  ].join("\n");
}

function parseArguments(args) {
  const values = { flowRefs: [], suspendedConstraints: [] };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--confirm-override") {
      values.confirmOverride = true;
      continue;
    }
    const next = args[index + 1];
    if (!argument.startsWith("--") || !next || next.startsWith("--")) {
      throw new Error(`Invalid argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (key === "suspend") {
      values.suspendedConstraints.push(next);
    } else if (key === "flow-ref") {
      values.flowRefs.push(next);
    } else {
      const mapping = {
        date: "date",
        id: "id",
        profile: "profile",
        "prototype-root": "prototypeRoot",
        question: "question",
        root: "root",
        title: "title",
        "override-reason": "overrideReason",
      };
      if (!mapping[key]) {
        throw new Error(`Unknown option: --${key}`);
      }
      values[mapping[key]] = next;
    }
    index += 1;
  }
  return values;
}

async function main() {
  try {
    if (process.argv.slice(2).includes("--help")) {
      console.log(usage);
      return;
    }
    const result = await initPrototype(parseArguments(process.argv.slice(2)));
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
