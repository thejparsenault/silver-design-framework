import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { renderStaticImplementation } from "../skills/implement/scripts/render-static-implementation.mjs";
import { renderPresentation } from "../skills/pitch/scripts/render-presentation.mjs";
import { renderSketch } from "../skills/sketch/scripts/render-sketch.mjs";
import { runFastSuite } from "../skills/design-check/scripts/run-fast.mjs";
import { assertV2 } from "../runtime/contracts.mjs";
import { setupWorkspace } from "../../installer/setup.mjs";

async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-renderers-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Renderer fixture", id: "renderer-fixture", date: "2026-07-24" });
  return root;
}

const timestamp = "2026-07-24T20:00:00Z";
const source = {
  id: "design-specification",
  kind: "design-specification",
  revision: "r1",
  path: "design/work/specifications/onboarding.json",
};

async function writeArtifact(root, relativePath, artifact) {
  await assertV2("working-artifact.schema.json", artifact);
  const absolute = path.join(root, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

test("local sketch, presentation, and production renderers create constrained review targets", async (t) => {
  const root = await workspace(t);
  await writeArtifact(root, source.path, {
    schema: "silver/working-artifact/v2",
    id: source.id,
    kind: source.kind,
    revision: source.revision,
    scope: "product",
    status: "accepted",
    title: "Onboarding intent",
    created: timestamp,
    updated: timestamp,
    sources: [],
    payload: {
      outcomes: ["Understand the workspace"],
      hypothesis: "Guided setup reduces uncertainty.",
      scope: ["First run"],
      non_goals: ["Account provisioning"],
      requirements: ["Show a clear completion action"],
      content_and_data: ["Workspace name"],
      states: ["ready", "complete"],
      edge_cases: ["No workspace name"],
      accessibility: ["Keyboard operable"],
      success_criteria: ["User completes setup"],
      decisions: [],
      open_questions: []
    }
  });

  const sketchPath = "design/work/sketches/onboarding/sketch.json";
  await writeArtifact(root, sketchPath, {
    schema: "silver/working-artifact/v2",
    id: "onboarding-sketch",
    kind: "sketch",
    revision: "r1",
    scope: "product",
    status: "draft",
    title: "Onboarding alternatives",
    created: timestamp,
    updated: timestamp,
    sources: [source],
    payload: {
      fidelity: "low",
      constraint_profile: "constrained",
      question: "Which structure makes the next action clearest?",
      view_path: "design/work/sketches/onboarding/index.html",
      alternatives: [
        { title: "Single focus", summary: "One centered decision.", tradeoff: "Less context visible." },
        { title: "Guided context", summary: "Context beside the decision.", tradeoff: "More to scan." }
      ]
    }
  });
  await renderSketch({ root, artifact: sketchPath, output: "design/work/sketches/onboarding/index.html" });

  const findingPath = "design/work/findings/setup.json";
  await writeArtifact(root, findingPath, {
    schema: "silver/working-artifact/v2",
    id: "setup-finding",
    kind: "finding",
    revision: "r1",
    scope: "product",
    status: "accepted",
    title: "Setup uncertainty",
    created: timestamp,
    updated: timestamp,
    sources: [source],
    payload: { statement: "The current path does not explain the next action.", evidence_refs: [source], confidence: "medium" }
  });
  const changeCasePath = "design/pitches/onboarding/change-case.json";
  await writeArtifact(root, changeCasePath, {
    schema: "silver/working-artifact/v2",
    id: "onboarding-change-case",
    kind: "change-case",
    revision: "r1",
    scope: "product",
    status: "accepted",
    title: "Make setup legible",
    created: timestamp,
    updated: timestamp,
    sources: [{ id: "setup-finding", kind: "finding", revision: "r1", path: findingPath }],
    payload: {
      mode: "proposal",
      before: "The next action is implicit.",
      reasons: ["Accepted finding shows uncertainty."],
      after: "One explicit completion action is visible.",
      impact: { kind: "estimated", claim: "Fewer setup errors", confidence: "medium", source: "setup-finding@r1" },
      tradeoffs: ["Adds one explanatory sentence."],
      decision_request: "Approve the guided setup direction."
    }
  });
  await renderPresentation({
    root,
    changeCase: changeCasePath,
    kit: "design/presentation-kit/kit.json",
    output: "presentations/onboarding/index.html"
  });

  const handoffPath = "design/work/implementation-handoffs/onboarding.json";
  await writeArtifact(root, handoffPath, {
    schema: "silver/working-artifact/v2",
    id: "onboarding-handoff",
    kind: "implementation-handoff",
    revision: "r1",
    scope: "codebase",
    status: "accepted",
    title: "Onboarding production handoff",
    created: timestamp,
    updated: timestamp,
    sources: [source],
    payload: {
      recipe: "static-html",
      readiness: "ready",
      accepted_intent: [source],
      required_checks: ["semantic-styles", "production-readiness", "accessibility", "responsive-behavior", "critical-interactions"],
      missing_intent: [],
      content: {
        title: "Workspace setup",
        heading: "Finish setting up your workspace",
        body: "Review the current settings before continuing.",
        primary_action: "Finish setup",
        secondary_action: "Not now",
        completion_message: "Workspace setup is complete."
      }
    }
  });
  await renderStaticImplementation({ root, handoff: handoffPath, output: "production/onboarding" });

  const result = await runFastSuite({ root });
  assert.equal(result.status, "pass", JSON.stringify(result, null, 2));
  assert.match(await readFile(path.join(root, "design/work/sketches/onboarding/index.html"), "utf8"), /data-artifact-revision="r1"/);
  assert.match(await readFile(path.join(root, "presentations/onboarding/index.html"), "utf8"), /data-kit-revision="r1"/);
  assert.match(await readFile(path.join(root, "production/onboarding/index.html"), "utf8"), /data-handoff-revision="r1"/);
});

test("production renderer refuses incomplete readiness instead of inventing intent", async (t) => {
  const root = await workspace(t);
  const handoffPath = "design/work/implementation-handoffs/blocked.json";
  const artifact = {
    schema: "silver/working-artifact/v2",
    id: "blocked-handoff",
    kind: "implementation-handoff",
    revision: "r1",
    scope: "codebase",
    status: "draft",
    title: "Blocked handoff",
    created: timestamp,
    updated: timestamp,
    sources: [source],
    payload: {
      recipe: "static-html",
      readiness: "blocked",
      accepted_intent: [source],
      required_checks: ["production-readiness"],
      missing_intent: ["Primary action copy"],
      content: {}
    }
  };
  await writeArtifact(root, handoffPath, artifact);
  await assert.rejects(
    renderStaticImplementation({ root, handoff: handoffPath, output: "production/blocked" }),
    /ready static-html handoff with no missing intent/
  );
});
