#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import { invokeSkill } from "../runtime/invoke-skill.mjs";
import {
  createPlaybookState,
  recordNodeResult,
  resolveCheckpoint,
  resumePlaybook,
} from "../runtime/playbooks.mjs";
import { runBrowserSuite } from "../skills/design-check/scripts/run-browser.mjs";
import { runFastSuite } from "../skills/design-check/scripts/run-fast.mjs";
import { renderStaticImplementation } from "../skills/implement/scripts/render-static-implementation.mjs";
import { renderPresentation } from "../skills/pitch/scripts/render-presentation.mjs";
import { initPrototype } from "../skills/prototype/scripts/init-prototype.mjs";
import { renderStaticPrototype } from "../skills/prototype/scripts/render-static-prototype.mjs";
import { renderSketch } from "../skills/sketch/scripts/render-sketch.mjs";

const time = "2026-07-24T20:00:00Z";
const completed = "2026-07-24T20:00:01Z";
const allActions = ["read", "inspect", "execute", "create", "write", "update"];
const allPaths = ["design/**", "prototypes/**", "presentations/**", "production/**", "reference-system/**", ".silver/**"];
const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ref = (id, kind, revision, artifactPath) => ({ id, kind, revision, path: artifactPath });
const hash = (content) => `sha256:${createHash("sha256").update(content).digest("hex")}`;

function layers(decision = "allow") {
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
    rules: ["repository", "canonical-artifact", "production-source"].map((capability) => ({
      capability,
      actions: allActions,
      paths: allPaths,
      decision,
    })),
  }));
}

function working(reference, title, payload, sources = [], status = "accepted", scope = "product") {
  return {
    schema: "silver/working-artifact/v2",
    id: reference.id,
    kind: reference.kind,
    revision: reference.revision,
    scope,
    status,
    title,
    created: time,
    updated: time,
    sources,
    payload,
  };
}

function jsonOutput(reference, value, schemaName) {
  return {
    reference,
    ...(schemaName ? { schema_name: schemaName } : {}),
    content: { format: "json", value },
  };
}

function textOutput(reference, value) {
  return { reference, content: { format: "text", value } };
}

function markdown(id, kind, title, body, status = "draft") {
  return `---
schema: silver/artifact/v1
id: ${id}
kind: ${kind}
scope: product
status: ${status}
owner: project-team
updated: 2026-07-24
authority:
  type: local
---

# ${title}

${body}
`;
}

async function writeJson(root, relative, value) {
  const absolute = path.join(root, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function prepareOutputs(root, outputs) {
  const prepared = structuredClone(outputs);
  for (const output of prepared) {
    try {
      output.expected_integrity = hash(await readFile(path.join(root, output.reference.path)));
    } catch {}
  }
  return prepared;
}

async function seedCheckEvidence(root) {
  const suite = await runFastSuite({ root });
  assert.equal(suite.status, "pass", JSON.stringify(suite, null, 2));
  for (const result of suite.results) {
    await writeJson(root, `.silver/results/checks/${result.checker}.json`, result);
  }
  return new Map(suite.results.map((result) => [result.checker, result]));
}

function checksFor(contract, evidence) {
  return contract.checks
    .filter(({ required }) => required)
    .map(({ id }) => {
      assert.ok(evidence.has(id), `No executable check evidence exists for ${id}.`);
      return {
        id,
        status: "pass",
        result_path: `.silver/results/checks/${id}.json`,
      };
    });
}

async function invokeCase({ root, id, inputs = [], outputs = [], checkEvidence, providers = [] }) {
  const skillDirectory = path.join(root, ".skills", id);
  const contract = parse(await readFile(path.join(skillDirectory, "skill.yaml"), "utf8"));
  const positiveOutputs = await prepareOutputs(root, outputs);
  const approvals = [];
  for (const output of positiveOutputs) {
    const rule = contract.outputs.find(({ kind, path_pattern }) =>
      kind === output.reference.kind &&
      (path_pattern.endsWith("**")
        ? output.reference.path.startsWith(path_pattern.slice(0, -2))
        : output.reference.path === path_pattern),
    );
    if (rule?.authority === "canonical-with-approval" || output.reference.kind === "implementation") {
      approvals.push({
        capability: output.reference.kind === "implementation" ? "production-source" : "canonical-artifact",
        action: output.expected_integrity ? "update" : "create",
        path: output.reference.path,
        approved_by: "release-fixture-reviewer",
      });
    }
  }
  const base = {
    schema: "silver/skill-invocation/v2",
    skill: { id, version: "0.2.0" },
    started_at: time,
    inputs,
    outputs: positiveOutputs,
    permission_layers: layers(),
    available_providers: providers,
    approvals,
    relaxations: [],
    checks: checksFor(contract, checkEvidence),
    unresolved_questions: [],
    ...(contract.completion.review.required
      ? { acceptance: { status: "accepted", reviewer: "release-fixture-reviewer", recorded_at: completed } }
      : {}),
  };

  if (id === "design-check") {
    const result = await invokeSkill({
      root,
      skillDirectory,
      request: { ...base, invocation_id: "design-check-local-degraded" },
      completedAt: completed,
    });
    assert.ok(["complete", "complete-with-findings"].includes(result.execution.status));
    assert.ok(result.degraded_capabilities.some(({ capability }) => capability === "browser"));
    return result;
  }

  const boundaryRequest = structuredClone({
    ...base,
    invocation_id: `${id}-boundary`,
    outputs: positiveOutputs.map(({ expected_integrity, ...output }) => output),
    approvals: [],
  });
  if (id === "implement") {
    boundaryRequest.available_providers = [];
  } else {
    boundaryRequest.permission_layers.at(-1).rules =
      boundaryRequest.permission_layers.at(-1).rules.map((rule) => ({
        ...rule,
        decision: "deny",
      }));
  }
  const boundary = await invokeSkill({
    root,
    skillDirectory,
    request: boundaryRequest,
    completedAt: completed,
  });
  assert.ok(["blocked", "not-run"].includes(boundary.execution.status), `${id} boundary unexpectedly ran.`);
  assert.deepEqual(boundary.outputs, []);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(root, `.silver/results/skills/${id}-boundary.json`), "utf8")),
    boundary,
  );

  const result = await invokeSkill({
    root,
    skillDirectory,
    request: { ...base, invocation_id: `${id}-positive` },
    completedAt: completed,
  });
  assert.ok(["complete", "complete-with-findings"].includes(result.execution.status), JSON.stringify(result, null, 2));
  assert.ok(result.recommended_next_actions.every(({ automatic }) => automatic === false));
  assert.ok(result.readiness.every(({ status }) => ["ready", "not-applicable"].includes(status)));
  return result;
}

function artifactOutputs() {
  const seed = ref("seed-feedback", "evidence", "r1", "design/evidence/seed-feedback.json");
  const finding = ref("setup-finding", "finding", "r1", "design/work/findings/setup-finding.json");
  const frame = ref("setup-problem", "problem-frame", "r1", "design/work/problem-frames/setup-problem.json");
  const concept = ref("guided-setup", "concept", "r1", "design/work/concepts/guided-setup.json");
  const hypothesis = ref("guided-setup-hypothesis", "hypothesis", "r1", "design/work/hypotheses/guided-setup.json");
  const selection = ref("select-guided-setup", "decision", "r1", "design/decisions/select-guided-setup.json");
  const specification = ref("guided-setup-spec", "design-specification", "r1", "design/work/specifications/guided-setup.json");
  const flow = ref("guided-setup-flow", "flow", "r1", "design/flows/guided-setup/flow.json");
  const sketch = ref("guided-setup-sketch", "sketch", "r1", "design/work/sketches/guided-setup/sketch.json");
  const component = ref("setup-card", "component-proposal", "r1", "design/work/components/setup-card.json");
  const prototype = ref("guided-setup-prototype", "prototype", "r1", "prototypes/guided-setup/prototype.json");
  const observation = ref("setup-observation", "observation", "r1", "design/evidence/setup-observation.json");
  const evaluation = ref("setup-evaluation", "evaluation", "r1", "design/work/evaluations/setup-evaluation.json");
  const evaluationFinding = ref("setup-evaluation-finding", "finding", "r1", "design/work/findings/setup-evaluation-finding.json");
  const changeCase = ref("guided-setup-change-case", "change-case", "r1", "design/pitches/guided-setup/change-case.json");
  const presentation = ref("guided-setup-presentation", "presentation-view", "r1", "presentations/guided-setup/view.json");
  const handoff = ref("guided-setup-handoff", "implementation-handoff", "r1", "design/work/implementation-handoffs/guided-setup.json");
  const implementation = ref("guided-setup-implementation", "implementation", "r1", "production/guided-setup/intent.json");
  return { seed, finding, frame, concept, hypothesis, selection, specification, flow, sketch, component, prototype, observation, evaluation, evaluationFinding, changeCase, presentation, handoff, implementation };
}

export async function runCompleteBlankScenario(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const refs = artifactOutputs();
  await writeJson(root, refs.seed.path, {
    schema: "silver/evidence/v1",
    id: refs.seed.id,
    kind: refs.seed.kind,
    revision: refs.seed.revision,
    sanitized: true,
    source: "Supplied release-fixture feedback",
    observation: "The existing setup example does not explain what completion changes.",
  });
  const checkEvidence = await seedCheckEvidence(root);
  const results = new Map();

  const canonicalCases = [
    ["product", [], [textOutput(ref("product", "product", "r2", "design/product.md"), markdown("product", "product", "Product", "Audience: first-time workspace owners. Job: finish setup confidently. Desired outcome: understand what changes and what happens next."))]],
    ["brand", [ref("product", "product", "r2", "design/product.md")], [textOutput(ref("brand", "brand", "r2", "design/brand.md"), markdown("brand", "brand", "Brand", "Promise: make consequential setup choices feel clear and reversible. Desired feeling: capable, informed, and unhurried. Anti-attributes: opaque, pushy, ornamental."))]],
    ["voice", [ref("brand", "brand", "r2", "design/brand.md")], [textOutput(ref("voice", "voice", "r2", "design/voice.md"), markdown("voice", "voice", "Voice", "Voice is direct, calm, and specific. Tone becomes concise in success states and explanatory before consequential actions. Prefer “Finish setup”; avoid “Submit”."))]],
    ["principles", [ref("product", "product", "r2", "design/product.md")], [textOutput(ref("design-principles", "design-principles", "r2", "design/design-principles.md"), markdown("design-principles", "design-principles", "Design principles", "## Make consequences legible\n\nDecision test: can the person say what will change before acting? Example: name the saved configuration. Counterexample: a generic Submit button."))]],
    ["theme", [ref("brand", "brand", "r2", "design/brand.md")], [textOutput(ref("design-system", "design-system", "r2", "design/system/README.md"), markdown("design-system", "design-system", "Design system", "Semantic modes: `light/default` and `dark/default`. Product code uses surface, text, border, action, focus, and feedback roles; no raw visual values."))]],
    ["system", [ref("design-system", "design-system", "r2", "design/system/README.md")], [textOutput(ref("design-system", "design-system", "r3", "design/system/README.md"), markdown("design-system", "design-system", "Design system", "Semantic modes: `light/default` and `dark/default`. Registries distinguish primitives, reusable patterns, and product compositions. Deprecations require affected-consumer migrations."))]],
  ];
  for (const [id, inputs, outputs] of canonicalCases) {
    results.set(id, await invokeCase({ root, id, inputs, outputs, checkEvidence }));
  }

  const research = ref("setup-research-plan", "research-plan", "r1", "design/research/setup-plan.json");
  results.set("research", await invokeCase({
    root,
    id: "research",
    inputs: [ref("product", "product", "r2", "design/product.md")],
    outputs: [textOutput(research, JSON.stringify({
      schema: "silver/research-plan/v1",
      id: research.id,
      revision: research.revision,
      status: "planned-not-conducted",
      question: "Can first-time owners predict the result of finishing setup?",
      method: "Moderated task walkthrough",
      participant_criteria: ["Owns workspace setup"],
      sanitation: "Record task-level observations only; exclude names and sensitive workspace data.",
    }, null, 2))],
    checkEvidence,
  }));

  results.set("synthesize", await invokeCase({
    root,
    id: "synthesize",
    inputs: [refs.seed],
    outputs: [
      jsonOutput(refs.finding, working(refs.finding, "Setup consequence is unclear", {
        statement: "The current setup path does not explain what completion changes.",
        evidence_refs: ["seed-feedback@r1"],
        confidence: "medium",
      }, [refs.seed]), "working-artifact.schema.json"),
      jsonOutput(refs.frame, working(refs.frame, "Make setup completion predictable", {
        problem: "First-time owners cannot predict the result of finishing setup.",
        affected_audiences: ["First-time workspace owners"],
        desired_outcomes: ["Explain the saved result before action"],
        open_questions: ["Which explanation is sufficient without adding friction?"],
      }, [refs.seed]), "working-artifact.schema.json"),
    ],
    checkEvidence,
  }));

  results.set("ideate", await invokeCase({
    root,
    id: "ideate",
    inputs: [refs.frame, refs.finding],
    outputs: [
      jsonOutput(refs.concept, working(refs.concept, "Guided setup summary", {
        summary: "Pair the final action with a compact review of what will be saved.",
        testable_claim: "A visible consequence summary increases correct completion predictions.",
        differentiators: ["Consequence-first rather than step-first", "Keeps the decision on one screen"],
      }, [refs.frame, refs.finding]), "working-artifact.schema.json"),
      jsonOutput(refs.hypothesis, working(refs.hypothesis, "Guided setup hypothesis", {
        summary: "A consequence summary supports confident completion.",
        testable_claim: "At least four of five evaluators correctly predict the saved result.",
        differentiators: ["Tests comprehension rather than preference"],
      }, [refs.frame]), "working-artifact.schema.json"),
      jsonOutput(refs.selection, working(refs.selection, "Select guided setup", {
        decision: "Select the guided setup summary for specification.",
        rationale: "It addresses the accepted problem with the cheapest testable mechanism.",
        consequences: ["Add one review screen", "Retain a secondary cancel action"],
        decided_by: "release-fixture-reviewer",
      }, [refs.concept, refs.hypothesis]), "working-artifact.schema.json"),
    ],
    checkEvidence,
  }));

  results.set("specify", await invokeCase({
    root,
    id: "specify",
    inputs: [refs.concept, refs.hypothesis, refs.selection],
    outputs: [jsonOutput(refs.specification, working(refs.specification, "Guided setup specification", {
      outcomes: ["People can predict what finishing setup changes"],
      hypothesis: "A concise consequence summary improves prediction accuracy.",
      scope: ["Final setup review and completion"],
      non_goals: ["Account creation", "Workspace provisioning"],
      requirements: ["Show saved workspace name", "Provide finish and cancel actions", "Announce completion"],
      content_and_data: ["Workspace name", "Setup status"],
      states: ["ready", "complete", "cancelled"],
      edge_cases: ["Workspace name unavailable"],
      accessibility: ["Keyboard operable", "Programmatic heading", "Polite completion announcement"],
      success_criteria: ["Evaluator predicts saved result before acting"],
      decisions: [refs.selection],
      open_questions: [],
    }, [refs.concept, refs.hypothesis, refs.selection]), "working-artifact.schema.json")],
    checkEvidence,
  }));

  const flowValue = {
    schema: "silver/flow/v1",
    id: refs.flow.id,
    title: "Guided setup flow",
    kind: "user",
    scope: "product",
    status: "active",
    revision: 1,
    purpose: "Make setup completion predictable.",
    actors: [{ id: "owner", label: "Workspace owner", type: "user" }],
    desired_outcomes: ["Setup completed with understood consequences"],
    start_nodes: ["review"],
    nodes: [
      { id: "review", type: "screen", title: "Review setup", description: "Show what will be saved." },
      { id: "complete", type: "outcome", title: "Setup complete" },
      { id: "cancelled", type: "outcome", title: "No changes made" },
    ],
    transitions: [
      { id: "finish", from: "review", to: "complete", trigger: "Finish setup" },
      { id: "cancel", from: "review", to: "cancelled", trigger: "Not now" },
    ],
    created: "2026-07-24",
    updated: "2026-07-24",
  };
  results.set("flow", await invokeCase({
    root,
    id: "flow",
    inputs: [refs.specification],
    outputs: [textOutput(refs.flow, JSON.stringify(flowValue, null, 2))],
    checkEvidence,
  }));

  results.set("sketch", await invokeCase({
    root,
    id: "sketch",
    inputs: [refs.concept, refs.specification, refs.flow],
    outputs: [jsonOutput(refs.sketch, working(refs.sketch, "Guided setup alternatives", {
      fidelity: "low",
      constraint_profile: "constrained",
      question: "Which structure makes the consequence and action clearest?",
      view_path: "design/work/sketches/guided-setup/index.html",
      alternatives: [
        { title: "Single focus", summary: "One centered consequence and action.", tradeoff: "Less context remains visible." },
        { title: "Review card", summary: "Saved details sit beside the action.", tradeoff: "More information to scan." },
      ],
    }, [refs.concept, refs.specification, refs.flow]), "working-artifact.schema.json")],
    checkEvidence,
  }));
  await renderSketch({ root, artifact: refs.sketch.path, output: "design/work/sketches/guided-setup/index.html" });

  results.set("component", await invokeCase({
    root,
    id: "component",
    inputs: [refs.specification, refs.flow, refs.sketch],
    outputs: [jsonOutput(refs.component, working(refs.component, "Setup review card", {
      classification: "product-composition",
      anatomy: ["Heading", "Consequence summary", "Status", "Primary action", "Secondary action"],
      states: ["ready", "complete", "cancelled"],
      behavior: ["Finish announces completion", "Cancel confirms no change"],
      accessibility: ["Named region", "Visible focus", "Polite status"],
      catalog_disposition: "Keep product-specific until repeated use is demonstrated.",
    }, [refs.specification, refs.flow, refs.sketch]), "working-artifact.schema.json")],
    checkEvidence,
  }));

  const prototypeValue = {
    id: refs.prototype.id,
    kind: refs.prototype.kind,
    revision: refs.prototype.revision,
    question: "Can a person predict and complete setup?",
    constraint_profile: "constrained",
    sources: [refs.specification, refs.flow, refs.sketch],
    accepted_findings: [],
  };
  results.set("prototype", await invokeCase({
    root,
    id: "prototype",
    inputs: [refs.specification, refs.flow, refs.sketch],
    outputs: [jsonOutput(refs.prototype, prototypeValue)],
    checkEvidence,
  }));
  await initPrototype({
    root,
    id: "guided-setup",
    title: "Guided setup prototype",
    question: prototypeValue.question,
    flowRefs: [`${refs.flow.id}@1=${refs.flow.path}`],
    date: "2026-07-24",
  });
  await renderStaticPrototype({
    root,
    prototype: "prototypes/guided-setup",
    flow: refs.flow.path,
  });

  results.set("evaluate", await invokeCase({
    root,
    id: "evaluate",
    inputs: [refs.sketch, refs.prototype, refs.specification],
    outputs: [
      jsonOutput(refs.observation, working(refs.observation, "Expert walkthrough observation", {
        sanitized: true,
        observation: "The completion status appears only after the action.",
        interpretation: "A pre-action consequence sentence may improve prediction.",
      }, [refs.prototype]), "working-artifact.schema.json"),
      jsonOutput(refs.evaluation, working(refs.evaluation, "Guided setup evaluation", {
        question: "Can a person predict what finishing setup changes?",
        method: "Sanitized expert walkthrough; no participant study was conducted.",
        tasks: ["Explain what Finish setup will change", "Complete the flow"],
        observations: [refs.observation],
        findings: ["Consequence copy should precede the action"],
        recommendations: ["Move the saved-result sentence above the actions"],
      }, [refs.prototype, refs.specification]), "working-artifact.schema.json"),
      jsonOutput(refs.evaluationFinding, working(refs.evaluationFinding, "Consequence copy needs earlier placement", {
        statement: "The saved-result consequence should appear before the completion action.",
        evidence_refs: ["setup-observation@r1"],
        confidence: "medium",
      }, [refs.observation, refs.evaluation]), "working-artifact.schema.json"),
    ],
    checkEvidence,
  }));

  const refinedPrototype = ref(
    refs.prototype.id,
    "prototype",
    "r2",
    "prototypes/guided-setup/revisions/r2.json",
  );
  const refinedValue = {
    ...prototypeValue,
    revision: "r2",
    sources: [...prototypeValue.sources, refs.evaluationFinding],
    accepted_findings: [refs.evaluationFinding],
    refinement: "Moved the saved-result sentence before the completion actions.",
  };
  const prototypeContract = parse(await readFile(path.join(root, ".skills/prototype/skill.yaml"), "utf8"));
  const refinedOutput = await prepareOutputs(root, [jsonOutput(refinedPrototype, refinedValue)]);
  const refinedResult = await invokeSkill({
    root,
    skillDirectory: path.join(root, ".skills/prototype"),
    request: {
      schema: "silver/skill-invocation/v2",
      invocation_id: "prototype-refinement",
      skill: { id: "prototype", version: "0.2.0" },
      started_at: time,
      inputs: [refs.specification, refs.flow, refs.sketch, refs.evaluationFinding],
      outputs: refinedOutput,
      permission_layers: layers(),
      available_providers: [],
      approvals: [],
      relaxations: [],
      checks: checksFor(prototypeContract, checkEvidence),
      unresolved_questions: [],
      acceptance: { status: "accepted", reviewer: "release-fixture-reviewer", recorded_at: completed },
    },
    completedAt: completed,
  });
  assert.equal(refinedResult.execution.status, "complete");
  await renderStaticPrototype({ root, prototype: "prototypes/guided-setup", flow: refs.flow.path, replace: true });

  const secondEvaluation = ref("setup-re-evaluation", "evaluation", "r1", "design/work/evaluations/setup-re-evaluation.json");
  const evaluateContract = parse(await readFile(path.join(root, ".skills/evaluate/skill.yaml"), "utf8"));
  const secondOutput = jsonOutput(secondEvaluation, working(secondEvaluation, "Guided setup re-evaluation", {
    question: "Does the refined view place the consequence before action?",
    method: "Deterministic inspection and sanitized expert walkthrough.",
    tasks: ["Locate consequence copy", "Complete the flow"],
    observations: [refs.observation],
    findings: ["Consequence copy now precedes the primary action"],
    recommendations: ["Proceed to the local production recipe"],
  }, [refinedPrototype, refs.evaluationFinding]));
  secondOutput.schema_name = "working-artifact.schema.json";
  const secondEvalResult = await invokeSkill({
    root,
    skillDirectory: path.join(root, ".skills/evaluate"),
    request: {
      schema: "silver/skill-invocation/v2",
      invocation_id: "evaluate-refinement",
      skill: { id: "evaluate", version: "0.2.0" },
      started_at: time,
      inputs: [refinedPrototype, refs.specification],
      outputs: [secondOutput],
      permission_layers: layers(),
      available_providers: [],
      approvals: [],
      relaxations: [],
      checks: checksFor(evaluateContract, checkEvidence),
      unresolved_questions: [],
      acceptance: { status: "accepted", reviewer: "release-fixture-reviewer", recorded_at: completed },
    },
    completedAt: completed,
  });
  assert.equal(secondEvalResult.execution.status, "complete");

  results.set("pitch", await invokeCase({
    root,
    id: "pitch",
    inputs: [refs.evaluationFinding, secondEvaluation, refs.specification, refinedPrototype],
    outputs: [
      jsonOutput(refs.changeCase, working(refs.changeCase, "Make setup completion predictable", {
        mode: "proposal",
        before: "The completion consequence is implicit.",
        reasons: ["Accepted finding setup-evaluation-finding@r1"],
        after: "The saved result is stated before the completion action.",
        impact: { kind: "estimated", claim: "Fewer incorrect completion predictions", confidence: "medium", source: "setup-re-evaluation@r1" },
        tradeoffs: ["Adds one sentence to the review state"],
        decision_request: "Approve production implementation of the refined guided setup.",
      }, [refs.evaluationFinding, secondEvaluation, refs.specification, refinedPrototype]), "working-artifact.schema.json"),
      jsonOutput(refs.presentation, working(refs.presentation, "Guided setup presentation view", {
        format: "html",
        view_path: "presentations/guided-setup/index.html",
        change_case_revision: "r1",
        presentation_kit_revision: "r1",
      }, [refs.changeCase, ref("project-presentation-kit", "presentation-kit", "r1", "design/presentation-kit/kit.json")]), "working-artifact.schema.json"),
    ],
    checkEvidence,
  }));
  await renderPresentation({
    root,
    changeCase: refs.changeCase.path,
    kit: "design/presentation-kit/kit.json",
    output: "presentations/guided-setup/index.html",
  });

  results.set("implement", await invokeCase({
    root,
    id: "implement",
    inputs: [refs.specification, refs.flow, refs.component, secondEvaluation, refinedPrototype],
    outputs: [
      jsonOutput(refs.handoff, working(refs.handoff, "Guided setup implementation handoff", {
        recipe: "static-html",
        readiness: "ready",
        accepted_intent: [refs.specification, refs.component, secondEvaluation],
        required_checks: ["semantic-styles", "production-readiness", "accessibility", "responsive-behavior", "critical-interactions"],
        missing_intent: [],
        content: {
          title: "Workspace setup",
          heading: "Finish setting up your workspace",
          body: "Finishing saves these settings for everyone in this workspace.",
          primary_action: "Finish setup",
          secondary_action: "Not now",
          completion_message: "Workspace setup is complete.",
        },
      }, [refs.specification, refs.component, secondEvaluation, refinedPrototype], "accepted", "codebase"), "working-artifact.schema.json"),
      textOutput(refs.implementation, JSON.stringify({
        id: refs.implementation.id,
        kind: refs.implementation.kind,
        revision: refs.implementation.revision,
        recipe: "static-html",
        handoff: refs.handoff,
      }, null, 2)),
    ],
    checkEvidence,
    providers: [{ capability: "production-source", provider: "silver-local", available: true }],
  }));
  await renderStaticImplementation({ root, handoff: refs.handoff.path, output: "production/guided-setup" });

  results.set("design-check", await invokeCase({ root, id: "design-check", checkEvidence }));

  const manifestPath = path.join(root, "design/manifest.yaml");
  const manifest = parse(await readFile(manifestPath, "utf8"));
  for (const [id, targetRoot] of [
    ["sketch-guided-setup", "design/work/sketches/guided-setup"],
    ["prototype-guided-setup", "prototypes/guided-setup"],
    ["presentation-guided-setup", "presentations/guided-setup"],
    ["production-guided-setup", "production/guided-setup"],
  ]) {
    manifest.implementation_profiles[id] = { recipe: "static-html", root: targetRoot };
    manifest.checks.render_targets.push({
      id,
      profile: id,
      path: "/index.html",
      viewports: [{ width: 375, height: 812 }, { width: 1280, height: 800 }],
    });
  }
  await writeFile(manifestPath, stringify(manifest), "utf8");

  const fast = await runFastSuite({ root });
  assert.equal(fast.status, "pass", JSON.stringify(fast, null, 2));
  const browser = await runBrowserSuite({ root, chromePath: options.chromePath });
  assert.equal(browser.status, "pass", JSON.stringify(browser, null, 2));

  const playbook = parse(await readFile(path.join(root, ".silver/playbooks/default-design-loop.yaml"), "utf8"));
  let state = createPlaybookState({
    playbook,
    runId: "complete-loop",
    inputs: [refs.seed],
    options: { "include-flow": true, "include-sketch": true, "include-prototype": true, "include-pitch": true, "include-implementation": true },
    now: time,
  });
  state = recordNodeResult({ playbook, state, nodeId: "synthesize", result: results.get("synthesize"), now: completed });
  state = recordNodeResult({ playbook, state, nodeId: "ideate", result: results.get("ideate"), now: completed });
  assert.equal(state.status, "paused");
  await writeJson(root, ".silver/playbooks/runs/complete-loop-paused.json", state);
  state = resolveCheckpoint({
    playbook,
    state: JSON.parse(await readFile(path.join(root, ".silver/playbooks/runs/complete-loop-paused.json"), "utf8")),
    checkpointId: "select-direction",
    accepted: true,
    resolution: "Selected guided setup.",
    now: completed,
  });
  state = recordNodeResult({ playbook, state, nodeId: "specify", result: results.get("specify"), now: completed });
  const invalidated = resumePlaybook({
    playbook,
    state: JSON.parse(JSON.stringify(state)),
    currentArtifacts: [refs.seed, { ...refs.finding, revision: "r2" }, refs.frame, refs.concept, refs.hypothesis, refs.selection, refs.specification],
    now: completed,
  });
  assert.equal(invalidated.status, "paused");
  assert.ok(invalidated.invalidations.length > 0);
  await writeJson(root, ".silver/playbooks/runs/complete-loop-invalidated.json", invalidated);

  return {
    schema: "silver/complete-blank-scenario/v1",
    status: "pass",
    skills: [...results.keys()],
    positive_results: [...results.values()].map(({ invocation_id }) => invocation_id),
    boundary_results: [...results.keys()].filter((id) => id !== "design-check").map((id) => `${id}-boundary`),
    refinement_results: [refinedResult.invocation_id, secondEvalResult.invocation_id],
    fast: fast.status,
    browser: browser.status,
    playbook: { paused: true, resumed: true, invalidated: true },
  };
}

async function main() {
  const rootIndex = process.argv.indexOf("--root");
  const root = rootIndex >= 0 ? process.argv[rootIndex + 1] : process.cwd();
  try {
    const result = await runCompleteBlankScenario({ root });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
) await main();
