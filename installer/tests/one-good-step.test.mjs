// Regressions for the 0.6.1 field report.
//
// Each test here corresponds to a defect that a real session hit while taking a
// workspace from `npm install` through brand, design system, and a prototype.
// The numbering matches SILVER_DESIGN_FRAMEWORK_BUG_REPORT.md.
import assert from "node:assert/strict";
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
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { doctorWorkspace } from "../doctor.mjs";
import { inspectWorkspace } from "../../framework/skills/what-now/scripts/analyze-workspace.mjs";
import { runCheckSuite } from "../checks.mjs";
import { setupWorkspace } from "../setup.mjs";
import { repairWorkspace } from "../repair.mjs";
import { applyStatusChangesToSource } from "../../framework/runtime/manifest-sync.mjs";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function blankWorkspace(t, name = "regression-product") {
  const directory = await mkdtemp(path.join(os.tmpdir(), `silver-${name}-`));
  t.after(() => rm(directory, { force: true, recursive: true }));
  await setupWorkspace({ root: directory, name, id: name });
  return directory;
}

// Issues 4, 11 and 13: a healthy, freshly created workspace was simultaneously
// "healthy" per doctor, "blocked" per what-now, and full of fixture text.
test("a freshly created workspace is clean by every measure at once", async (t) => {
  const workspace = await blankWorkspace(t, "fresh");

  // 4: the component catalog is a directory. Reading it through a file reader
  // reported it missing and ranked repair-workspace first with high confidence.
  const analysis = await inspectWorkspace(workspace, new Date());
  const blockers = analysis.recommendations.filter(
    ({ action }) => action === "repair-workspace",
  );
  assert.deepEqual(
    blockers,
    [],
    "a new workspace must not recommend repairing itself",
  );
  assert.ok(analysis.recommendations.length >= 3);

  // 11: two JSON artifacts every workspace ships were warned about for lacking
  // Markdown frontmatter they are not supposed to have.
  const diagnosis = await doctorWorkspace({ root: workspace });
  assert.deepEqual(
    diagnosis.diagnostics,
    [],
    "a new workspace must produce no diagnostics at all",
  );
  assert.equal(diagnosis.ok, true);

  // 13: the canonical manifest described the user's product as a test fixture.
  const manifest = await readFile(
    path.join(workspace, "design/manifest.yaml"),
    "utf8",
  );
  assert.ok(
    !manifest.includes("Blank-workspace fixture"),
    "a real workspace must not inherit fixture language",
  );

  // The fast suite agrees with both of the above.
  const suite = await runCheckSuite({ root: workspace });
  assert.notEqual(suite.status, "fail");
});

// Issue 14: the semantic-styles checker walked into installed dependencies and
// build output, reporting hundreds of violations in Vite and React source.
test("design checks ignore dependencies and build output", async (t) => {
  const workspace = await blankWorkspace(t, "traversal");
  const noise = "a { color: #ff00ff; width: 137px; }\n";
  for (const relative of [
    "prototypes/demo/node_modules/vite/dist/client.css",
    "prototypes/demo/dist/assets/index-abc123.css",
    "prototypes/demo/.vite/deps/chunk.css",
    "reference-system/node_modules/react-dom/cjs/style.css",
  ]) {
    await mkdir(path.dirname(path.join(workspace, relative)), {
      recursive: true,
    });
    await writeFile(path.join(workspace, relative), noise);
  }

  const suite = await runCheckSuite({ root: workspace, only: ["semantic-styles"] });
  const [result] = suite.results;
  assert.deepEqual(
    result.findings.map(({ file }) => file),
    [],
    "third-party and generated files are not project-authored design source",
  );
  assert.equal(result.status, "pass");
});

// Issue 19: a result recorded six passing checks while
// `.silver/results/checks/` did not exist. A pass is a claim about work that
// happened; without evidence it is not believable.
test("a claimed pass with no evidence is not believed", async (t) => {
  const workspace = await blankWorkspace(t, "evidence");
  const { invokeSkill } = await import("../../framework/runtime/invoke-skill.mjs");

  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/brand"),
    request: {
      schema: "silver/skill-invocation/v2",
      invocation_id: "brand-fabricated-evidence",
      skill: { id: "brand", version: (await import("../version.mjs")).FRAMEWORK_VERSION },
      started_at: "2026-07-31T00:00:00Z",
      inputs: [],
      outputs: [],
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
    },
    completedAt: "2026-07-31T00:00:01Z",
  });

  for (const check of result.checks) {
    assert.equal(
      check.status,
      "not-run",
      `${check.id} claimed a pass with no evidence file`,
    );
    assert.match(check.reason, /without evidence/);
  }
  assert.ok(result.readiness.every(({ status }) => status !== "ready"));
});

// Issues 6, 7 and 16: accepted output activated an artifact, but the manifest
// kept saying draft, fast validation failed on the disagreement, required checks
// stayed not-run, and downstream readiness never arrived. The fix had to be a
// hand-edit plus `silver repair`, twice.
test("accepting canonical work activates it everywhere in one step", async (t) => {
  const workspace = await blankWorkspace(t, "activation");
  await run("git", ["-C", workspace, "init"]);
  await run("git", ["-C", workspace, "add", "-A"]);
  await run("git", [
    "-C", workspace,
    "-c", "user.name=Test",
    "-c", "user.email=test@example.com",
    "commit", "-qm", "init",
  ]);

  const silver = path.join(root, "bin/silver.mjs");
  const { stdout: scaffold } = await run("node", [
    silver, "invoke", "--scaffold", "brand", workspace,
  ]);
  const request = JSON.parse(scaffold);
  const output = request.outputs.find(
    ({ reference }) => reference.path === "design/brand.md",
  );
  output.reference.id = "brand";
  output.content.value = [
    "---",
    "schema: silver/artifact/v1",
    "id: brand",
    "kind: brand",
    "scope: product",
    "status: active",
    "owner: product-design",
    "updated: 2026-07-31",
    "authority:",
    "  type: local",
    "summary: The audience-facing promise, attributes, and emotional intent.",
    "---",
    "",
    "# Brand",
    "",
    "Audience: small teams planning a week together.",
    "",
  ].join("\n");
  request.outputs = [output];
  request.provenance.change.reason = "Record the initial brand foundation.";
  request.acceptance = {
    status: "accepted",
    reviewer: "test",
    recorded_at: "2026-07-31T00:00:00Z",
  };

  const requestPath = path.join(workspace, "..", `${path.basename(workspace)}-request.json`);
  t.after(() => rm(requestPath, { force: true }));
  await writeFile(requestPath, JSON.stringify(request, null, 2));
  await run("node", [silver, "invoke", "brand", requestPath, workspace]);

  const recorded = JSON.parse(
    await readFile(
      path.join(workspace, ".silver/results/skills", `${request.invocation_id}.json`),
      "utf8",
    ),
  );

  // 7: the required checks ran as part of the invocation and actually passed.
  assert.equal(recorded.execution.status, "complete");
  for (const check of recorded.checks) {
    assert.equal(check.status, "pass", `${check.id} should have run and passed`);
    await readFile(path.join(workspace, check.result_path), "utf8");
  }
  // Downstream readiness follows, without a second command.
  assert.ok(recorded.readiness.every(({ status }) => status === "ready"));

  // 6 and 16: manifest, index, and lock agree with the artifact.
  const manifest = await readFile(
    path.join(workspace, "design/manifest.yaml"),
    "utf8",
  );
  assert.match(manifest, /id: brand\n\s+kind: brand\n[\s\S]*?status: active/);
  const index = await readFile(path.join(workspace, "design/INDEX.md"), "utf8");
  assert.match(index, /\| Brand \| canonical \| active \|/);

  // All of it lands in one commit rather than as a follow-up repair.
  const { stdout: committed } = await run("git", [
    "-C", workspace, "show", "--pretty=format:", "--name-only", "HEAD",
  ]);
  const paths = committed.split("\n").filter(Boolean).sort();
  assert.deepEqual(paths, [
    ".silver/lock.yaml",
    "design/INDEX.md",
    "design/brand.md",
    "design/manifest.yaml",
  ]);

  // And the workspace validates without any manual reconciliation.
  const diagnosis = await doctorWorkspace({ root: workspace });
  assert.equal(diagnosis.ok, true);
});

// Issue 6 again, from the other direction: an already-diverged workspace is
// repaired in place rather than requiring the user to find the disagreement.
test("repair reconciles a manifest that disagrees with its artifacts", async (t) => {
  const workspace = await blankWorkspace(t, "reconcile");
  const brandPath = path.join(workspace, "design/brand.md");
  const brand = await readFile(brandPath, "utf8");
  await writeFile(brandPath, brand.replace(/^status: draft$/m, "status: active"));

  const before = await doctorWorkspace({ root: workspace });
  assert.ok(
    before.diagnostics.some(({ code }) => code === "artifact-mismatch"),
    "the disagreement should be visible first",
  );

  const repaired = await repairWorkspace({ root: workspace });
  assert.deepEqual(repaired.status_changes, [
    { id: "brand", path: "design/brand.md", from: "draft", to: "active" },
  ]);
  assert.equal(repaired.ok, true);
});

// The manifest is a canonical, human-edited file. Flipping one field should read
// as flipping one field.
test("manifest status edits preserve surrounding formatting", () => {
  const source = [
    "artifacts:",
    "  - id: brand",
    "    kind: brand",
    "    path: design/brand.md",
    "    status: draft",
    "",
    "  # A comment the project owns.",
    "  - id: product",
    "    kind: product",
    "    status: draft",
    "",
  ].join("\n");
  const updated = applyStatusChangesToSource(source, [
    { id: "brand", path: "design/brand.md", from: "draft", to: "active" },
  ]);
  assert.match(updated, /- id: brand\n {4}kind: brand\n {4}path: design\/brand\.md\n {4}status: active/);
  assert.ok(updated.includes("# A comment the project owns."));
  assert.match(updated, /- id: product\n {4}kind: product\n {4}status: draft/);
});

// My Practice is where personal preference lives — one place, applying to every
// workspace, never authored inside a project. Both override points resolve from
// there, and neither reaches a committed file.
test("personal preferences are authored in My Practice and carried in untracked", async (t) => {
  const practiceRoot = await mkdtemp(path.join(os.tmpdir(), "silver-practice-"));
  t.after(() => rm(practiceRoot, { force: true, recursive: true }));
  const workspace = await blankWorkspace(t, "practice-overlay");

  const { initializePractice } = await import("../practice.mjs");
  const {
    loadMethodOverlays,
    resolveStudioVoice,
    writeWorkspacePracticeOverlay,
    WORKSPACE_PRACTICE_OVERLAY_PATH,
  } = await import("../practice-overlay.mjs");

  await initializePractice({ root: practiceRoot });

  // A new practice advertises both override points, but the seeded starters are
  // inert: discoverability must not mean an override nobody asked for.
  await readFile(path.join(practiceRoot, "studio-voice.md"), "utf8");
  assert.equal(
    (await resolveStudioVoice({ practiceRoot })).source,
    "framework",
    "a commented starter must not override the default",
  );
  assert.deepEqual(await loadMethodOverlays({ practiceRoot }), {
    overlays: [],
    invalid: [],
  });

  await writeFile(
    path.join(practiceRoot, "studio-voice.md"),
    [
      "---",
      "schema: silver/studio-voice/v1",
      "id: test-studio-voice",
      "title: Test studio voice",
      "revision: r1",
      "---",
      "",
      "Be blunt. Lead with the idea.",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(practiceRoot, "methods", "ideation.yaml"),
    [
      "schema: silver/method-overlay/v1",
      "id: test-ideation-overlay",
      "title: How I like to ideate",
      "revision: r1",
      "applies_to:",
      "  - ideate",
      "guidance:",
      "  - Three genuinely different directions, not three variations.",
      "quality_emphasis: []",
      "exclusions:",
      "  - No mood boards.",
      "provenance:",
      "  schema: silver/provenance/v1",
      "  origin: human-authored",
      "  recorded_at: 2026-07-31T00:00:00Z",
      "  sources: []",
      "  guidance: []",
      "  design_contexts: []",
      "  change:",
      "    reason: Record how I prefer to run ideation.",
      "  acceptance: not-required",
      "  external_bindings: []",
      "",
    ].join("\n"),
  );

  const applied = await writeWorkspacePracticeOverlay(workspace, { practiceRoot });
  assert.equal(applied.source, "practice");
  assert.equal(applied.overlays, 1);

  const overlay = await readFile(
    path.join(workspace, WORKSPACE_PRACTICE_OVERLAY_PATH),
    "utf8",
  );
  assert.match(overlay, /Be blunt\. Lead with the idea\./);
  assert.match(overlay, /Three genuinely different directions/);
  assert.match(overlay, /No mood boards\./);
  // The boundary personal preference can never cross.
  assert.match(overlay, /the project rule wins/);
  // And it says plainly that it is not the place to author.
  assert.match(overlay, /Author your preferences in My Practice instead/);

  // Nothing personal may reach a file the project commits.
  for (const committed of ["AGENTS.md", "CLAUDE.md"]) {
    const content = await readFile(path.join(workspace, committed), "utf8");
    assert.ok(
      !content.includes("Be blunt") && !content.includes("mood boards"),
      `${committed} is committed and shared; it must not carry one person's preferences`,
    );
  }
  const ignored = await readFile(path.join(workspace, ".gitignore"), "utf8");
  assert.match(ignored, /\.silver\/my-practice\.md/);

  // Removing the personal files reverts the workspace completely.
  await rm(path.join(practiceRoot, "studio-voice.md"), { force: true });
  await rm(path.join(practiceRoot, "methods", "ideation.yaml"), { force: true });
  const reverted = await writeWorkspacePracticeOverlay(workspace, { practiceRoot });
  assert.equal(reverted.source, "framework");
  assert.equal(
    await readFile(path.join(workspace, WORKSPACE_PRACTICE_OVERLAY_PATH), "utf8").then(
      () => "present",
      () => "absent",
    ),
    "absent",
  );
});

// A malformed personal file must be reported, never silently ignored and never
// fatal: a broken preference file should not stop anyone using their workspace.
test("an invalid method overlay is reported rather than silently dropped", async (t) => {
  const practiceRoot = await mkdtemp(path.join(os.tmpdir(), "silver-bad-overlay-"));
  t.after(() => rm(practiceRoot, { force: true, recursive: true }));
  const { initializePractice } = await import("../practice.mjs");
  const { loadMethodOverlays } = await import("../practice-overlay.mjs");
  await initializePractice({ root: practiceRoot });

  await writeFile(
    path.join(practiceRoot, "methods", "broken.yaml"),
    "schema: silver/method-overlay/v1\nid: broken\n",
  );
  const { overlays, invalid } = await loadMethodOverlays({ practiceRoot });
  assert.deepEqual(overlays, []);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].path, "broken.yaml");
  assert.ok(invalid[0].reason.length > 0);
});

// Issue 5: asking what to do next should not change anything. `what-now`
// described itself as read-only while writing a result record on every run.
test("what-now leaves the working tree alone unless asked to record", async (t) => {
  const workspace = await blankWorkspace(t, "readonly");
  await run("git", ["-C", workspace, "init"]);
  await run("git", ["-C", workspace, "add", "-A"]);
  await run("git", [
    "-C", workspace,
    "-c", "user.name=Test",
    "-c", "user.email=test@example.com",
    "commit", "-qm", "init",
  ]);

  const silver = path.join(root, "bin/silver.mjs");
  await run("node", [silver, "what-now", workspace]);
  const { stdout: clean } = await run("git", ["-C", workspace, "status", "--porcelain"]);
  assert.equal(clean.trim(), "", "asking what to do next must change nothing");

  await run("node", [silver, "what-now", workspace, "--record"]);
  const { stdout: dirty } = await run("git", ["-C", workspace, "status", "--porcelain"]);
  assert.match(dirty, /\.silver\/results/);

  // And when it does write, the write is declared rather than hidden.
  const { stdout: json } = await run("node", [
    silver, "what-now", workspace, "--record", "--json",
  ]);
  const { result } = JSON.parse(json);
  assert.ok(
    result.observed_effects.some(
      ({ action, path: effectPath }) =>
        action === "write" && effectPath?.startsWith(".silver/results/skills/"),
    ),
    "the result record write must appear in observed effects",
  );
  assert.deepEqual(result.effect_findings, []);
});

// Issue 15: an accepted invocation wrote its files and then failed on the Git
// checkpoint, leaving output that an identical retry refused to overwrite.
test("an accepted invocation refuses before writing when Git cannot commit", async (t) => {
  const workspace = await blankWorkspace(t, "atomicity");
  await run("git", ["-C", workspace, "init"]);
  await run("git", ["-C", workspace, "add", "-A"]);
  await run("git", [
    "-C", workspace,
    "-c", "user.name=Test",
    "-c", "user.email=test@example.com",
    "commit", "-qm", "init",
  ]);
  // Stand in for the reported condition: Git cannot take a commit right now.
  await writeFile(path.join(workspace, ".git/index.lock"), "");

  const { invokeSkill } = await import("../../framework/runtime/invoke-skill.mjs");
  const { FRAMEWORK_VERSION } = await import("../version.mjs");
  const before = await readFile(path.join(workspace, "design/brand.md"), "utf8");

  const result = await invokeSkill({
    root: workspace,
    skillDirectory: path.join(root, "framework/skills/brand"),
    request: {
      schema: "silver/skill-invocation/v2",
      invocation_id: "brand-locked-index",
      skill: { id: "brand", version: FRAMEWORK_VERSION },
      started_at: "2026-07-31T00:00:00Z",
      inputs: [],
      outputs: [
        {
          reference: {
            id: "brand",
            kind: "brand",
            revision: "r2",
            path: "design/brand.md",
          },
          content: { format: "text", value: "# Replaced\n" },
          expected_integrity: (await import("../lib/files.mjs")).integrity(before),
        },
      ],
      provenance: {
        schema: "silver/provenance/v1",
        origin: "agent-assisted",
        recorded_at: "2026-07-31T00:00:00Z",
        sources: [],
        guidance: [],
        design_contexts: [],
        change: { reason: "Attempt an accepted write while Git is locked." },
        acceptance: "accepted",
        external_bindings: [],
      },
      available_providers: [],
      approvals: [],
      relaxations: [],
      checks: [],
      unresolved_questions: [],
      acceptance: {
        status: "accepted",
        reviewer: "test",
        recorded_at: "2026-07-31T00:00:00Z",
      },
    },
    completedAt: "2026-07-31T00:00:01Z",
  });

  assert.equal(result.execution.status, "blocked");
  assert.match(result.execution.summary, /index\.lock/);
  assert.match(result.execution.summary, /No files were written/);
  assert.equal(
    await readFile(path.join(workspace, "design/brand.md"), "utf8"),
    before,
    "a blocked checkpoint must not leave a half-applied write behind",
  );
});
