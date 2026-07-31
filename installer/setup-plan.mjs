import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { parse, stringify } from "yaml";

import { assertV2 } from "../framework/runtime/contracts.mjs";
import { createCheckpoint } from "./checkpoint.mjs";
import { writeGuidanceRegistry } from "./guidance.mjs";
import { exists, treeIntegrity, writeUtf8 } from "./lib/files.mjs";
import { defaultPracticeRoot, initializePractice } from "./practice.mjs";
import { writeSourceRegistry } from "./sources.mjs";
import { setupWorkspace, slugify } from "./setup.mjs";
import { FRAMEWORK_VERSION } from "./version.mjs";

const run = promisify(execFile);

async function stateIntegrity(root) {
  const resolved = path.resolve(root);
  if (!(await exists(resolved))) {
    return `sha256:${createHash("sha256").update("missing").digest("hex")}`;
  }
  const hash = createHash("sha256");
  if (await exists(path.join(resolved, ".git"))) {
    const head = await run(
      "git",
      ["-C", resolved, "rev-parse", "HEAD"],
      { encoding: "utf8" },
    ).then(({ stdout }) => stdout.trim()).catch(() => "unborn");
    const status = await run(
      "git",
      ["-C", resolved, "status", "--porcelain", "--untracked-files=all"],
      { encoding: "utf8" },
    ).then(({ stdout }) => stdout).catch(() => "unavailable");
    hash.update(head);
    hash.update("\0");
    hash.update(status);
  } else {
    hash.update(await treeIntegrity(resolved));
  }
  return `sha256:${hash.digest("hex")}`;
}

function valueIntegrity(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")}`;
}

async function gitBranch(root) {
  return run(
    "git",
    ["-C", root, "branch", "--show-current"],
    { encoding: "utf8" },
  ).then(({ stdout }) => stdout.trim() || null).catch(() => null);
}

function topologyRecommendation(answers) {
  const reasons = [];
  if ((answers.codebases?.length ?? 0) > 1) reasons.push("The product has multiple production codebases.");
  if (answers.separate_disciplines) reasons.push("Design and engineering have separate ownership.");
  if (answers.independent_design_history) reasons.push("Design work needs an independent review and version history.");
  const recommended = reasons.length > 0 ? "separate" : "integrated";
  if (reasons.length === 0) {
    reasons.push("One team and one codebase can share a simpler repository lifecycle.");
  }
  return { recommended, reasons };
}

export async function inspectSetup({
  target,
  answers = {},
  now = new Date().toISOString(),
}) {
  const productRoot = path.resolve(target ?? process.cwd());
  const name = answers.name?.trim() || path.basename(productRoot) || "Untitled Product";
  const id = answers.id?.trim() || slugify(name) || "untitled-product";
  const recommendation = topologyRecommendation(answers);
  const selected = answers.topology ?? recommendation.recommended;
  const workspaceRoot =
    selected === "separate"
      ? path.resolve(
          answers.design_workspace_path ??
            path.join(path.dirname(productRoot), `${id}-design`),
        )
      : productRoot;
  const practiceRoot = path.resolve(answers.practice_root ?? defaultPracticeRoot());
  const targetExists = await exists(productRoot);
  const topLevelEntries = targetExists ? (await readdir(productRoot)).sort() : [];
  const practiceAction = (await exists(path.join(practiceRoot, ".silver", "practice.yaml")))
    ? "connect"
    : "create";
  // Every unresolved question carries what it means, what each answer does,
  // which paths it touches, and whether it can be changed later.
  //
  // These used to be one-line prompts naming framework terms — "solo | shared |
  // split", "integrated | separate" — with the explanations only in `--help` and
  // the README. Whoever was installing Silver had to ask what the words meant
  // before they could answer, and `integrated` never said out loud that it would
  // reach outside the project folder. The structured form travels with the plan,
  // so any agent or UI presenting the question has what it needs.
  const questions = [];
  if (!answers.team_shape) {
    questions.push({
      id: "team_shape",
      question: "Who works on design in this product?",
      explanation:
        "Records how design work is staffed so later guidance can match it. It does not change which files are created.",
      options: [
        {
          value: "solo",
          summary: "One person does the design work.",
          effect: "No shared-review expectations are assumed.",
        },
        {
          value: "shared",
          summary: "Several people share design work in one repository.",
          effect: "Review and handoff guidance assumes more than one author.",
        },
        {
          value: "split",
          summary: "Design and engineering are owned by different people.",
          effect:
            "Handoff guidance assumes a boundary between design and implementation.",
        },
      ],
      recommended: null,
      reversible: true,
      how_to_change: "Edit design/manifest.yaml and run `silver repair`.",
      external_paths: [],
    });
  }
  if (!answers.topology) {
    questions.push({
      id: "topology",
      question: "Where should the design workspace live?",
      explanation:
        "Decides whether Silver installs into this repository or into a separate one beside it.",
      options: [
        {
          value: "integrated",
          summary: "Install Silver into this repository.",
          effect: `Creates design/, .skills/, .silver/, and AGENTS.md inside ${productRoot}. Design work is versioned with the product.`,
        },
        {
          value: "separate",
          summary: "Create a separate design repository beside this one.",
          effect: `Creates a new workspace at ${workspaceRoot} and initializes Git there. The product repository is not modified.`,
        },
      ],
      recommended: recommendation.recommended,
      recommendation_reasons: recommendation.reasons,
      reversible: false,
      how_to_change:
        "Changing topology after apply means moving the workspace by hand; decide before applying.",
      // Neither choice is what reaches outside the project. My Practice does,
      // and that was never stated at the decision point.
      external_paths: [],
    });
  }

  // My Practice is created or read regardless of topology, and it lives outside
  // the project. That is consequential enough to state plainly rather than leave
  // implied by a word like "integrated".
  const practiceNotice = {
    id: "practice_root",
    question: `Silver will ${practiceAction === "create" ? "create" : "connect to"} your personal practice at ${practiceRoot}. Continue?`,
    explanation:
      "My Practice is your own visible, local, Git-tracked workspace of methods, rubrics, and decisions, shared across every Silver workspace you use. It lives outside this project and is not committed with it. Setup pins its identity and revision in results; it never copies its contents into project files.",
    options: [
      {
        value: "default",
        summary: `Use ${practiceRoot}.`,
        effect:
          practiceAction === "create"
            ? "Creates the directory, writes PRACTICE.md, and makes an initial local Git commit there."
            : "Reads the existing practice and records its revision. Nothing there is overwritten.",
      },
      {
        value: "custom",
        summary: "Use a different location.",
        effect: "Pass practice_root in the setup answers.",
      },
    ],
    recommended: "default",
    reversible: true,
    how_to_change: "Re-run setup with a different practice_root.",
    external_paths: [practiceRoot],
    backup_note:
      "A local-only backup means the practice has local Git history but no verified remote, so it is not backed up off this machine.",
  };
  questions.push(practiceNotice);

  // Git matters before hundreds of files exist, not after. Accepted work is
  // checkpointed into local Git, so a workspace without a repository silently
  // loses that — and then every later skill repeats "not-a-repository" as if it
  // were a new problem.
  if (!topLevelEntries.includes(".git") && selected === "integrated") {
    questions.push({
      id: "initialize_git",
      question: `${productRoot} is not a Git repository. Initialize one before applying?`,
      explanation:
        "Silver checkpoints accepted design work into local Git. Without a repository, accepted invocations still write their files but record no checkpoint, and there is no rollback point.",
      options: [
        {
          value: "yes",
          summary: "Run `git init` before installing.",
          effect:
            "Creates a local repository. Silver never adds a remote and never pushes.",
        },
        {
          value: "no",
          summary: "Install without Git.",
          effect:
            "Setup proceeds. Checkpoints report `not-a-repository` until a repository exists; this is expected, not a fault.",
        },
      ],
      recommended: "yes",
      reversible: true,
      how_to_change: "Run `git init` at any time; later checkpoints will work.",
      external_paths: [],
    });
  }

  const unresolved = questions
    .filter(({ id: questionId }) => ["team_shape", "topology"].includes(questionId))
    .map(({ question }) => question);
  const plan = {
    schema: "silver/setup-plan/v1",
    id: `setup-${id}`,
    created_at: now,
    framework_version: FRAMEWORK_VERSION,
    target: productRoot,
    discovered: {
      exists: targetExists,
      git_repository: topLevelEntries.includes(".git"),
      git_branch: topLevelEntries.includes(".git")
        ? await gitBranch(productRoot)
        : null,
      silver_workspace:
        topLevelEntries.includes(".silver") &&
        await exists(path.join(productRoot, "design", "manifest.yaml")),
      top_level_entries: topLevelEntries,
    },
    workspace: { id, name, root: workspaceRoot },
    topology: {
      recommended: recommendation.recommended,
      selected,
      reasons: recommendation.reasons,
    },
    practice: { root: practiceRoot, action: practiceAction },
    guidance: answers.guidance ?? [],
    linked_sources: answers.linked_sources ?? [],
    codebases: answers.codebases ?? [productRoot],
    tools: answers.tools ?? [],
    design_contexts: answers.design_contexts ?? [],
    planned_writes: [
      `${workspaceRoot}/design/manifest.yaml`,
      `${workspaceRoot}/design/sources/sources.yaml`,
      `${workspaceRoot}/.silver/lock.yaml`,
      `${workspaceRoot}/.skills/`,
      `${practiceRoot}/PRACTICE.md`,
    ],
    git_actions: [
      ...(practiceAction === "create" ? ["init-practice", "commit-practice"] : []),
      ...(selected === "separate" ? ["init-workspace"] : []),
      "checkpoint-workspace",
    ],
    external_actions: answers.create_github
      ? [
          {
            action: "create-private-github-repository",
            automatic: false,
            repository_name:
              answers.github_repository ??
              (selected === "separate" ? `${id}-design` : id),
            visibility: "private",
            reason: "The chat agent may create this only after the reviewed local setup succeeds.",
          },
        ]
      : [],
    unresolved_questions: unresolved,
    questions,
    state_integrity: await stateIntegrity(productRoot),
  };
  await assertV2("setup-plan.schema.json", plan);
  return plan;
}

async function initGit(root) {
  if (await exists(path.join(root, ".git"))) return false;
  await run("git", ["-C", root, "init"], { encoding: "utf8" });
  return true;
}

async function repositoryBackupState(root, now = new Date().toISOString()) {
  if (!(await exists(path.join(root, ".git")))) {
    return { status: "not-a-repository" };
  }
  const remote = await run(
    "git",
    ["-C", root, "remote", "get-url", "origin"],
    { encoding: "utf8" },
  ).then(({ stdout }) => stdout.trim()).catch(() => null);
  if (!remote) return { status: "local-only" };
  const head = await run(
    "git",
    ["-C", root, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).then(({ stdout }) => stdout.trim()).catch(() => null);
  const upstream = await run(
    "git",
    ["-C", root, "rev-parse", "@{upstream}"],
    { encoding: "utf8" },
  ).then(({ stdout }) => stdout.trim()).catch(() => null);
  return head && upstream && head === upstream
    ? { status: "verified", remote, verified_at: now }
    : { status: "remote-configured", remote };
}

export async function applySetupPlan({ plan, allowUnresolved = false }) {
  await assertV2("setup-plan.schema.json", plan);
  const applicationPath = path.join(
    plan.workspace.root,
    ".silver",
    "results",
    "setup-applications",
    `${plan.id}.json`,
  );
  if (await exists(applicationPath)) {
    const existing = JSON.parse(await readFile(applicationPath, "utf8"));
    if (existing.plan_integrity !== valueIntegrity(plan)) {
      throw new Error("A different setup plan already used this plan identity.");
    }
    return {
      ...existing.result,
      repository_backup: await repositoryBackupState(
        plan.workspace.root,
        plan.created_at,
      ),
    };
  }
  if (plan.framework_version !== FRAMEWORK_VERSION) {
    throw new Error(`Setup plan targets ${plan.framework_version}; running ${FRAMEWORK_VERSION}.`);
  }
  const observed = await stateIntegrity(plan.target);
  if (observed !== plan.state_integrity) {
    throw new Error("Setup plan is stale because the inspected target changed.");
  }
  if (!allowUnresolved && plan.unresolved_questions.length > 0) {
    throw new Error("Setup plan still has unresolved questions.");
  }
  await mkdir(plan.workspace.root, { recursive: true });
  const setup = await setupWorkspace({
    root: plan.workspace.root,
    name: plan.workspace.name,
    id: plan.workspace.id,
    allowExistingCodebase: plan.topology.selected === "integrated",
  });
  const practice = await initializePractice({ root: plan.practice.root });
  if (plan.guidance.length > 0) {
    await writeGuidanceRegistry(plan.workspace.root, plan.guidance);
  }
  if (plan.linked_sources.length > 0) {
    await writeSourceRegistry(plan.workspace.root, plan.linked_sources);
  }
  const defaultContextPath = path.join(
    plan.workspace.root,
    "design",
    "contexts",
    "default.yaml",
  );
  if (plan.design_contexts.length === 0 && await exists(defaultContextPath)) {
    const context = parse(await readFile(defaultContextPath, "utf8"));
    context.codebase.repository =
      plan.topology.selected === "integrated"
        ? "."
        : plan.codebases[0] ?? plan.target;
    context.codebase.branch =
      plan.topology.selected === "integrated"
        ? plan.discovered.git_branch ?? context.codebase.branch
        : context.codebase.branch;
    context.provenance.change.reason =
      "Created by the reviewed Silver setup plan.";
    await assertV2("design-context.schema.json", context);
    await writeUtf8(defaultContextPath, stringify(context));
  }
  for (const context of plan.design_contexts) {
    await assertV2("design-context.schema.json", context);
    await writeUtf8(
      path.join(plan.workspace.root, "design", "contexts", `${context.id}.yaml`),
      stringify(context),
    );
  }
  if (plan.topology.selected === "separate") await initGit(plan.workspace.root);
  const checkpointPaths = [
    "AGENTS.md",
    "design",
    ".silver/lock.yaml",
    ".skills",
  ];
  const checkpoint = await createCheckpoint({
    root: plan.workspace.root,
    id: `setup-${plan.workspace.id}`,
    reason: "workspace-configuration",
    paths: checkpointPaths,
    now: plan.created_at,
  });
  const result = {
    schema: "silver/setup-application/v1",
    plan: plan.id,
    workspace: setup,
    practice,
    checkpoint,
    repository_backup: await repositoryBackupState(
      plan.workspace.root,
      plan.created_at,
    ),
    external_actions: plan.external_actions,
  };
  await writeUtf8(
    applicationPath,
    `${JSON.stringify(
      { plan_integrity: valueIntegrity(plan), result },
      null,
      2,
    )}\n`,
  );
  return result;
}
