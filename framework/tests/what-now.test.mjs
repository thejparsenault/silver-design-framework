import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import { invokeSkill } from "../runtime/invoke-skill.mjs";
import { inspectWorkspace } from "../skills/what-now/scripts/analyze-workspace.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const now = new Date("2026-07-28T18:00:00Z");

async function write(root, relativePath, content) {
  const absolute = path.join(root, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

async function workspace({
  brandUpdated = "2026-07-27",
  productUpdated = "2026-07-26",
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-what-now-"));
  const artifacts = [
    ["brand", "brand", "design/brand.md", brandUpdated],
    ["product", "product", "design/product.md", productUpdated],
    ["voice", "voice", "design/voice.md", "2026-07-25"],
    [
      "design-principles",
      "design-principles",
      "design/design-principles.md",
      "2026-07-24",
    ],
    [
      "design-system",
      "design-system",
      "design/system/README.md",
      "2026-07-23",
    ],
  ];
  await write(
    root,
    "design/manifest.yaml",
    stringify({
      schema: "silver/manifest/v1",
      workspace: {
        id: "what-now-fixture",
        name: "What Now Fixture",
        scope: "product-workspace",
        description: "Fixture",
      },
      artifacts: artifacts.map(([id, kind, artifactPath]) => ({
        id,
        kind,
        path: artifactPath,
        scope: "product",
        role: "canonical",
        status: "draft",
        authority: { type: "local" },
      })),
      implementation_profiles: {},
      flow_policy: {
        roots: ["design/flows"],
        default_view: "mermaid",
        require_revision_links: true,
      },
      prototype_policy: {
        roots: ["prototypes"],
        default_profile: "constrained",
        allowed_profiles: ["constrained"],
        explicit_override_required: true,
        baseline_checks: [],
      },
      checks: {
        policy_profile: "prototype",
        enabled: [],
        suites: {},
        render_targets: [],
      },
      permission_policy: "design/permissions.yaml",
    }),
  );
  for (const [, , artifactPath, updated] of artifacts) {
    await write(root, artifactPath, `---\nupdated: ${updated}\n---\nFixture\n`);
  }
  await write(
    root,
    ".silver/lock.yaml",
    stringify({
      schema: "silver/lock/v2",
      framework: {
        version: "0.4.0",
        source: { type: "local", reference: "fixture" },
      },
      packages: [],
      managed_files: [],
    }),
  );
  return root;
}

async function snapshot(root) {
  const observed = {};
  async function visit(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) {
        await visit(path.join(directory, entry.name), relative);
      } else if (entry.isFile()) {
        observed[relative] = await readFile(path.join(directory, entry.name), "utf8");
      } else {
        observed[relative] = "non-file";
      }
    }
  }
  await visit(root);
  return observed;
}

function policy() {
  return {
    schema: "silver/permission-policy/v2",
    id: "what-now-test-policy",
    layer: "invocation-constraint",
    rules: [
      {
        capability: "repository",
        actions: ["read", "inspect"],
        paths: ["design/**", ".silver/**"],
        decision: "allow",
      },
    ],
  };
}

function invocation(recommendedNextActions) {
  return {
    schema: "silver/skill-invocation/v2",
    invocation_id: "what-now-test",
    skill: { id: "what-now", version: "0.4.0" },
    started_at: "2026-07-28T18:00:00Z",
    inputs: [],
    outputs: [],
    permission_layers: [policy()],
    available_providers: [],
    approvals: [],
    relaxations: [],
    checks: [],
    unresolved_questions: [],
    recommended_next_actions: recommendedNextActions,
  };
}

test("fresh workspace recommends incomplete foundations and uses semantic time only as a tie-breaker", async () => {
  const root = await workspace();
  const analysis = await inspectWorkspace(root, now);
  assert.equal(analysis.schema, "silver/what-now-analysis/v1");
  assert.equal(analysis.recommendations.length, 5);
  assert.equal(analysis.recommendations[0].action, "brand");
  assert.equal(analysis.recommendations[0].timestamp_source, "updated");
  assert.ok(
    analysis.recommendations.every(({ automatic }) => automatic === false),
  );
});

test("pending checkpoints, failed checks, and stale state outrank new work", async () => {
  const root = await workspace();
  await write(
    root,
    ".silver/playbooks/runs/paused.json",
    JSON.stringify({
      schema: "silver/playbook-state/v2",
      run_id: "paused-loop",
      status: "paused",
      updated_at: "2026-07-28T17:30:00Z",
      checkpoints: [
        {
          id: "select-direction",
          node: "ideate",
          type: "human",
          status: "pending",
          prompt: "Choose a direction.",
        },
      ],
      node_states: [
        { node: "prototype", status: "stale", inputs: [], outputs: [] },
      ],
      invalidations: [],
    }),
  );
  await write(
    root,
    ".silver/results/checks/accessibility.json",
    JSON.stringify({
      status: "fail",
      completed_at: "2026-07-28T17:45:00Z",
    }),
  );
  const analysis = await inspectWorkspace(root, now);
  assert.deepEqual(
    analysis.recommendations.slice(0, 3).map(({ action }) => action),
    ["resume-playbook", "design-check", "reconcile"],
  );
});

test("accepted ready results contribute their declared follow-up evidence", async () => {
  const root = await workspace();
  await write(
    root,
    ".silver/results/skills/specify-ready.json",
    JSON.stringify({
      invocation_id: "specify-ready",
      skill: { id: "specify", version: "0.4.0" },
      completed_at: "2026-07-28T17:50:00Z",
      execution: { status: "complete" },
      acceptance: { status: "accepted" },
      readiness: [{ name: "flow", status: "ready", reasons: [] }],
      freshness_blockers: [],
      recommended_next_actions: [
        {
          action: "flow",
          reason: "The accepted specification is ready for behavior modeling.",
          automatic: false,
        },
      ],
    }),
  );
  const analysis = await inspectWorkspace(root, now);
  const flow = analysis.recommendations.find(({ action }) => action === "flow");
  assert.equal(flow.priority, 4);
  assert.match(flow.reason, /accepted result specify-ready/);
});

test("analysis does not mutate the workspace and refuses symlink traversal", async () => {
  const root = await workspace();
  const outside = await mkdtemp(path.join(os.tmpdir(), "silver-what-now-outside-"));
  await write(outside, "brand.md", "---\nupdated: 2026-07-28\n---\nOutside\n");
  await write(
    root,
    "design/manifest.yaml",
    (await readFile(path.join(root, "design/manifest.yaml"), "utf8")).replace(
      "design/brand.md",
      "design/linked/brand.md",
    ),
  );
  await mkdir(path.join(root, "design"), { recursive: true });
  await symlink(outside, path.join(root, "design/linked"));
  const before = await snapshot(root);
  const analysis = await inspectWorkspace(root, now);
  const after = await snapshot(root);
  assert.deepEqual(after, before);
  assert.equal(analysis.recommendations[0].action, "repair-workspace");
  assert.match(analysis.recommendations[0].reason, /unsafe to read/);
});

test("guarded invocation preserves ranked recommendations from the contract allowlist", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-what-now-invoke-"));
  const requested = [
    {
      action: "resume-playbook",
      reason: "A human checkpoint is pending.",
      automatic: false,
    },
    {
      action: "design-check",
      reason: "The latest check did not run.",
      automatic: false,
    },
  ];
  const result = await invokeSkill({
    root,
    skillDirectory: path.join(repositoryRoot, "framework/skills/what-now"),
    request: invocation(requested),
    completedAt: "2026-07-28T18:00:01Z",
  });
  assert.equal(result.execution.status, "complete");
  assert.deepEqual(result.recommended_next_actions, requested);
  assert.equal(result.acceptance.status, "not-required");
});

test("guarded invocation rejects undeclared recommendations and emits none", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-what-now-reject-"));
  const result = await invokeSkill({
    root,
    skillDirectory: path.join(repositoryRoot, "framework/skills/what-now"),
    request: invocation([
      {
        action: "delete-workspace",
        reason: "This action is not in the skill contract.",
        automatic: false,
      },
    ]),
    completedAt: "2026-07-28T18:00:01Z",
  });
  assert.equal(result.execution.status, "blocked");
  assert.deepEqual(result.recommended_next_actions, []);
  assert.match(result.execution.summary, /undeclared action/);
});

test("generated what-now package stays aligned with the catalog", async () => {
  const contract = parse(
    await readFile(
      path.join(repositoryRoot, "framework/skills/what-now/skill.yaml"),
      "utf8",
    ),
  );
  assert.equal(contract.id, "what-now");
  assert.equal(contract.version, "0.4.0");
  assert.deepEqual(contract.outputs, []);
  assert.equal(contract.completion.review.required, false);
  assert.equal(contract.completion.quality_criteria[0].evaluation, "deterministic");
  assert.ok(contract.scripts.some(({ id }) => id === "analyze-workspace"));
});
