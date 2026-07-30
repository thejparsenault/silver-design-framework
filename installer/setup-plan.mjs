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
  const unresolved = [];
  if (!answers.team_shape) unresolved.push("Confirm whether the team is solo, shared, or split by discipline.");
  if (!answers.topology) unresolved.push(`Confirm the recommended ${recommendation.recommended} repository topology.`);
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
