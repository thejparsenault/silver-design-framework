import path from "node:path";

import { doctorWorkspace } from "./doctor.mjs";
import { migrateWorkspace } from "./migrate.mjs";
import { repairWorkspace } from "./repair.mjs";
import { setupWorkspace } from "./setup.mjs";
import { updateWorkspace } from "./update.mjs";
import { FRAMEWORK_VERSION } from "./version.mjs";

const usage = `The Silver Design Framework

Usage:
  silver setup [directory] [--name <name>] [--id <id>] [--json]
  silver doctor [directory] [--json]
  silver repair [directory] [--json]
  silver update [directory] [--json]
  silver migrate [directory] [--apply] [--json]
  silver version

Commands:
  setup   Initialize a blank workspace or resume an existing framework setup.
  doctor  Diagnose workspace contracts and managed files without changing them.
  repair  Regenerate disposable indexes and agent discovery pointers.
  update  Update unmodified framework-managed packages; report owned-package proposals.
  migrate Preview or explicitly apply the supported v1-to-v2 workspace migration.
  version Print the local framework development version.
`;

function parseArguments(args) {
  const supportedFlags = new Set(["apply", "help", "id", "json", "name"]);
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
    if (key === "apply" || key === "json" || key === "help") {
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

function printRepair(result, write) {
  write(
    result.ok
      ? `Repaired generated workspace files: ${result.root}`
      : `Repair completed with diagnostics: ${result.root}`,
  );
  write(
    result.repaired.length > 0
      ? `Repaired: ${result.repaired.join(", ")}`
      : "No generated files changed.",
  );
  for (const item of result.diagnostics) {
    write(
      `  ${item.level.toUpperCase()} ${item.code}${item.path ? ` ${item.path}` : ""}: ${item.message}`,
    );
  }
}

function printUpdate(result, write) {
  if (result.conflicts.length > 0) {
    write(
      `Update stopped with ${result.conflicts.length} conflict(s): ${result.root}`,
    );
    for (const conflict of result.conflicts) {
      write(
        `  CONFLICT ${conflict.package}${conflict.path ? ` ${conflict.path}` : ""}: ${conflict.reason}`,
      );
    }
    return;
  }
  write(
    `Updated framework ${result.fromVersion} → ${result.toVersion}: ${result.root}`,
  );
  write(
    result.updated.length > 0
      ? `Updated packages: ${result.updated.join(", ")}`
      : "No framework-managed packages changed.",
  );
  for (const proposal of result.proposals) {
    write(`  AVAILABLE ${proposal.package}: ${proposal.reason}`);
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
    if (!["setup", "doctor", "repair", "update", "migrate"].includes(command)) {
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

    if (command === "repair") {
      const result = await repairWorkspace({ root });
      if (flags.json) {
        stdout(JSON.stringify(result, null, 2));
      } else {
        printRepair(result, stdout);
      }
      return result.ok ? 0 : 1;
    }

    if (command === "update") {
      const result = await updateWorkspace({ root });
      if (flags.json) {
        stdout(JSON.stringify(result, null, 2));
      } else {
        printUpdate(result, stdout);
      }
      return result.ok ? 0 : 1;
    }

    if (command === "migrate") {
      const result = await migrateWorkspace({ root, apply: flags.apply });
      if (flags.json) {
        stdout(JSON.stringify(result, null, 2));
      } else if (!result.needed) {
        stdout(`Workspace is already current: ${result.root}`);
      } else {
        stdout(
          `${result.applied ? "Applied" : "Previewed"} migration ${result.fromVersion} → ${result.toVersion}: ${result.root}`,
        );
        for (const change of result.changes) {
          stdout(`  ${change.action.toUpperCase()}${change.package ? ` ${change.package}` : ""} ${change.path}`);
        }
        for (const conflict of result.conflicts) {
          stdout(`  CONFLICT ${conflict.package}${conflict.path ? ` ${conflict.path}` : ""}: ${conflict.reason}`);
        }
        if (!result.applied && result.ok) {
          stdout("Run `silver migrate --apply` after reviewing this plan.");
        }
      }
      return result.ok ? 0 : 1;
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
