import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { parse, stringify } from "yaml";

import { createCheckpoint } from "../checkpoint.mjs";
import { exists } from "../lib/files.mjs";
import { resolveDesignContext } from "../context.mjs";
import {
  applyGuidanceRepin,
  inspectGuidanceSources,
  writeGuidanceRegistry,
} from "../guidance.mjs";
import {
  applyPracticeChange,
  initializePractice,
} from "../practice.mjs";
import { applySetupPlan, inspectSetup } from "../setup-plan.mjs";
import { setupWorkspace } from "../setup.mjs";
import {
  applySourceRepin,
  inspectLinkedSources,
  linkedSourceIntegrity,
  writeSourceRegistry,
} from "../sources.mjs";

const run = promisify(execFile);
const fixedTime = "2026-07-30T12:00:00.000Z";

async function temporaryDirectory(t, prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(root, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  }));
  return root;
}

async function git(root, args) {
  return run("git", ["-C", root, ...args], { encoding: "utf8" });
}

function provenance(reason = "Test fixture.") {
  return {
    schema: "silver/provenance/v1",
    origin: "agent-assisted",
    recorded_at: fixedTime,
    guidance: [],
    design_contexts: [],
    change: { reason },
    acceptance: "accepted",
  };
}

function selectedFileIntegrity(relative, content) {
  const hash = createHash("sha256");
  hash.update(relative);
  hash.update("\0");
  hash.update(content);
  hash.update("\0");
  return `sha256:${hash.digest("hex")}`;
}

test("setup inspection recommends topology and applies an approved plan idempotently", async (t) => {
  const root = await temporaryDirectory(t, "silver-setup-plan-");
  const practiceRoot = await temporaryDirectory(t, "silver-practice-");
  await git(root, ["init"]);
  await writeFile(path.join(root, "package.json"), "{}\n");

  const separate = await inspectSetup({
    target: root,
    answers: {
      name: "Multi Product",
      id: "multi-product",
      team_shape: "split",
      topology: "separate",
      codebases: ["/products/web", "/products/mobile"],
      practice_root: practiceRoot,
      separate_disciplines: true,
    },
    now: fixedTime,
  });
  assert.equal(separate.topology.recommended, "separate");
  assert.match(separate.topology.reasons.join(" "), /multiple|separate/i);

  const plan = await inspectSetup({
    target: root,
    answers: {
      name: "Solo Product",
      id: "solo-product",
      team_shape: "solo",
      topology: "integrated",
      codebases: [root],
      practice_root: practiceRoot,
      tools: [{ id: "figma", role: "preferred" }],
      create_github: true,
      github_repository: "solo-product-design",
    },
    now: fixedTime,
  });
  assert.equal(plan.topology.recommended, "integrated");
  assert.equal(plan.discovered.git_repository, true);
  assert.deepEqual(plan.unresolved_questions, []);
  assert.deepEqual(plan.external_actions, [
    {
      action: "create-private-github-repository",
      automatic: false,
      repository_name: "solo-product-design",
      visibility: "private",
      reason:
        "The chat agent may create this only after the reviewed local setup succeeds.",
    },
  ]);

  const first = await applySetupPlan({ plan });
  const repeated = await applySetupPlan({ plan });
  assert.deepEqual(repeated, first);
  assert.equal(first.checkpoint.status, "committed");
  assert.equal(first.repository_backup.status, "local-only");
  assert.ok(first.checkpoint.paths.every((file) => file !== "package.json"));

  await git(root, ["remote", "add", "origin", "git@example.test:solo-product.git"]);
  const withRemote = await applySetupPlan({ plan });
  assert.equal(withRemote.repository_backup.status, "remote-configured");
  assert.equal(
    withRemote.repository_backup.remote,
    "git@example.test:solo-product.git",
  );

  const context = parse(
    await readFile(
      path.join(root, "design", "contexts", "default.yaml"),
      "utf8",
    ),
  );
  assert.equal(context.codebase.repository, ".");
  assert.equal(
    context.codebase.branch,
    plan.discovered.git_branch ?? "main",
  );
  const status = (await git(root, ["status", "--porcelain"])).stdout;
  assert.match(status, /package\.json/);
  assert.doesNotMatch(status, /^A  package\.json$/m);
});

test("integrated and separate setups both honor the initialize_git answer instead of ignoring it", async (t) => {
  const practiceRoot = await temporaryDirectory(t, "silver-practice-");

  const declined = await temporaryDirectory(t, "silver-setup-no-git-");
  const declinedPlan = await inspectSetup({
    target: declined,
    answers: {
      name: "No Git Product",
      id: "no-git-product",
      team_shape: "solo",
      topology: "integrated",
      practice_root: practiceRoot,
      initialize_git: "no",
    },
    now: fixedTime,
  });
  assert.ok(!declinedPlan.git_actions.includes("init-workspace"));
  await applySetupPlan({ plan: declinedPlan });
  assert.equal(await exists(path.join(declined, ".git")), false);

  const accepted = await temporaryDirectory(t, "silver-setup-yes-git-");
  const acceptedPlan = await inspectSetup({
    target: accepted,
    answers: {
      name: "Yes Git Product",
      id: "yes-git-product",
      team_shape: "solo",
      topology: "integrated",
      practice_root: practiceRoot,
      initialize_git: "yes",
    },
    now: fixedTime,
  });
  assert.ok(acceptedPlan.git_actions.includes("init-workspace"));
  const applied = await applySetupPlan({ plan: acceptedPlan });
  assert.equal(await exists(path.join(accepted, ".git")), true);
  assert.equal(applied.checkpoint.status, "committed");

  // The recommended default ("yes") applies when the question goes unanswered.
  const defaulted = await temporaryDirectory(t, "silver-setup-default-git-");
  const defaultedPlan = await inspectSetup({
    target: defaulted,
    answers: {
      name: "Default Git Product",
      id: "default-git-product",
      team_shape: "solo",
      topology: "integrated",
      practice_root: practiceRoot,
    },
    now: fixedTime,
  });
  assert.ok(defaultedPlan.git_actions.includes("init-workspace"));
  await applySetupPlan({ plan: defaultedPlan });
  assert.equal(await exists(path.join(defaulted, ".git")), true);

  // A separate topology asks (and defaults) the same way as an integrated one.
  const separateProduct = await temporaryDirectory(t, "silver-setup-separate-product-");
  const separateWorkspace = await temporaryDirectory(t, "silver-setup-separate-design-");
  const separateDeclinedPlan = await inspectSetup({
    target: separateProduct,
    answers: {
      name: "Separate No Git",
      id: "separate-no-git",
      team_shape: "split",
      topology: "separate",
      design_workspace_path: separateWorkspace,
      practice_root: practiceRoot,
      separate_disciplines: true,
      initialize_git: "no",
    },
    now: fixedTime,
  });
  assert.ok(!separateDeclinedPlan.git_actions.includes("init-workspace"));
  await applySetupPlan({ plan: separateDeclinedPlan });
  assert.equal(await exists(path.join(separateWorkspace, ".git")), false);
});

test("My Practice changes are sanitized, revisioned, and isolated in local Git", async (t) => {
  const root = await temporaryDirectory(t, "silver-my-practice-");
  const initialized = await initializePractice({
    root,
    now: fixedTime,
    name: "My Practice",
  });
  assert.equal(initialized.manifest.revision, "r1");
  assert.equal(initialized.manifest.backup.status, "local-only");

  const proposal = {
    schema: "silver/practice-change/v1",
    id: "clarify-assumptions",
    kind: "practice-change",
    revision: "r1",
    expected_practice_revision: "r1",
    summary: "Make assumptions explicit",
    reason: "Accepted work improved when assumptions were visible.",
    updates: [
      {
        section: "quality",
        content: "Label assumptions before treating them as evidence.",
      },
    ],
    sanitization: {
      reviewed: true,
      removed: ["Product and participant names"],
    },
    provenance: provenance("Derived from an accepted result."),
  };
  const applied = await applyPracticeChange({
    root,
    proposal,
    now: "2026-07-30T13:00:00.000Z",
  });
  assert.equal(applied.revision, "r2");
  assert.match(
    await readFile(path.join(root, "PRACTICE.md"), "utf8"),
    /Label assumptions/,
  );
  const log = (await git(root, ["log", "--format=%s"])).stdout;
  assert.match(log, /Initialize My Practice/);
  assert.match(log, /Update My Practice/);
  await git(root, [
    "remote",
    "add",
    "origin",
    "git@example.test:my-practice.git",
  ]);
  const connected = await initializePractice({ root, now: fixedTime });
  assert.equal(connected.backup.status, "remote-configured");
  await assert.rejects(
    applyPracticeChange({ root, proposal }),
    /Stale practice proposal/,
  );
});

test("local guidance snapshots only reviewed paths and produces reviewable drift proposals", async (t) => {
  const workspace = await temporaryDirectory(t, "silver-guidance-workspace-");
  const sourceRoot = await temporaryDirectory(t, "silver-guidance-source-");
  await setupWorkspace({
    root: workspace,
    name: "Guidance Product",
    id: "guidance-product",
    date: "2026-07-30",
  });
  const initial = "Use the reviewed content standard.\n";
  await writeFile(path.join(sourceRoot, "rules.md"), initial);
  await writeFile(path.join(sourceRoot, "private.md"), "Do not snapshot this.\n");
  const source = {
    schema: "silver/guidance-source/v1",
    id: "content-standard",
    title: "Content standard",
    source: {
      type: "local-snapshot",
      reference: sourceRoot,
      revision: "snapshot-r1",
      integrity: selectedFileIntegrity("rules.md", initial),
      paths: ["rules.md"],
    },
    influence: "required",
    scope: { products: ["guidance-product"] },
    linked_at: fixedTime,
    linked_by: "project-owner",
  };
  await writeGuidanceRegistry(workspace, [source]);
  assert.equal((await inspectGuidanceSources(workspace))[0].state, "current");
  await mkdir(path.join(workspace, "design", "work"), { recursive: true });
  await writeFile(
    path.join(workspace, "design", "work", "guidance-dependent.json"),
    `${JSON.stringify(
      {
        id: "guidance-dependent",
        provenance: {
          ...provenance("Used the required content standard."),
          guidance: [
            {
              id: source.id,
              revision: source.source.revision,
              integrity: source.source.integrity,
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );

  const changed = "Use the revised content standard.\n";
  await writeFile(path.join(sourceRoot, "rules.md"), changed);
  const drift = (await inspectGuidanceSources(workspace))[0];
  assert.equal(drift.state, "external-changed");
  assert.equal(drift.repin_proposal.source.integrity, selectedFileIntegrity("rules.md", changed));
  assert.deepEqual(
    drift.stale_dependents.map(({ path: dependentPath }) => dependentPath),
    ["design/work/guidance-dependent.json"],
  );

  const applied = await applyGuidanceRepin({
    root: workspace,
    proposal: drift.repin_proposal,
    now: "2026-07-30T14:00:00.000Z",
  });
  assert.equal(applied.checkpoint.status, "not-a-repository");
  assert.deepEqual(
    applied.stale_dependents.map(({ path: dependentPath }) => dependentPath),
    ["design/work/guidance-dependent.json"],
  );
  assert.equal((await inspectGuidanceSources(workspace))[0].state, "current");
  const snapshots = await readFile(
    path.join(
      workspace,
      "design",
      "guidance",
      "sources.yaml",
    ),
    "utf8",
  );
  assert.doesNotMatch(snapshots, /private\.md/);
});

test("Git guidance pins a commit and reports a reviewable re-pin after upstream changes", async (t) => {
  const workspace = await temporaryDirectory(t, "silver-git-guidance-workspace-");
  const sourceRoot = await temporaryDirectory(t, "silver-git-guidance-source-");
  await setupWorkspace({
    root: workspace,
    name: "Git Guidance Product",
    id: "git-guidance-product",
    date: "2026-07-30",
  });
  await git(sourceRoot, ["init"]);
  await writeFile(path.join(sourceRoot, "rules.md"), "Review the evidence.\n");
  await git(sourceRoot, ["add", "rules.md"]);
  await git(sourceRoot, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.com",
    "commit",
    "-m",
    "Guidance r1",
  ]);
  const revision = (await git(sourceRoot, ["rev-parse", "HEAD"])).stdout.trim();
  const source = {
    schema: "silver/guidance-source/v1",
    id: "research-guidance",
    title: "Research guidance",
    source: {
      type: "git",
      reference: sourceRoot,
      revision,
      integrity: selectedFileIntegrity("rules.md", "Review the evidence.\n"),
      paths: ["rules.md"],
    },
    influence: "preferred",
    scope: { products: ["git-guidance-product"] },
    linked_at: fixedTime,
    linked_by: "project-owner",
  };
  await writeGuidanceRegistry(workspace, [source]);
  assert.equal((await inspectGuidanceSources(workspace))[0].state, "current");

  await writeFile(path.join(sourceRoot, "rules.md"), "Review and label the evidence.\n");
  await git(sourceRoot, ["add", "rules.md"]);
  await git(sourceRoot, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.com",
    "commit",
    "-m",
    "Guidance r2",
  ]);
  const changed = (await inspectGuidanceSources(workspace))[0];
  assert.equal(changed.state, "external-changed");
  assert.notEqual(changed.repin_proposal.source.revision, revision);
});

test("design-system, component, and codebase sources declare authority, exact pins, and read-only drift", async (t) => {
  const workspace = await temporaryDirectory(t, "silver-linked-source-workspace-");
  const systemRoot = await temporaryDirectory(t, "silver-linked-system-");
  const codeRoot = await temporaryDirectory(t, "silver-linked-codebase-");
  await setupWorkspace({
    root: workspace,
    name: "Linked Sources Product",
    id: "linked-sources-product",
    date: "2026-07-30",
  });
  await writeFile(path.join(systemRoot, "tokens.json"), "{\"color\":\"silver\"}\n");
  await git(codeRoot, ["init"]);
  await writeFile(path.join(codeRoot, "components.json"), "{\"button\":\"r1\"}\n");
  await git(codeRoot, ["add", "components.json"]);
  await git(codeRoot, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.com",
    "commit",
    "-m",
    "Catalog r1",
  ]);
  const codeRevision = (await git(codeRoot, ["rev-parse", "HEAD"])).stdout.trim();
  const sources = [
    {
      schema: "silver/linked-source/v1",
      id: "brand-system",
      title: "Brand system",
      kind: "design-system",
      source: {
        type: "local",
        reference: systemRoot,
        revision: "snapshot-r1",
        integrity: await linkedSourceIntegrity(systemRoot, ["tokens.json"]),
        paths: ["tokens.json"],
      },
      authority: "external-authoritative",
      scope: { products: ["linked-sources-product"], surfaces: ["web"] },
      linked_at: fixedTime,
      linked_by: "project-owner",
    },
    {
      schema: "silver/linked-source/v1",
      id: "shared-components",
      title: "Shared components",
      kind: "component-catalog",
      source: {
        type: "git",
        reference: codeRoot,
        revision: codeRevision,
        integrity: await linkedSourceIntegrity(codeRoot, ["components.json"]),
        paths: ["components.json"],
      },
      authority: "shared-review",
      scope: { contexts: ["default-design-context"] },
      linked_at: fixedTime,
      linked_by: "project-owner",
    },
    {
      schema: "silver/linked-source/v1",
      id: "product-codebase",
      title: "Product codebase",
      kind: "codebase",
      source: {
        type: "git",
        reference: codeRoot,
        revision: codeRevision,
        integrity: await linkedSourceIntegrity(codeRoot, ["components.json"]),
        paths: ["components.json"],
      },
      authority: "workspace-authoritative",
      scope: { products: ["linked-sources-product"] },
      linked_at: fixedTime,
      linked_by: "project-owner",
    },
  ];
  await writeSourceRegistry(workspace, sources);
  assert.ok((await inspectLinkedSources(workspace)).every(({ state }) => state === "current"));
  await mkdir(path.join(workspace, "design", "work"), { recursive: true });
  await writeFile(
    path.join(workspace, "design", "work", "source-dependent.json"),
    `${JSON.stringify(
      {
        id: "source-dependent",
        provenance: {
          ...provenance("Used the linked brand system."),
          linked_sources: [
            {
              id: sources[0].id,
              revision: sources[0].source.revision,
              integrity: sources[0].source.integrity,
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );

  await writeFile(path.join(systemRoot, "tokens.json"), "{\"color\":\"platinum\"}\n");
  const drift = (await inspectLinkedSources(workspace)).find(
    ({ id }) => id === "brand-system",
  );
  assert.equal(drift.state, "external-changed");
  assert.equal(drift.repin_proposal.authority, "external-authoritative");
  assert.deepEqual(
    drift.stale_dependents.map(({ path: dependentPath }) => dependentPath),
    ["design/work/source-dependent.json"],
  );
  assert.equal(
    await readFile(path.join(systemRoot, "tokens.json"), "utf8"),
    "{\"color\":\"platinum\"}\n",
  );
  const applied = await applySourceRepin({
    root: workspace,
    proposal: drift.repin_proposal,
    now: "2026-07-30T15:00:00.000Z",
  });
  assert.equal(applied.checkpoint.status, "not-a-repository");
  assert.deepEqual(
    applied.stale_dependents.map(({ path: dependentPath }) => dependentPath),
    ["design/work/source-dependent.json"],
  );
  assert.equal(
    (await inspectLinkedSources(workspace)).find(({ id }) => id === "brand-system").state,
    "current",
  );
});

test("design contexts resolve defaults, explicit overrides, ambiguity, and expression compatibility", async (t) => {
  const root = await temporaryDirectory(t, "silver-context-");
  await setupWorkspace({
    root,
    name: "Context Product",
    id: "context-product",
    date: "2026-07-30",
  });
  const defaultPath = path.join(root, "design", "contexts", "default.yaml");
  const defaultContext = parse(await readFile(defaultPath, "utf8"));
  defaultContext.default = false;
  await writeFile(defaultPath, stringify(defaultContext));

  const expression = parse(
    await readFile(
      path.join(root, "design", "contexts", "default-expression.yaml"),
      "utf8",
    ),
  );
  expression.id = "consumer-expression";
  expression.design_system = {
    ...expression.design_system,
    id: "consumer-system",
  };
  await writeFile(
    path.join(root, "design", "contexts", "consumer-expression.yaml"),
    stringify(expression),
  );
  const consumer = {
    ...defaultContext,
    id: "consumer-context",
    title: "Consumer brand",
    default: false,
    design_system: {
      ...defaultContext.design_system,
      id: "consumer-system",
    },
    component_expression: {
      ...defaultContext.component_expression,
      id: "consumer-expression",
      path: "design/contexts/consumer-expression.yaml",
    },
    provenance: provenance("Added a second expression of the shared catalog."),
  };
  await writeFile(
    path.join(root, "design", "contexts", "consumer.yaml"),
    stringify(consumer),
  );

  const ambiguous = await resolveDesignContext({
    root,
    product: "context-product",
    surface: "web",
  });
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.candidates.length, 2);
  const explicit = await resolveDesignContext({
    root,
    contextId: "consumer-context",
  });
  assert.equal(explicit.status, "resolved");
  assert.equal(explicit.mapping.component_catalog.id, "component-catalog");

  await mkdir(path.join(root, "design", "work"), { recursive: true });
  await writeFile(
    path.join(root, "design", "work", "context-dependent.json"),
    `${JSON.stringify(
      {
        id: "context-dependent",
        provenance: {
          ...provenance("Used the consumer context."),
          design_contexts: [
            {
              id: "consumer-context",
              kind: "design-context",
              revision: "r1",
              path: "design/contexts/consumer.yaml",
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );
  consumer.revision = "r2";
  await writeFile(
    path.join(root, "design", "contexts", "consumer.yaml"),
    stringify(consumer),
  );
  const revised = await resolveDesignContext({
    root,
    contextId: "consumer-context",
  });
  assert.deepEqual(
    revised.stale_dependents.map(({ path: dependentPath }) => dependentPath),
    ["design/work/context-dependent.json"],
  );

  expression.design_system.id = "wrong-system";
  await writeFile(
    path.join(root, "design", "contexts", "consumer-expression.yaml"),
    stringify(expression),
  );
  await assert.rejects(
    resolveDesignContext({ root, contextId: "consumer-context" }),
    /incompatible component expression/,
  );
});

test("checkpoints commit only selected changes and pause on overlapping staged work", async (t) => {
  const root = await temporaryDirectory(t, "silver-checkpoint-");
  await git(root, ["init"]);
  await writeFile(path.join(root, "accepted.md"), "r1\n");
  await writeFile(path.join(root, "unrelated.md"), "r1\n");
  await git(root, ["add", "accepted.md", "unrelated.md"]);
  await git(root, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.com",
    "commit",
    "-m",
    "Fixture",
  ]);
  await git(root, ["config", "commit.gpgSign", "true"]);
  await writeFile(path.join(root, "accepted.md"), "r2\n");
  await writeFile(path.join(root, "unrelated.md"), "unrelated edit\n");
  const committed = await createCheckpoint({
    root,
    id: "accepted-r2",
    reason: "accepted-artifact",
    paths: ["accepted.md"],
    now: fixedTime,
  });
  assert.equal(committed.status, "committed");
  assert.deepEqual(committed.paths, ["accepted.md"]);
  assert.match((await git(root, ["status", "--porcelain"])).stdout, /unrelated\.md/);

  await writeFile(path.join(root, "accepted.md"), "r3\n");
  await git(root, ["add", "accepted.md"]);
  const blocked = await createCheckpoint({
    root,
    id: "accepted-r3",
    reason: "accepted-artifact",
    paths: ["accepted.md"],
    now: fixedTime,
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.commit, null);
});
