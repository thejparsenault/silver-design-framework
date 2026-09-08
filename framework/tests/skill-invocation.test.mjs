import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { invokeSkill } from "../runtime/invoke-skill.mjs";
import {
  CHECK_STATE_SCOPE,
  workspaceCheckStateDigest,
} from "../runtime/check-attestation.mjs";

const run = promisify(execFile);

// A claimed `pass` is only believed when its evidence file exists and agrees, so
// a fixture that wants a check to count has to leave real evidence behind.
async function seedCheckEvidence(workspace, checkers, status = "pass") {
  await mkdir(path.join(workspace, ".silver/results/checks"), {
    recursive: true,
  });
  await mkdir(path.join(workspace, "design/evidence"), { recursive: true });
  await writeFile(
    path.join(workspace, "design/evidence/seed-feedback.json"),
    `${JSON.stringify({ id: "seed-feedback", kind: "evidence", revision: "r1" }, null, 2)}\n`,
  );
  const stateDigest = await workspaceCheckStateDigest(workspace);
  for (const checker of checkers) {
    await writeFile(
      path.join(workspace, `.silver/results/checks/${checker}.json`),
      `${JSON.stringify(
        {
          schema: "silver/check-result/v1",
          checker,
          status,
          requested: [checker],
          completed: [checker],
          findings: [],
          completed_at: completedAt,
          state_scope: CHECK_STATE_SCOPE,
          state_digest: stateDigest,
        },
        null,
        2,
      )}\n`,
    );
  }
}

async function fixtureCheckRunner({ root: workspace, contract }) {
  const checkers = contract.checks
    .filter(({ required }) => required)
    .map(({ id }) => id);
  await seedCheckEvidence(workspace, checkers);
  return {
    checks: checkers.map((id) => ({
      id,
      status: "pass",
      result_path: `.silver/results/checks/${id}.json`,
    })),
  };
}

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const startedAt = "2026-07-24T21:00:00Z";
const completedAt = "2026-07-24T21:00:01Z";

function reference(id, kind, revision, artifactPath) {
  return { id, kind, revision, path: artifactPath };
}

function permissionLayers(capability, actions, paths) {
  return [
    ["framework", "framework-default"],
    ["user", "user-ceiling"],
    ["workspace", "workspace-restriction"],
    ["profile", "artifact-profile"],
    ["invocation", "invocation-constraint"],
  ].map(([id, layer]) => ({
    schema: "silver/permission-policy/v2",
    id,
    layer,
    rules: [
      {
        capability,
        actions,
        paths,
        decision: "allow",
      },
    ],
  }));
}

function provenance() {
  return {
    schema: "silver/provenance/v1",
    origin: "agent-assisted",
    recorded_at: startedAt,
    contributors: [{ kind: "agent", id: "fixture-agent" }],
    practice: {
      id: "my-practice",
      revision: "r1",
      methods: [],
    },
    guidance: [],
    design_contexts: [],
    change: { reason: "Created by a guarded invocation fixture." },
    external_bindings: [],
  };
}

async function seedDesignContext(workspace) {
  const contextPath = path.join(workspace, "design/contexts/default.yaml");
  await mkdir(path.dirname(contextPath), { recursive: true });
  await writeFile(
    contextPath,
    [
      "schema: silver/design-context/v1",
      "id: default-design-context",
      "kind: design-context",
      "revision: r1",
      "title: Default design context",
      "",
    ].join("\n"),
  );
}

function findingOutput() {
  const outputReference = reference(
    "campaign-finding",
    "finding",
    "r1",
    "design/work/findings/campaign-finding.json",
  );
  return {
    reference: outputReference,
    schema_name: "working-artifact.schema.json",
    content: {
      format: "json",
      value: {
        schema: "silver/working-artifact/v2",
        id: outputReference.id,
        kind: outputReference.kind,
        revision: outputReference.revision,
        scope: "product",
        status: "draft",
        title: "People cannot confidently review targeting",
        created: startedAt,
        updated: startedAt,
        sources: [
          reference(
            "seed-feedback",
            "evidence",
            "r1",
            "design/evidence/seed-feedback.json",
          ),
        ],
        payload: {
          statement: "Targeting lacks a clear review moment.",
          evidence_refs: ["seed-feedback@r1"],
          confidence: "medium",
        },
      },
    },
  };
}

function synthesizeRequest(overrides = {}) {
  return {
    schema: "silver/skill-invocation/v2",
    invocation_id: "synthesize-test-1",
    skill: { id: "synthesize", version: "0.10.0" },
    started_at: startedAt,
    sources: [
      reference(
        "seed-feedback",
        "evidence",
        "r1",
        "design/evidence/seed-feedback.json",
      ),
    ],
    provenance: provenance([
      reference(
        "seed-feedback",
        "evidence",
        "r1",
        "design/evidence/seed-feedback.json",
      ),
    ]),
    outputs: [findingOutput()],
    permission_layers: permissionLayers(
      "repository",
      ["read", "inspect", "create", "write", "update"],
      ["design/**"],
    ),
    available_providers: [],
    approvals: [],
    relaxations: [],
    checks: [
      {
        id: "contract-integrity",
        status: "pass",
        result_path: ".silver/results/checks/contract-integrity.json",
      },
      {
        id: "evidence-provenance",
        status: "pass",
        result_path: ".silver/results/checks/evidence-provenance.json",
      },
    ],
    unresolved_questions: [],
    acceptance: {
      status: "accepted",
      reviewer: "fixture-reviewer",
      recorded_at: completedAt,
    },
    ...overrides,
  };
}

test("guarded invocation writes a valid artifact and normalized accepted result", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-positive-"),
  );
  await seedCheckEvidence(workspace, [
    "contract-integrity",
    "evidence-provenance",
  ]);
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request: synthesizeRequest(),
    completedAt,
    runChecks: fixtureCheckRunner,
  });
  assert.equal(result.execution.status, "complete");
  assert.ok(result.readiness.every(({ status }) => status === "ready"));
  assert.ok(
    result.recommended_next_actions.every(
      ({ automatic }) => automatic === false,
    ),
  );
  const artifact = JSON.parse(
    await readFile(
      path.join(
        workspace,
        "design/work/findings/campaign-finding.json",
      ),
      "utf8",
    ),
  );
  assert.equal(artifact.id, "campaign-finding");
  const recorded = JSON.parse(
    await readFile(
      path.join(
        workspace,
        ".silver/results/skills/synthesize-test-1.json",
      ),
      "utf8",
    ),
  );
  assert.deepEqual(recorded, result);
  assert.equal(result.degraded_capabilities[0].coverage, "degraded");
  assert.equal(result.git_checkpoint.status, "not-a-repository");
});

test("accepted outputs create a local Git checkpoint without pushing", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-git-"),
  );
  await run("git", ["-C", workspace, "init"]);
  await run("git", ["-C", workspace, "config", "commit.gpgSign", "true"]);
  await seedCheckEvidence(workspace, [
    "contract-integrity",
    "evidence-provenance",
  ]);
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request: synthesizeRequest({ invocation_id: "synthesize-git-1" }),
    completedAt,
  });
  assert.equal(result.git_checkpoint.status, "committed");
  assert.deepEqual(result.git_checkpoint.pushes, []);
  assert.deepEqual(result.git_checkpoint.pull_requests, []);
  assert.deepEqual(result.git_checkpoint.merges, []);
  assert.deepEqual(result.git_checkpoint.paths, [
    "design/work/findings/campaign-finding.json",
  ]);
  assert.equal(
    (
      await run("git", [
        "-C",
        workspace,
        "show",
        "--pretty=format:",
        "--name-only",
        "HEAD",
      ])
    ).stdout.trim(),
    "design/work/findings/campaign-finding.json",
  );
});

test("legacy Silver ask rules no longer deny repository writes", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-canonical-"),
  );
  const request = {
    schema: "silver/skill-invocation/v2",
    invocation_id: "brand-test-1",
    skill: { id: "brand", version: "0.10.0" },
    started_at: startedAt,
    sources: [],
    outputs: [
      {
        reference: reference(
          "brand",
          "brand",
          "r1",
          "design/brand.md",
        ),
        content: {
          format: "text",
          value: "---\\nschema: silver/artifact/v1\\nid: brand\\n---\\n# Brand",
        },
      },
    ],
    provenance: provenance(),
    permission_layers: permissionLayers(
      "canonical-artifact",
      ["create", "write", "update"],
      ["design/brand.md"],
    ),
    available_providers: [],
    approvals: [],
    relaxations: [],
    checks: [],
    unresolved_questions: [],
  };
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/brand"),
    request,
    completedAt,
  });
  // The write succeeded and nothing is wrong with it, but this skill's required
  // checks never ran, so the output is unverified rather than confirmed. Saying
  // "complete" here is what let a result look more trustworthy than it was.
  assert.equal(result.execution.status, "complete-awaiting-verification");
  assert.ok(
    result.readiness.every(({ status }) => status === "not-ready"),
    "unverified work cannot be downstream-ready",
  );
  assert.equal(result.observed_effects[0].path, "design/brand.md");
  // Persisting the result is itself a write. Declaring it is what stops a skill
  // from calling itself read-only while dirtying the working tree.
  assert.ok(
    result.observed_effects.some(
      ({ path: effectPath }) =>
        effectPath === ".silver/results/skills/brand-test-1.json",
    ),
    "the result record write must appear in observed effects",
  );
  assert.deepEqual(result.effect_findings, []);
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(workspace, ".silver/results/skills/brand-test-1.json"),
        "utf8",
      ),
    ),
    result,
  );
  assert.equal(
    await readFile(path.join(workspace, "design/brand.md"), "utf8"),
    "---\\nschema: silver/artifact/v1\\nid: brand\\n---\\n# Brand\n",
  );
});

test("durable output without provenance is blocked before writing", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-no-provenance-"),
  );
  const request = synthesizeRequest();
  delete request.provenance;
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request,
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.match(result.execution.summary, /provenance envelope/);
  assert.equal(result.provenance.origin, "generated");
  await assert.rejects(
    readFile(
      path.join(workspace, "design/work/findings/campaign-finding.json"),
      "utf8",
    ),
    /ENOENT/,
  );
});

test("an invocation with no references block cites none, even when a collection exists", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-no-references-"),
  );
  await mkdir(path.join(workspace, "design/references"), { recursive: true });
  await writeFile(
    path.join(workspace, "design/references/onboarding-patterns.json"),
    JSON.stringify({
      schema: "silver/reference-collection/v1",
      id: "onboarding-patterns",
      revision: "r1",
      updated: startedAt,
      references: [],
    }),
  );
  const request = synthesizeRequest();
  delete request.provenance;
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request,
    completedAt,
  });
  assert.deepEqual(result.provenance.references, []);
});

test("an invocation citing a collection records exactly those ids, pinned by its revision", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-references-"),
  );
  await mkdir(path.join(workspace, "design/references"), { recursive: true });
  await writeFile(
    path.join(workspace, "design/references/onboarding-patterns.json"),
    JSON.stringify({
      schema: "silver/reference-collection/v1",
      id: "onboarding-patterns",
      revision: "r3",
      updated: startedAt,
      references: [
        { id: "ref-a", revision: "r1", description: "A.", rights: { usage: "inspiration-only" }, path: "design/references/assets/a.png", media_type: "image/png", integrity: "sha256:0000000000000000000000000000000000000000000000000000000000000000" },
        { id: "ref-b", revision: "r1", description: "B.", rights: { usage: "internal" }, path: "design/references/assets/b.png", media_type: "image/png", integrity: "sha256:0000000000000000000000000000000000000000000000000000000000000000" },
      ],
    }),
  );
  const request = synthesizeRequest({
    references: [{ collection: "onboarding-patterns", ids: ["ref-a"] }],
  });
  delete request.provenance;
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request,
    completedAt,
  });
  assert.deepEqual(result.provenance.references, [
    { collection: "onboarding-patterns", revision: "r3", ids: ["ref-a"] },
  ]);
});

test("citing a reference id that does not exist in the collection is refused", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-bad-reference-"),
  );
  await mkdir(path.join(workspace, "design/references"), { recursive: true });
  await writeFile(
    path.join(workspace, "design/references/onboarding-patterns.json"),
    JSON.stringify({
      schema: "silver/reference-collection/v1",
      id: "onboarding-patterns",
      revision: "r1",
      updated: startedAt,
      references: [],
    }),
  );
  const request = synthesizeRequest({
    references: [{ collection: "onboarding-patterns", ids: ["not-a-real-id"] }],
  });
  delete request.provenance;
  await assert.rejects(
    () =>
      invokeSkill({
        root: workspace,
        skillDirectory: path.join(root, "framework/skills/synthesize"),
        request,
        completedAt,
      }),
    /no entry named not-a-real-id/,
  );
});

test("visual durable output without a design-context pin is blocked", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-no-context-"),
  );
  const visualization = reference(
    "contextless-visualization",
    "visualization",
    "r1",
    "design/work/visualizations/contextless.json",
  );
  const request = {
    schema: "silver/skill-invocation/v2",
    invocation_id: "visualize-no-context",
    skill: { id: "visualize", version: "0.10.0" },
    started_at: startedAt,
    sources: [],
    outputs: [
      {
        reference: visualization,
        content: {
          format: "json",
          value: {
            id: visualization.id,
            kind: visualization.kind,
            revision: visualization.revision,
          },
        },
      },
    ],
    provenance: provenance(),
    permission_layers: permissionLayers(
      "repository",
      ["read", "inspect", "create", "write", "update"],
      ["design/**"],
    ),
    available_providers: [],
    approvals: [],
    relaxations: [],
    checks: [],
    unresolved_questions: [],
  };
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/visualize"),
    request,
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.match(result.execution.summary, /design-context revision/);
  await assert.rejects(
    readFile(
      path.join(workspace, "design/work/visualizations/contextless.json"),
      "utf8",
    ),
    /ENOENT/,
  );
});

test("acceptance aliases and provenance relationships must agree before writes", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "silver-provenance-preflight-"));
  await seedCheckEvidence(workspace, ["contract-integrity", "evidence-provenance"]);

  const acceptanceMismatch = synthesizeRequest({ invocation_id: "acceptance-mismatch" });
  acceptanceMismatch.provenance.acceptance = "awaiting-review";
  const mismatch = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request: acceptanceMismatch,
    completedAt,
  });
  assert.equal(mismatch.execution.status, "blocked");
  assert.match(mismatch.execution.summary, /disagrees with authoritative acceptance/);

  const originMismatch = synthesizeRequest({ invocation_id: "origin-mismatch" });
  originMismatch.provenance.contributors = [];
  const origin = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request: originMismatch,
    completedAt,
  });
  assert.equal(origin.execution.status, "blocked");
  assert.match(origin.execution.summary, /requires a agent contributor/);
});

test("existing outputs require matching integrity and remain unchanged on stale writes", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-stale-"),
  );
  await seedCheckEvidence(workspace, [
    "contract-integrity",
    "evidence-provenance",
  ]);
  const first = synthesizeRequest();
  await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request: first,
    completedAt,
  });
  const artifactPath = path.join(
    workspace,
    "design/work/findings/campaign-finding.json",
  );
  const before = await readFile(artifactPath, "utf8");
  const second = synthesizeRequest({
    invocation_id: "synthesize-test-2",
  });
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request: second,
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.match(result.execution.summary, /already claimed.*new revision/i);
  assert.equal(await readFile(artifactPath, "utf8"), before);
});

test("state-bound evidence survives unchanged blocked preflight and rejects workspace drift", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "silver-check-state-"));
  const checkers = ["contract-integrity", "evidence-provenance"];
  await seedCheckEvidence(workspace, checkers);
  const request = synthesizeRequest({ invocation_id: "state-bound-unchanged" });
  request.sources = [];

  const unchanged = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request,
    completedAt,
  });
  assert.equal(unchanged.execution.status, "blocked");
  assert.ok(unchanged.checks.every(({ status }) => status === "pass"));

  await writeFile(path.join(workspace, "new-check-input.txt"), "changed\n");
  const stale = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request: { ...request, invocation_id: "state-bound-stale" },
    completedAt,
  });
  assert.ok(stale.checks.every(({ status }) => status === "not-run"));
  assert.ok(stale.checks.every(({ reason }) => /different workspace state/.test(reason)));
});

test("checker substitution cannot reuse an otherwise current attestation", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "silver-check-substitution-"));
  await seedCheckEvidence(workspace, ["contract-integrity"]);
  const evidencePath = path.join(workspace, ".silver/results/checks/contract-integrity.json");
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  await writeFile(evidencePath, `${JSON.stringify({ ...evidence, checker: "accessibility" }, null, 2)}\n`);
  const request = synthesizeRequest({ invocation_id: "checker-substitution" });
  request.sources = [];
  request.checks = request.checks.filter(({ id }) => id === "contract-integrity");
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request,
    completedAt,
  });
  assert.equal(result.checks[0].status, "not-run");
  assert.match(result.checks[0].reason, /does not identify checker contract-integrity/);
});

test("workspace attestations include additions, deletions, bytes, and symlink targets", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "silver-check-digest-"));
  await writeFile(path.join(workspace, "target-a.txt"), "a\n");
  await writeFile(path.join(workspace, "target-b.txt"), "b\n");
  await symlink("target-a.txt", path.join(workspace, "current.txt"));
  const initial = await workspaceCheckStateDigest(workspace);
  await writeFile(path.join(workspace, "target-a.txt"), "changed\n");
  assert.notEqual(await workspaceCheckStateDigest(workspace), initial);
  await writeFile(path.join(workspace, "added.txt"), "new\n");
  const added = await workspaceCheckStateDigest(workspace);
  await unlink(path.join(workspace, "added.txt"));
  assert.notEqual(await workspaceCheckStateDigest(workspace), added);
  const beforeLinkChange = await workspaceCheckStateDigest(workspace);
  await unlink(path.join(workspace, "current.txt"));
  await symlink("target-b.txt", path.join(workspace, "current.txt"));
  assert.notEqual(await workspaceCheckStateDigest(workspace), beforeLinkChange);
});

test("current input revision drift blocks before writing while historical pins remain untouched", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "silver-invoke-input-drift-"));
  await seedCheckEvidence(workspace, ["contract-integrity", "evidence-provenance"]);
  await writeFile(
    path.join(workspace, "design/evidence/seed-feedback.json"),
    `${JSON.stringify({ id: "seed-feedback", kind: "evidence", revision: "r2" }, null, 2)}\n`,
  );
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request: synthesizeRequest({ invocation_id: "synthesize-stale-input" }),
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.match(result.execution.summary, /stale or mismatched.*revision/);
  await assert.rejects(
    readFile(path.join(workspace, "design/work/findings/campaign-finding.json"), "utf8"),
    /ENOENT/,
  );
});

function visualizationRequest({ output, render, renders, bindingStates = [], externalBindings = [] }) {
  const context = reference(
    "default-design-context",
    "design-context",
    "r1",
    "design/contexts/default.yaml",
  );
  const envelope = provenance([context]);
  envelope.design_contexts = [context];
  envelope.external_bindings = externalBindings;
  const outputs = [
    {
      reference: output,
      schema_name: "working-artifact.schema.json",
      content: {
        format: "json",
        value: {
          schema: "silver/working-artifact/v2",
          id: output.id,
          kind: output.kind,
          revision: output.revision,
          scope: "product",
          status: "draft",
          title: "My Day visualization",
          created: startedAt,
          updated: startedAt,
          sources: [context],
          payload: {
            fidelity: "high",
            constraint_profile: "constrained",
            question: "Does the day layout communicate time clearly?",
            renders,
            alternatives: [
              { title: "Timeline", summary: "Hour-aligned layout", tradeoff: "Dense" },
              { title: "Agenda", summary: "Compact list", tradeoff: "Less spatial" },
            ],
          },
        },
      },
    },
  ];
  if (render) outputs.push(render);
  return {
    schema: "silver/skill-invocation/v2",
    invocation_id: `visualize-${render ? "rendered" : "external"}`,
    skill: { id: "visualize", version: "0.10.0" },
    started_at: startedAt,
    sources: [context],
    outputs,
    provenance: envelope,
    permission_layers: permissionLayers(
      "repository",
      ["read", "inspect", "create", "write", "update"],
      ["design/**"],
    ),
    available_providers: [],
    binding_states: bindingStates,
    approvals: [],
    relaxations: [],
    checks: ["contract-integrity", "semantic-styles", "accessibility"].map((id) => ({
      id,
      status: "pass",
      result_path: `.silver/results/checks/${id}.json`,
    })),
    unresolved_questions: [],
    acceptance: { status: "accepted", reviewer: "fixture-reviewer", recorded_at: completedAt },
  };
}

test("visualization readiness accepts a guarded local render and rejects metadata-only readiness", async () => {
  const renderedRoot = await mkdtemp(path.join(os.tmpdir(), "silver-visual-local-"));
  await seedDesignContext(renderedRoot);
  await seedCheckEvidence(renderedRoot, ["contract-integrity", "semantic-styles", "accessibility"]);
  const output = reference(
    "my-day",
    "visualization",
    "r1",
    "design/work/visualizations/my-day/visualization.json",
  );
  const renderReference = reference(
    "my-day-render",
    "x-visualization-render",
    "r1",
    "design/work/visualizations/my-day/index.html",
  );
  const renders = [{
    id: "primary",
    primary: true,
    medium: "local",
    format: "html",
    path: renderReference.path,
  }];
  const html = '<main data-silver-target="visualization" data-source-id="my-day" data-source-revision="r1" data-renderer-version="0.10.0" data-assets-revision="r1" data-design-system-revision="r1"><h1>My Day</h1></main>';
  const rendered = await invokeSkill({
    root: renderedRoot,
    skillDirectory: path.join(root, "framework/skills/visualize"),
    request: visualizationRequest({
      output,
      renders,
      render: { reference: renderReference, content: { format: "text", value: html } },
    }),
    completedAt,
    runChecks: fixtureCheckRunner,
  });
  assert.ok(rendered.readiness.every(({ status }) => status === "ready"));

  const metadataRoot = await mkdtemp(path.join(os.tmpdir(), "silver-visual-metadata-"));
  await seedDesignContext(metadataRoot);
  await seedCheckEvidence(metadataRoot, ["contract-integrity", "semantic-styles", "accessibility"]);
  const metadataOnly = await invokeSkill({
    root: metadataRoot,
    skillDirectory: path.join(root, "framework/skills/visualize"),
    request: visualizationRequest({ output, renders }),
    completedAt,
  });
  assert.ok(metadataOnly.readiness.every(({ status }) => status === "not-ready"));
  assert.match(metadataOnly.readiness[0].reasons.join(" "), /not recorded/);
});

test("a current captured Figma binding satisfies visualization review readiness", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "silver-visual-figma-"));
  await seedDesignContext(workspace);
  await seedCheckEvidence(workspace, ["contract-integrity", "semantic-styles", "accessibility"]);
  await mkdir(path.join(workspace, "design/integrations"), { recursive: true });
  const output = reference(
    "my-day-figma-view",
    "visualization",
    "r1",
    "design/work/visualizations/my-day-figma/visualization.json",
  );
  const digest = `sha256:${"a".repeat(64)}`;
  await writeFile(
    path.join(workspace, "design/integrations/my-day-figma.yaml"),
    [
      "schema: silver/representation-binding/v2",
      "id: my-day-figma",
      "artifact:",
      `  id: ${output.id}`,
      "  kind: visualization",
      "  revision: r1",
      `  path: ${output.path}`,
      "counterpart:",
      "  type: provider",
      "  provider: figma-console-mcp",
      "  object_id: abc123:42-7",
      "  revision: figma-r7",
      "adapter:",
      "  id: figma-console-mcp",
      "  version: 0.10.0",
      "authority: shared-review",
      "round_trip: partial",
      "sync_policy: manual",
      "base:",
      "  state: initialized",
      "  local:",
      "    state: present",
      "    revision: r1",
      `    integrity: ${digest}`,
      "  external:",
      "    state: present",
      "    revision: figma-r7",
      `    integrity: ${digest}`,
      `  at: ${startedAt}`,
      "",
    ].join("\n"),
  );
  const request = visualizationRequest({
    output,
    renders: [{
      id: "figma",
      primary: true,
      medium: "external",
      format: "figma",
      url: "https://www.figma.com/design/abc123/My-Day?node-id=42-7",
      binding: "my-day-figma",
    }],
    bindingStates: [{
      binding_id: "my-day-figma",
      authority: "shared-review",
      state: "current",
      freshness_sensitive_readiness: ["evaluate", "prototype", "component"],
    }],
    externalBindings: ["my-day-figma"],
  });
  request.invocation_id = "visualize-figma";
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/visualize"),
    request,
    completedAt,
    runChecks: fixtureCheckRunner,
  });
  assert.ok(result.readiness.every(({ status }) => status === "ready"));
  assert.deepEqual(result.provenance.external_bindings[0], {
    id: "my-day-figma",
    path: "design/integrations/my-day-figma.yaml",
    integrity: result.provenance.external_bindings[0].integrity,
  });
  assert.match(result.provenance.external_bindings[0].integrity, /^sha256:[a-f0-9]{64}$/);
});

test("registered portable production capability is selected but empty output still writes nothing", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-not-run-"),
  );
  const request = {
    schema: "silver/skill-invocation/v2",
    invocation_id: "implement-test-1",
    skill: { id: "implement", version: "0.10.0" },
    started_at: startedAt,
    sources: [
      reference(
        "accepted-spec",
        "design-specification",
        "r1",
        "design/work/specifications/accepted-spec.json",
      ),
    ],
    outputs: [],
    permission_layers: permissionLayers(
      "production-source",
      ["create", "write", "update"],
      ["production/**"],
    ),
    available_providers: [],
    approvals: [],
    relaxations: [],
    checks: [],
    unresolved_questions: [],
  };
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/implement"),
    request,
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.ok(
    result.providers.some(
      ({ capability, provider, status }) =>
        capability === "production-source" &&
        provider === "silver-portable" &&
        status === "used",
    ),
  );
  assert.deepEqual(result.outputs, []);
});

test("non-relaxable guardrails block before writes", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-guardrail-"),
  );
  const request = synthesizeRequest({
    relaxations: [
      {
        id: "effects-declared",
        profile: "prototype-suspended",
        reason: "Attempted to suppress an observed effect.",
        decision_reference: reference(
          "bad-relaxation",
          "decision",
          "r1",
          "design/decisions/bad-relaxation.json",
        ),
      },
    ],
  });
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request,
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.match(result.execution.summary, /non-relaxable/);
});

test("undeclared recommendations block before durable outputs are written", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-recommendation-"),
  );
  const request = synthesizeRequest({
    invocation_id: "synthesize-bad-recommendation",
    recommended_next_actions: [
      {
        action: "delete-workspace",
        reason: "This action is outside the synthesize contract.",
        automatic: false,
      },
    ],
  });
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/synthesize"),
    request,
    completedAt,
  });
  assert.equal(result.execution.status, "blocked");
  assert.deepEqual(result.outputs, []);
  assert.deepEqual(result.recommended_next_actions, []);
  await assert.rejects(
    readFile(
      path.join(
        workspace,
        "design/work/findings/campaign-finding.json",
      ),
    ),
    /ENOENT/,
  );
});

// Regression: 0.9 moved the canonical layout to `design/system/`, but the theme
// contract still declared its `token-source` output at `reference-system/tokens/**`,
// so every invocation that wrote tokens where they actually live was refused with
// "Skill theme cannot produce token-source at …" before any mutation.
function themeTokenRequest() {
  const outputReference = reference(
    "brand-primitives",
    "token-source",
    "r1",
    "design/system/tokens/primitive/brand.tokens.json",
  );
  return {
    schema: "silver/skill-invocation/v2",
    invocation_id: "theme-test-1",
    skill: { id: "theme", version: "0.10.0" },
    started_at: startedAt,
    sources: [],
    provenance: provenance(),
    outputs: [
      {
        reference: outputReference,
        schema_name: "token-source.schema.json",
        content: {
          format: "json",
          value: {
            color: {
              $type: "color",
              brand: { $value: "#2f5bff" },
            },
          },
        },
      },
    ],
    permission_layers: [
      ...permissionLayers(
        "canonical-artifact",
        ["create", "write", "update"],
        ["design/system/**"],
      ),
      ...permissionLayers(
        "repository",
        ["read", "inspect", "create", "write", "update"],
        ["design/**", ".silver/**"],
      ),
    ],
    available_providers: [],
    approvals: [
      {
        capability: "canonical-artifact",
        action: "create",
        path: outputReference.path,
        approved_by: "fixture-reviewer",
      },
    ],
    relaxations: [],
    checks: [
      {
        id: "semantic-styles",
        status: "pass",
        result_path: ".silver/results/checks/semantic-styles.json",
      },
      {
        id: "accessibility",
        status: "pass",
        result_path: ".silver/results/checks/accessibility.json",
      },
    ],
    unresolved_questions: [],
    acceptance: {
      status: "accepted",
      reviewer: "fixture-reviewer",
      recorded_at: completedAt,
    },
  };
}

test("theme writes a token-source under design/system/tokens instead of being refused", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-theme-tokens-"),
  );
  await seedCheckEvidence(workspace, ["semantic-styles", "accessibility"]);
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/theme"),
    request: themeTokenRequest(),
    completedAt,
    runChecks: fixtureCheckRunner,
  });
  assert.equal(result.execution.status, "complete");
  const tokens = JSON.parse(
    await readFile(
      path.join(workspace, "design/system/tokens/primitive/brand.tokens.json"),
      "utf8",
    ),
  );
  assert.equal(tokens.color.brand.$value, "#2f5bff");

  // Writing a token source used to leave the compiled tokens.json/tokens.css
  // and the showcase stale until setup or migrate happened to run again — no
  // skill invocation ever rebuilt them.
  const compiledCss = await readFile(
    path.join(workspace, "design/system/expressions/html/styles/tokens.css"),
    "utf8",
  );
  assert.match(compiledCss, /--ds-color-brand:\s*#2f5bff/);
  await access(path.join(workspace, "design/system/tokens.json"));
  await access(path.join(workspace, "design/system/showcase.html"));
  assert.ok(
    result.observed_effects.some(
      (effect) =>
        effect.capability === "canonical-artifact" &&
        effect.path === "design/system/expressions/html/styles/tokens.css",
    ),
    "the rebuilt stylesheet should be reported as an observed effect, not a silent mutation",
  );
});

test("a component-catalog output can be written even though its schema has no internal kind field", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "silver-invoke-system-catalog-"),
  );
  await seedCheckEvidence(workspace, [
    "contract-integrity",
    "semantic-styles",
    "accessibility",
  ]);
  const outputReference = reference(
    "component-catalog",
    "component-catalog",
    "r1",
    "design/system/components.json",
  );
  const request = {
    schema: "silver/skill-invocation/v2",
    invocation_id: "system-catalog-test-1",
    skill: { id: "system", version: "0.10.0" },
    started_at: startedAt,
    sources: [],
    provenance: provenance(),
    outputs: [
      {
        reference: outputReference,
        schema_name: "component-catalog.schema.json",
        content: {
          format: "json",
          value: {
            schema: "silver/component-catalog/v1",
            id: "component-catalog",
            revision: "r1",
            components: {
              button: {
                summary: "Triggers an action.",
                states: ["default"],
                slots: ["label"],
              },
            },
          },
        },
      },
    ],
    permission_layers: [
      ...permissionLayers(
        "canonical-artifact",
        ["create", "write", "update"],
        ["design/system/**"],
      ),
      ...permissionLayers(
        "repository",
        ["read", "inspect", "create", "write", "update"],
        ["design/**", ".silver/**"],
      ),
    ],
    available_providers: [],
    approvals: [
      {
        capability: "canonical-artifact",
        action: "create",
        path: outputReference.path,
        approved_by: "fixture-reviewer",
      },
    ],
    relaxations: [],
    checks: [
      {
        id: "contract-integrity",
        status: "pass",
        result_path: ".silver/results/checks/contract-integrity.json",
      },
      {
        id: "semantic-styles",
        status: "pass",
        result_path: ".silver/results/checks/semantic-styles.json",
      },
      {
        id: "accessibility",
        status: "pass",
        result_path: ".silver/results/checks/accessibility.json",
      },
    ],
    unresolved_questions: [],
    acceptance: {
      status: "accepted",
      reviewer: "fixture-reviewer",
      recorded_at: completedAt,
    },
  };
  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/system"),
    request,
    completedAt,
    runChecks: fixtureCheckRunner,
  });
  assert.equal(result.execution.status, "complete");
  const catalog = JSON.parse(
    await readFile(path.join(workspace, "design/system/components.json"), "utf8"),
  );
  assert.equal(catalog.components.button.summary, "Triggers an action.");
});
