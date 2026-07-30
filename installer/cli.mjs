import path from "node:path";
import { readFile } from "node:fs/promises";

import { renderBrandMark } from "./brand.mjs";
import { doctorWorkspace } from "./doctor.mjs";
import { migrateWorkspace } from "./migrate.mjs";
import { repairWorkspace } from "./repair.mjs";
import { setupWorkspace } from "./setup.mjs";
import { updateWorkspace } from "./update.mjs";
import { FRAMEWORK_VERSION } from "./version.mjs";
import { runWhatNowAfterSetup } from "./what-now.mjs";
import { applyPracticeChange, defaultPracticeRoot } from "./practice.mjs";
import { applySetupPlan, inspectSetup } from "./setup-plan.mjs";
import { renderTrace, traceArtifact, writeTraceView } from "./trace.mjs";

const usage = `The Silver Design Framework

Usage:
  silver setup inspect [directory] [--answers <answers.json>] [--json]
  silver setup apply <plan.json> [--allow-unresolved] [--json]
  silver setup [directory] [--name <name>] [--id <id>] [--json]
  silver practice apply <proposal.json> [--practice <directory>] [--json]
  silver trace <artifact-id-or-path> [directory] [--json]
  silver doctor [directory] [--json]
  silver repair [directory] [--json]
  silver update [directory] [--json]
  silver migrate [directory] [--apply] [--json]
  silver version

Commands:
  setup   Inspect and apply a reviewed workspace plan; direct setup remains a compatibility path.
  doctor  Diagnose workspace contracts and managed files without changing them.
  repair  Regenerate disposable indexes and agent discovery pointers.
  update  Update unmodified framework-managed packages; report owned-package proposals.
  migrate Preview or explicitly apply a supported workspace migration.
  version Print the local framework development version.
`;

function parseArguments(args) {
  const supportedFlags = new Set([
    "allow-unresolved",
    "answers",
    "apply",
    "help",
    "id",
    "json",
    "name",
    "practice",
  ]);
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
    if (["allow-unresolved", "apply", "json", "help"].includes(key)) {
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
  write("What Now recommends:");
  for (const recommendation of result.whatNow.analysis.recommendations) {
    write(
      `  ${recommendation.rank}. ${recommendation.title}: ${recommendation.reason}`,
    );
  }
  write("No recommendation was started automatically.");
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
    terminal = {
      isTTY: Boolean(process.stdout.isTTY),
      colorDepth:
        typeof process.stdout.getColorDepth === "function"
          ? process.stdout.getColorDepth()
          : 0,
    },
    env = process.env,
    now = () => new Date(),
  } = {},
) {
  try {
    const command = args[0];
    if (command === "setup" && ["inspect", "apply"].includes(args[1])) {
      const operation = args[1];
      const { positionals, flags } = parseArguments(args.slice(2));
      if (operation === "inspect") {
        if (positionals.length > 1) throw new Error("setup inspect accepts at most one directory.");
        const answers = flags.answers
          ? JSON.parse(
              flags.answers.trimStart().startsWith("{")
                ? flags.answers
                : await readFile(path.resolve(flags.answers), "utf8"),
            )
          : {};
        const result = await inspectSetup({
          target: path.resolve(positionals[0] ?? process.cwd()),
          answers,
          now: now().toISOString(),
        });
        stdout(flags.json ? JSON.stringify(result, null, 2) : JSON.stringify(result, null, 2));
        return 0;
      }
      if (positionals.length !== 1) throw new Error("setup apply requires one plan JSON file.");
      const plan = JSON.parse(await readFile(path.resolve(positionals[0]), "utf8"));
      const result = await applySetupPlan({
        plan,
        allowUnresolved: Boolean(flags["allow-unresolved"]),
      });
      stdout(flags.json ? JSON.stringify(result, null, 2) : `Applied ${result.plan} at ${result.workspace.root}`);
      return 0;
    }
    if (command === "practice" && args[1] === "apply") {
      const { positionals, flags } = parseArguments(args.slice(2));
      if (positionals.length !== 1) throw new Error("practice apply requires one proposal JSON file.");
      const proposal = JSON.parse(await readFile(path.resolve(positionals[0]), "utf8"));
      const result = await applyPracticeChange({
        root: path.resolve(flags.practice ?? defaultPracticeRoot()),
        proposal,
        now: now().toISOString(),
      });
      stdout(flags.json ? JSON.stringify(result, null, 2) : `Updated My Practice to ${result.revision}.`);
      return 0;
    }
    if (command === "trace") {
      const { positionals, flags } = parseArguments(args.slice(1));
      if (positionals.length < 1 || positionals.length > 2) {
        throw new Error("trace requires an artifact id or path and accepts an optional workspace directory.");
      }
      const result = await traceArtifact({
        target: positionals[0],
        root: path.resolve(positionals[1] ?? process.cwd()),
      });
      const traceView = await writeTraceView({
        root: path.resolve(positionals[1] ?? process.cwd()),
        trace: result,
      });
      stdout(
        flags.json
          ? JSON.stringify({ ...result, trace_view: traceView }, null, 2)
          : `${renderTrace(result)}\nTrace view: ${traceView}`,
      );
      return 0;
    }
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
      if (!flags.json) {
        stdout(await renderBrandMark({ terminal, env }));
      }
      const setup = await setupWorkspace({
        root,
        name: flags.name,
        id: flags.id,
      });
      const whatNow = await runWhatNowAfterSetup({ root, now: now() });
      const result = { ...setup, whatNow };
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
