import path from "node:path";

import { doctorWorkspace } from "./doctor.mjs";
import { setupWorkspace } from "./setup.mjs";
import { FRAMEWORK_VERSION } from "./version.mjs";

const usage = `Design Practice Framework

Usage:
  design-practice setup [directory] [--name <name>] [--id <id>] [--json]
  design-practice doctor [directory] [--json]
  design-practice version

Commands:
  setup   Initialize a blank workspace or resume an existing framework setup.
  doctor  Diagnose workspace contracts and managed files without changing them.
  version Print the local framework development version.
`;

function parseArguments(args) {
  const supportedFlags = new Set(["help", "id", "json", "name"]);
  const positionals = [];
  const flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    if (!supportedFlags.has(key)) {
      throw new Error(`Unknown option: --${key}`);
    }
    if (key === "json" || key === "help") {
      flags[key] = true;
      continue;
    }
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Option --${key} requires a value.`);
    }
    flags[key] = next;
    index += 1;
  }
  return { positionals, flags };
}

function printSetup(result, write) {
  write(
    `${result.mode === "new" ? "Initialized" : "Resumed"} ${result.workspace.name} at ${result.root}`,
  );
  write(
    result.created.length > 0
      ? `Created ${result.created.length} files.`
      : "No files changed.",
  );
  if (result.preserved.length > 0) {
    write(`Preserved ${result.preserved.length} existing files.`);
  }
  write("Recommended next actions:");
  for (const action of result.recommendedNextActions) {
    write(`  - ${action}`);
  }
}

function printDoctor(result, write) {
  if (result.diagnostics.length === 0) {
    write(`Workspace is healthy: ${result.root}`);
    return;
  }
  write(
    `Workspace has ${result.diagnostics.length} diagnostic(s): ${result.root}`,
  );
  for (const item of result.diagnostics) {
    const location = item.path ? ` ${item.path}` : "";
    write(
      `  ${item.level.toUpperCase()} ${item.code}${location}: ${item.message}`,
    );
  }
}

export async function runCli(
  args,
  {
    stdout = (message) => console.log(message),
    stderr = (message) => console.error(message),
  } = {},
) {
  try {
    const command = args[0];
    const { positionals, flags } = parseArguments(args.slice(1));
    if (!command || flags.help || command === "help" || command === "--help") {
      stdout(usage);
      return 0;
    }
    if (command === "version") {
      stdout(FRAMEWORK_VERSION);
      return 0;
    }
    if (!["setup", "doctor"].includes(command)) {
      throw new Error(`Unknown command: ${command}`);
    }
    if (positionals.length > 1) {
      throw new Error(`${command} accepts at most one directory.`);
    }
    const root = path.resolve(positionals[0] ?? process.cwd());

    if (command === "setup") {
      const result = await setupWorkspace({
        root,
        name: flags.name,
        id: flags.id,
      });
      if (flags.json) {
        stdout(JSON.stringify(result, null, 2));
      } else {
        printSetup(result, stdout);
      }
      return 0;
    }

    const result = await doctorWorkspace({ root });
    if (flags.json) {
      stdout(JSON.stringify(result, null, 2));
    } else {
      printDoctor(result, stdout);
    }
    return result.ok ? 0 : 1;
  } catch (error) {
    stderr(`Error: ${error.message}`);
    return 1;
  }
}
