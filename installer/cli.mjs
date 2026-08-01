import path from "node:path";
import { readFile } from "node:fs/promises";

import { renderBrandMark } from "./brand.mjs";
import { doctorWorkspace } from "./doctor.mjs";
import { migrateWorkspace } from "./migrate.mjs";
import { repairWorkspace } from "./repair.mjs";
import { setupWorkspace } from "./setup.mjs";
import { updateWorkspace } from "./update.mjs";
import { FRAMEWORK_VERSION } from "./version.mjs";
import { runWhatNow } from "./what-now.mjs";
import { runCheckSuite } from "./checks.mjs";
import { invokeInstalledSkill, scaffoldInvocation } from "./invoke.mjs";
import { applyPracticeChange, defaultPracticeRoot } from "./practice.mjs";
import { applySetupPlan, inspectSetup } from "./setup-plan.mjs";
import { discoverProviders } from "../framework/runtime/providers.mjs";
import { writeHostMcpConfig } from "./host-mcp-config.mjs";
import { inspectTools } from "./tools.mjs";
import { renderTrace, traceArtifact, writeTraceView } from "./trace.mjs";

const usage = `The Silver Design Framework

Usage:
  silver setup inspect [directory] [--answers <json-or-file>] [--json]
  silver setup apply <plan.json | -> [--allow-unresolved] [--json]
  silver setup [directory] [--name <name>] [--id <id>] [--json]
  silver invoke <skill-id> <request.json> [directory] [--json]
  silver invoke --scaffold <skill-id> [directory]
  silver what-now [directory] [--record] [--json]
  silver check [directory] [--only <check-id,...>] [--json]
  silver tools [directory] [--connect <transport-id>] [--json]
  silver practice apply <proposal.json> [--practice <directory>] [--json]
  silver trace <artifact-id-or-path> [directory] [--json]
  silver doctor [directory] [--json]
  silver repair [directory] [--json]
  silver update [directory] [--json]
  silver migrate [directory] [--apply] [--json]
  silver version

Commands:
  setup    Inspect and apply a reviewed workspace plan; direct setup remains a compatibility path.
  invoke   Run an installed skill through the guarded runtime. Use --scaffold to emit a
           prefilled request to complete, then invoke it.
  what-now Rank evidence-based next actions for a workspace without starting any of them.
           Read-only; pass --record to also persist the result.
  check    Run the fast deterministic checks and write evidence to
           .silver/results/checks/. Invocations run their own required checks, so
           this is for checking the workspace on demand.
  tools    Show which transport each design activity resolves to, which source
           ordered it, and what was removed from the running with the reason.
           Read-only; reads the agent host's MCP configuration. Pass
           --connect <transport-id> to declare an installed MCP server in this
           project's .mcp.json. Silver never installs, launches, or authorizes
           anything, and never writes a credential.
  doctor   Diagnose workspace contracts and managed files without changing them.
  repair   Regenerate disposable indexes and agent discovery pointers.
  update   Update unmodified framework-managed packages; report owned-package proposals.
  migrate  Preview or explicitly apply a supported workspace migration.
  version  Print the local framework development version.

Installing into a product:

  1. Inspect. This is read-only; show the recommendation and the unresolved
     questions to the person installing Silver.

     silver setup inspect . --json

  2. Apply, once they have answered. Piping keeps the plan out of the inspected
     directory:

     silver setup inspect . --answers '{"team_shape":"solo","topology":"integrated"}' --json \\
       | silver setup apply -

  --answers takes inline JSON or a file path. If you write the plan to a file
  instead of piping, keep it outside the directory being inspected; a plan
  written inside it changes that directory and invalidates itself.

  Answer keys:
    team_shape                  Required to apply. "solo" | "shared" | "split".
    topology                    Required to apply. "integrated" | "separate".
                                Confirms or overrides the recommendation, so a
                                human answers it rather than the agent guessing.
    name, id                    Workspace display name and slug.
    separate_disciplines        true when design and engineering are owned apart.
    independent_design_history  true when design needs its own review history.
    codebases                   Paths to production codebases; more than one
                                recommends a separate design repository.
    design_workspace_path       Where a separate design workspace is created.
    practice_root               Overrides ~/Silver/My Practice.
    guidance, linked_sources    Pinned guidance and design-system sources.
    design_contexts, tools      Extra contexts and configured tools.
    create_github               true to record a proposed private repository;
    github_repository           its name. Silver never creates it directly.
`;

async function readStdin(stream = process.stdin) {
  if (stream.isTTY) {
    throw new Error(
      "setup apply - expects a plan on stdin. Pipe `silver setup inspect ... --json` into it.",
    );
  }
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(
    "utf8",
  );
  if (text.trim() === "") throw new Error("setup apply - received an empty plan on stdin.");
  return text;
}

function parseArguments(args) {
  const supportedFlags = new Set([
    "allow-unresolved",
    "answers",
    "apply",
    "connect",
    "help",
    "id",
    "json",
    "name",
    "only",
    "practice",
    "record",
    "scaffold",
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
    if (
      ["allow-unresolved", "apply", "json", "help", "record", "scaffold"].includes(
        key,
      )
    ) {
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

function printSetupSteps(result, write) {
  for (const step of result.setupSteps ?? []) {
    write("");
    write(`${step.required ? "Required" : "Optional"}: ${step.summary}`);
    write(`  ${step.reason}`);
    for (const command of step.commands) write(`    ${command}`);
  }
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
  printSetupSteps(result, write);
  write("");
  printWhatNow(result.whatNow.analysis, write, result.whatNow.recorded);
}

function printInvoke(result, write) {
  write(
    `${result.skill.id} ${result.execution.status}: ${result.execution.summary}`,
  );
  for (const output of result.outputs) {
    write(`  WROTE ${output.path} (${output.kind}@${output.revision})`);
  }
  for (const finding of result.effect_findings) {
    write(`  FINDING ${finding}`);
  }
  for (const check of result.checks ?? []) {
    write(
      `  CHECK ${check.id}: ${check.status}${check.reason ? ` — ${check.reason}` : ""}`,
    );
  }
  for (const readiness of result.readiness) {
    write(`  READINESS ${readiness.name}: ${readiness.status}`);
    for (const reason of readiness.reasons) {
      write(`    ${reason}`);
    }
  }
  write(`Acceptance: ${result.acceptance.status}`);
  if (result.resume_request) {
    write(`  RESUME ${result.resume_request.reason}`);
    write(
      `    silver invoke ${result.skill.id} ${result.resume_request.path} .`,
    );
  }
  for (const pending of result.pending_outputs ?? []) {
    write(`  COULD ALSO PRODUCE ${pending.kind} (${pending.path_pattern})`);
  }
  for (const recommendation of result.recommended_next_actions) {
    write(`  NEXT ${recommendation.action}: ${recommendation.reason}`);
  }
  // One skill per invocation. Nothing downstream begins on its own.
  write("Nothing else was started. Choose the next step.");
}

function printWhatNow(analysis, write, recorded = false) {
  write("What Now recommends:");
  for (const recommendation of analysis.recommendations) {
    write(
      `  ${recommendation.rank}. ${recommendation.title}: ${recommendation.reason}`,
    );
  }
  write("No recommendation was started automatically.");
  write(
    recorded
      ? "Recorded this orientation under .silver/results/skills/."
      : "Nothing was written; this was a read-only look at the workspace.",
  );
}

function printCheck(suite, write) {
  write(`Fast checks: ${suite.status}`);
  for (const result of suite.results) {
    const findings = result.findings.length;
    write(
      `  ${result.checker}: ${result.status}${findings > 0 ? ` (${findings} finding(s))` : ""}`,
    );
    for (const finding of result.findings.slice(0, 5)) {
      write(`    ${finding.rule}${finding.file ? ` ${finding.file}` : ""}: ${finding.message}`);
    }
    if (findings > 5) write(`    ... and ${findings - 5} more`);
  }
  write("Evidence written to .silver/results/checks/.");
}

const REMOVAL_LABEL = {
  unavailable: "not available",
  vetoed: "forbidden",
  unsupported: "cannot do this",
  unknown: "not installed",
};

function printTools(report, write) {
  write(`Design tools for ${report.root}`);
  write("");
  for (const activity of report.activities) {
    const chosen = activity.selected
      ? `${activity.selected} (ordered by ${activity.ordered_by})`
      : activity.decision === "ask"
        ? `waiting on you — choose from ${activity.options.join(", ")}`
        : activity.decision === "stop"
          ? activity.would_select
            ? `stopped — ${activity.would_select} is available but is not your first choice`
            : "stopped"
          : "nothing available";
    write(`  ${activity.title}`);
    write(`    uses: ${chosen}`);
    if (activity.reason) write(`    why: ${activity.reason}`);
    if (activity.decision === "fallback") {
      write(`    note: this is not your first choice; ${activity.chain[0]} was unavailable`);
    }
    for (const removal of activity.removed) {
      // Who set it and who can lift it. A removal without both reads as a
      // broken tool, which is the one thing it must never be mistaken for.
      const by = removal.source ? ` by ${removal.source}` : "";
      const step = removal.failing_step ? ` at step "${removal.failing_step}"` : "";
      const fix = removal.fixable_by ? ` — ${removal.fixable_by} can fix this` : "";
      write(
        `    removed: ${removal.transport} — ${REMOVAL_LABEL[removal.reason]}${by}${step}${fix}`,
      );
      if (removal.detail) write(`      ${removal.detail}`);
    }
    if (!activity.selected && activity.candidates?.length) {
      write(`    could work if set up: ${activity.candidates.join(", ")}`);
    }
  }
  if (report.unmapped.length > 0) {
    write("");
    write("Configured in your agent host, but Silver does not know what they do:");
    for (const server of report.unmapped) {
      write(`  ${server.name} (${server.host}, ${server.scope})`);
    }
    write("  Tell Silver what one of these is good for and it will use it.");
  }
  write("");
  write(`Read outside this project: ${report.external_paths.join(", ")}`);
}

function printConnect(result, write) {
  if (result.manual_only) {
    write(`Silver cannot declare ${result.manual_only.transport} for you.`);
    write(`  ${result.manual_only.reason}`);
    if (result.manual_only.server) {
      write(`  Add it to ${result.path} as "${result.manual_only.server}" yourself.`);
    }
    for (const step of result.manual_only.manual_steps) {
      write(`    ${step.title} (${step.kind})`);
      if (step.url) write(`      ${step.url}`);
      for (const command of step.commands ?? []) write(`      ${command}`);
    }
    return;
  }
  if (!result.written) {
    write(
      result.already_present.length > 0
        ? `Already declared in ${result.path}: ${result.already_present.join(", ")}`
        : "Nothing to declare.",
    );
    return;
  }
  for (const addition of result.additions) {
    write(`Declared ${addition.server} in ${result.path} for ${addition.transport}.`);
    if (addition.requires_env) {
      write(`  Needs these in your environment: ${addition.requires_env.join(", ")}`);
      write("  Silver does not read or store their values.");
    }
    if (addition.manual_steps.length > 0) {
      write("  Still yours to do:");
      for (const step of addition.manual_steps) {
        write(`    ${step.title} (${step.kind})`);
        if (step.url) write(`      ${step.url}`);
        for (const command of step.commands ?? []) write(`      ${command}`);
      }
    }
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
      if (positionals.length !== 1) {
        throw new Error(
          "setup apply requires one plan JSON file, or - to read the plan from stdin.",
        );
      }
      // Reading from stdin keeps the plan out of the inspected target. A plan
      // file written inside the target changes its state integrity and
      // invalidates itself, which an agent cannot escape by retrying.
      const plan = JSON.parse(
        positionals[0] === "-"
          ? await readStdin()
          : await readFile(path.resolve(positionals[0]), "utf8"),
      );
      const result = await applySetupPlan({
        plan,
        allowUnresolved: Boolean(flags["allow-unresolved"]),
      });
      stdout(flags.json ? JSON.stringify(result, null, 2) : `Applied ${result.plan} at ${result.workspace.root}`);
      return 0;
    }
    if (command === "invoke") {
      const { positionals, flags } = parseArguments(args.slice(1));
      if (flags.scaffold) {
        if (positionals.length < 1 || positionals.length > 2) {
          throw new Error(
            "invoke --scaffold requires a skill id and accepts an optional workspace directory.",
          );
        }
        const scaffold = await scaffoldInvocation({
          root: path.resolve(positionals[1] ?? process.cwd()),
          skillId: positionals[0],
          now: now(),
        });
        stdout(JSON.stringify(scaffold, null, 2));
        return 0;
      }
      if (positionals.length < 2 || positionals.length > 3) {
        throw new Error(
          "invoke requires a skill id and a request JSON file, and accepts an optional workspace directory.",
        );
      }
      const request = JSON.parse(
        await readFile(path.resolve(positionals[1]), "utf8"),
      );
      const result = await invokeInstalledSkill({
        root: path.resolve(positionals[2] ?? process.cwd()),
        skillId: positionals[0],
        request,
      });
      if (flags.json) {
        stdout(JSON.stringify(result, null, 2));
      } else {
        printInvoke(result, stdout);
      }
      return [
        "complete",
        "complete-awaiting-verification",
        "complete-with-findings",
      ].includes(result.execution.status)
        ? 0
        : 1;
    }
    if (command === "what-now") {
      const { positionals, flags } = parseArguments(args.slice(1));
      if (positionals.length > 1) {
        throw new Error("what-now accepts at most one directory.");
      }
      const { analysis, result, recorded } = await runWhatNow({
        root: path.resolve(positionals[0] ?? process.cwd()),
        now: now(),
        record: Boolean(flags.record),
      });
      if (flags.json) {
        stdout(JSON.stringify({ analysis, result, recorded }, null, 2));
      } else {
        printWhatNow(analysis, stdout, recorded);
      }
      return 0;
    }
    if (command === "check") {
      const { positionals, flags } = parseArguments(args.slice(1));
      if (positionals.length > 1) {
        throw new Error("check accepts at most one directory.");
      }
      const only = flags.only
        ? String(flags.only)
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : undefined;
      const suite = await runCheckSuite({
        root: path.resolve(positionals[0] ?? process.cwd()),
        ...(only ? { only } : {}),
      });
      if (flags.json) {
        stdout(JSON.stringify(suite, null, 2));
      } else {
        printCheck(suite, stdout);
      }
      return suite.status === "fail" ? 1 : 0;
    }
    if (command === "tools") {
      const { positionals, flags } = parseArguments(args.slice(1));
      if (positionals.length > 1) throw new Error("tools accepts at most one directory.");
      const toolsRoot = path.resolve(positionals[0] ?? process.cwd());
      if (flags.connect) {
        const providers = await discoverProviders({ root: toolsRoot });
        const result = await writeHostMcpConfig({
          root: toolsRoot,
          providers,
          transport: String(flags.connect),
        });
        if (flags.json) {
          stdout(JSON.stringify(result, null, 2));
        } else {
          printConnect(result, stdout);
        }
        return 0;
      }
      const report = await inspectTools({
        root: toolsRoot,
        interactive: Boolean(process.stdout.isTTY),
      });
      if (flags.json) {
        stdout(JSON.stringify(report, null, 2));
      } else {
        printTools(report, stdout);
      }
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
      // Setup records its one orientation so a new workspace starts with a
      // provenance entry. Interactive `what-now` stays read-only.
      const whatNow = await runWhatNow({
        root,
        now: now(),
        invocationPrefix: "what-now-after-setup",
        record: true,
      });
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
