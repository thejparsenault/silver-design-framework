#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import { runGit } from "../runtime/git.mjs";

import { invokeSkill } from "../runtime/invoke-skill.mjs";
import { runContractChecks } from "../../installer/checks.mjs";
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
import { buildVisualizationHtml } from "../skills/visualize/scripts/render-visualization.mjs";
import { renderFlowFile } from "../skills/flow/scripts/render-flow.mjs";
import { renderMap } from "../skills/map/scripts/render-map.mjs";
import { renderSystemCatalog } from "../skills/system/scripts/render-system-catalog.mjs";
import { inspectWorkspace } from "../skills/what-now/scripts/analyze-workspace.mjs";
import { writeGuidanceRegistry } from "../../installer/guidance.mjs";
import { traceArtifact } from "../../installer/trace.mjs";

const time = "2026-07-24T20:00:00Z";
const completed = "2026-07-24T20:00:01Z";
const allActions = ["read", "inspect", "execute", "create", "write", "update"];
const allPaths = ["design/**", "prototypes/**", "presentations/**", "production/**", ".silver/**"];
const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ref = (id, kind, revision, artifactPath) => ({ id, kind, revision, path: artifactPath });
const hash = (content) => `sha256:${createHash("sha256").update(content).digest("hex")}`;

function selectedIntegrity(relativePath, content) {
  const digest = createHash("sha256");
  digest.update(relativePath);
  digest.update("\0");
  digest.update(content);
  digest.update("\0");
  return `sha256:${digest.digest("hex")}`;
}

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

function provenance(
  reason,
  designContexts = [],
  sources = [],
  {
    guidance = [],
    linkedSources = [],
    externalBindings = [],
  } = {},
) {
  return {
    schema: "silver/provenance/v1",
    origin: "agent-assisted",
    recorded_at: time,
    contributors: [{ kind: "agent", id: "silver-release-fixture" }],
    practice: {
      id: "my-practice",
      revision: "r1",
      methods: [],
    },
    guidance,
    linked_sources: linkedSources,
    design_contexts: designContexts,
    change: { reason },
    external_bindings: externalBindings,
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

async function invokeCase({
  root,
  id,
  sources = [],
  outputs = [],
  checkEvidence,
  providers = [],
  recommendedNextActions,
  provenanceSources,
  provenanceMetadata,
}) {
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
    skill: { id, version: "0.10.0" },
    started_at: time,
    sources,
    outputs: positiveOutputs,
    provenance: provenance(
      `Recorded by the ${id} release-fixture invocation.`,
      [
        ref(
          "default-design-context",
          "design-context",
          "r1",
          "design/contexts/default.yaml",
        ),
      ],
      provenanceSources ?? sources,
      provenanceMetadata,
    ),
    available_providers: providers,
    approvals,
    relaxations: [],
    checks: checksFor(contract, checkEvidence),
    unresolved_questions: [],
    ...(recommendedNextActions
      ? { recommended_next_actions: recommendedNextActions }
      : {}),
    ...(contract.completion.review.required
      ? { acceptance: { status: "accepted", reviewer: "release-fixture-reviewer", recorded_at: completed } }
      : {}),
  };

  if (["design-check", "what-now"].includes(id)) {
    const result = await invokeSkill({
      root,
      skillDirectory,
      request: {
        ...base,
        invocation_id:
          id === "design-check"
            ? "design-check-local-degraded"
            : "what-now-positive",
      },
      completedAt: completed,
      runChecks: ({ root: checkRoot, contract: checkContract }) =>
        runContractChecks({ root: checkRoot, contract: checkContract, now: completed }),
    });
    assert.ok(
      ["complete", "complete-with-findings"].includes(result.execution.status),
      JSON.stringify(result, null, 2),
    );
    if (id === "design-check") {
      // Before 0.9 this asserted `browser` was always degraded, which was only
      // true because no provider served it. Now `silver-browser-local` does,
      // when a Chrome is installed — so the honest invariant is that browser
      // coverage is either present or explained, never an unattributed absence.
      const browser = result.degraded_capabilities.find(
        ({ capability }) => capability === "browser",
      );
      if (browser) {
        assert.ok(
          browser.reason && browser.reason.length > 0,
          "a degraded browser capability must say why, not just report the gap",
        );
      }
    }
    return result;
  }

  const boundaryRequest = structuredClone({
    ...base,
    invocation_id: `${id}-boundary`,
    outputs: positiveOutputs.map(({ expected_integrity, ...output }) => output),
    approvals: [],
  });
  boundaryRequest.outputs[0].reference.path =
    `design/undeclared-boundary/${id}.json`;
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
    runChecks: ({ root: checkRoot, contract: checkContract }) =>
      runContractChecks({ root: checkRoot, contract: checkContract, now: completed }),
  });
  assert.ok(
    ["complete", "complete-with-findings", "complete-awaiting-verification"].includes(
      result.execution.status,
    ),
    JSON.stringify(result, null, 2),
  );
  assert.ok(result.recommended_next_actions.every(({ automatic }) => automatic === false));
  assert.ok(
    result.readiness.every(({ status }) =>
      ["ready", "not-ready", "not-applicable"].includes(status),
    ),
  );
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
  const visualization = ref("guided-setup-visualization", "visualization", "r1", "design/work/visualizations/guided-setup/visualization.json");
  const visualizationRender = ref("guided-setup-visualization-render", "x-visualization-render", "r1", "design/work/visualizations/guided-setup/index.html");
  const component = ref("setup-card", "component-proposal", "r1", "design/work/components/setup-card.json");
  const prototype = ref("guided-setup", "prototype", "r1", "prototypes/guided-setup/prototype.json");
  const observation = ref("setup-observation", "observation", "r1", "design/evidence/setup-observation.json");
  const evaluation = ref("setup-evaluation", "evaluation", "r1", "design/work/evaluations/setup-evaluation.json");
  const evaluationFinding = ref("setup-evaluation-finding", "finding", "r1", "design/work/findings/setup-evaluation-finding.json");
  const journeyMap = ref("guided-setup-journey", "map", "r1", "design/maps/guided-setup/map.json");
  const practiceChange = ref("evidence-labeling-practice", "practice-change", "r1", "design/work/practice-changes/evidence-labeling.json");
  const changeCase = ref("guided-setup-change-case", "change-case", "r1", "design/pitches/guided-setup/change-case.json");
  const presentation = ref("guided-setup-presentation", "presentation-view", "r1", "presentations/guided-setup/view.json");
  const handoff = ref("guided-setup-handoff", "implementation-handoff", "r1", "design/work/implementation-handoffs/guided-setup.json");
  const implementation = ref("guided-setup-implementation", "implementation", "r1", "production/guided-setup/intent.json");
  return { seed, finding, frame, concept, hypothesis, selection, specification, flow, visualization, visualizationRender, component, prototype, observation, evaluation, evaluationFinding, journeyMap, practiceChange, changeCase, presentation, handoff, implementation };
}

export async function runCompleteBlankScenario(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  await runGit(root, ["init"]);
  const workspaceId = parse(
    await readFile(path.join(root, "design/manifest.yaml"), "utf8"),
  ).workspace.id;
  const guidancePath = "design/guidance/README.md";
  const guidanceContent = await readFile(path.join(root, guidancePath));
  const guidancePin = {
    id: "fixture-design-guidance",
    revision: "snapshot-r1",
    integrity: selectedIntegrity(guidancePath, guidanceContent),
  };
  await writeGuidanceRegistry(root, [
    {
      schema: "silver/guidance-source/v1",
      id: guidancePin.id,
      title: "Fixture design guidance",
      source: {
        type: "local-snapshot",
        reference: root,
        revision: guidancePin.revision,
        integrity: guidancePin.integrity,
        paths: [guidancePath],
      },
      influence: "preferred",
      scope: { products: [workspaceId] },
      linked_at: time,
      linked_by: "release-fixture-owner",
    },
  ]);
  const refs = artifactOutputs();
  await writeJson(
    root,
    refs.seed.path,
    working(refs.seed, "Seed feedback", {
      source_pin: {
        source: "Supplied release-fixture feedback",
        query: "What blocks completing setup?",
        retrieved_at: time,
        sanitized: true,
      },
      observation: "The existing setup example does not explain what completion changes.",
    }),
  );
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
  for (const [id, sources, outputs] of canonicalCases) {
    results.set(id, await invokeCase({ root, id, sources, outputs, checkEvidence }));
  }
  await renderSystemCatalog({ root, replace: true });

  const research = ref("setup-research-plan", "research-plan", "r1", "design/research/setup-plan.json");
  results.set("research", await invokeCase({
    root,
    id: "research",
    sources: [ref("product", "product", "r2", "design/product.md")],
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
    sources: [refs.seed],
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
    sources: [refs.frame, refs.finding],
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
      }, [refs.frame, refs.finding]), "working-artifact.schema.json"),
      jsonOutput(refs.selection, working(refs.selection, "Select guided setup", {
        decision: "Select the guided setup summary for specification.",
        rationale: "It addresses the accepted problem with the cheapest testable mechanism.",
        consequences: ["Add one review screen", "Retain a secondary cancel action"],
        decided_by: "release-fixture-reviewer",
      }, [refs.frame, refs.finding]), "working-artifact.schema.json"),
    ],
    checkEvidence,
  }));

  results.set("specify", await invokeCase({
    root,
    id: "specify",
    sources: [refs.concept, refs.hypothesis, refs.selection],
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
    revision: "r1",
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
    sources: [refs.specification],
    outputs: [textOutput(refs.flow, JSON.stringify(flowValue, null, 2))],
    checkEvidence,
  }));
  await renderFlowFile(
    path.join(root, refs.flow.path),
    path.join(root, "design/flows/guided-setup/flow.mmd"),
  );

  const visualizationValue = working(refs.visualization, "Guided setup alternatives", {
    fidelity: "low",
    constraint_profile: "constrained",
    question: "Which structure makes the consequence and action clearest?",
    renders: [{
      id: "primary",
      primary: true,
      medium: "local",
      format: "html",
      path: refs.visualizationRender.path,
    }],
    alternatives: [
      { title: "Single focus", summary: "One centered consequence and action.", tradeoff: "Less context remains visible." },
      { title: "Review card", summary: "Saved details sit beside the action.", tradeoff: "More information to scan." },
    ],
  }, [refs.concept, refs.specification, refs.flow]);
  const visualizationHtml = await buildVisualizationHtml({
    root,
    visualization: visualizationValue,
    output: refs.visualizationRender.path,
  });
  results.set("visualize", await invokeCase({
    root,
    id: "visualize",
    sources: [refs.concept, refs.specification, refs.flow],
    outputs: [
      jsonOutput(refs.visualization, visualizationValue, "working-artifact.schema.json"),
      textOutput(refs.visualizationRender, visualizationHtml),
    ],
    checkEvidence,
  }));

  results.set("component", await invokeCase({
    root,
    id: "component",
    sources: [refs.specification, refs.flow, refs.visualization],
    outputs: [jsonOutput(refs.component, working(refs.component, "Setup review card", {
      classification: "product-composition",
      anatomy: ["Heading", "Consequence summary", "Status", "Primary action", "Secondary action"],
      states: ["ready", "complete", "cancelled"],
      behavior: ["Finish announces completion", "Cancel confirms no change"],
      accessibility: ["Named region", "Visible focus", "Polite status"],
      catalog_disposition: "Keep product-specific until repeated use is demonstrated.",
    }, [refs.specification, refs.flow, refs.visualization]), "working-artifact.schema.json")],
    checkEvidence,
  }));

  const { metadata: prototypeMetadata } = await initPrototype({
    root,
    id: "guided-setup",
    title: "Guided setup prototype",
    question: "Can a person predict and complete setup?",
    sources: [
      `${refs.specification.id}:${refs.specification.kind}@${refs.specification.revision}=${refs.specification.path}`,
      `${refs.flow.id}:flow@${refs.flow.revision}=${refs.flow.path}`,
      `${refs.visualization.id}:${refs.visualization.kind}@${refs.visualization.revision}=${refs.visualization.path}`,
    ],
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
    sources: [refs.visualization, refs.prototype, refs.specification],
    outputs: [
      jsonOutput(refs.observation, working(refs.observation, "Expert walkthrough observation", {
        sanitized: true,
        observation: "The completion status appears only after the action.",
        interpretation: "A pre-action consequence sentence may improve prediction.",
      }, [refs.visualization, refs.prototype, refs.specification]), "working-artifact.schema.json"),
      jsonOutput(refs.evaluation, working(refs.evaluation, "Guided setup evaluation", {
        question: "Can a person predict what finishing setup changes?",
        method: "Sanitized expert walkthrough; no participant study was conducted.",
        tasks: ["Explain what Finish setup will change", "Complete the flow"],
        observations: [refs.observation],
        findings: ["Consequence copy should precede the action"],
        recommendations: ["Move the saved-result sentence above the actions"],
      }, [refs.visualization, refs.prototype, refs.specification]), "working-artifact.schema.json"),
      jsonOutput(refs.evaluationFinding, working(refs.evaluationFinding, "Consequence copy needs earlier placement", {
        statement: "The saved-result consequence should appear before the completion action.",
        evidence_refs: ["setup-observation@r1"],
        confidence: "medium",
      }, [refs.visualization, refs.prototype, refs.specification]), "working-artifact.schema.json"),
    ],
    checkEvidence,
  }));

  // A prototype's revision is bumped in place on the same canonical file,
  // exactly like every other artifact kind — there is no separate per-revision
  // snapshot file.
  const refinedPrototype = ref(
    refs.prototype.id,
    "prototype",
    "r2",
    refs.prototype.path,
  );
  const refinedValue = {
    ...prototypeMetadata,
    revision: "r2",
    sources: [...(prototypeMetadata.sources ?? []), refs.evaluationFinding],
  };
  const prototypeContract = parse(await readFile(path.join(root, ".skills/prototype/skill.yaml"), "utf8"));
  const refinedOutput = await prepareOutputs(root, [jsonOutput(refinedPrototype, refinedValue)]);
  const refinedResult = await invokeSkill({
    root,
    skillDirectory: path.join(root, ".skills/prototype"),
    request: {
      schema: "silver/skill-invocation/v2",
      invocation_id: "prototype-refinement",
      skill: { id: "prototype", version: "0.10.0" },
      started_at: time,
      sources: [refs.specification, refs.flow, refs.visualization, refs.evaluationFinding],
      outputs: refinedOutput,
      provenance: provenance(
        "Refined the prototype from an accepted evaluation finding.",
        [
          ref(
            "default-design-context",
            "design-context",
            "r1",
            "design/contexts/default.yaml",
          ),
        ],
        [refs.specification, refs.flow, refs.visualization, refs.evaluationFinding],
      ),
      permission_layers: layers(),
      available_providers: [],
      approvals: [],
      relaxations: [],
      checks: checksFor(prototypeContract, checkEvidence),
      unresolved_questions: [],
      acceptance: { status: "accepted", reviewer: "release-fixture-reviewer", recorded_at: completed },
    },
    completedAt: completed,
    runChecks: ({ root: checkRoot, contract: checkContract }) =>
      runContractChecks({ root: checkRoot, contract: checkContract, now: completed }),
  });
  assert.equal(refinedResult.execution.status, "complete-awaiting-verification");
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
  }, [refinedPrototype, refs.specification]));
  secondOutput.schema_name = "working-artifact.schema.json";
  const secondEvalResult = await invokeSkill({
    root,
    skillDirectory: path.join(root, ".skills/evaluate"),
    request: {
      schema: "silver/skill-invocation/v2",
      invocation_id: "evaluate-refinement",
      skill: { id: "evaluate", version: "0.10.0" },
      started_at: time,
      sources: [refinedPrototype, refs.specification],
      outputs: [secondOutput],
      provenance: provenance(
        "Re-evaluated the accepted prototype refinement.",
        [
          ref(
            "default-design-context",
            "design-context",
            "r1",
            "design/contexts/default.yaml",
          ),
        ],
        [refinedPrototype, refs.specification],
      ),
      permission_layers: layers(),
      available_providers: [],
      approvals: [],
      relaxations: [],
      checks: checksFor(evaluateContract, checkEvidence),
      unresolved_questions: [],
      acceptance: { status: "accepted", reviewer: "release-fixture-reviewer", recorded_at: completed },
    },
    completedAt: completed,
    runChecks: ({ root: checkRoot, contract: checkContract }) =>
      runContractChecks({ root: checkRoot, contract: checkContract, now: completed }),
  });
  assert.equal(secondEvalResult.execution.status, "complete");

  const designContext = ref(
    "default-design-context",
    "design-context",
    "r1",
    "design/contexts/default.yaml",
  );
  const mapArtifact = {
    schema: "silver/map/v1",
    id: refs.journeyMap.id,
    kind: refs.journeyMap.kind,
    revision: refs.journeyMap.revision,
    sources: [designContext, refs.seed, refs.evaluation],
    title: "Guided setup journey",
    map_type: "journey",
    state: "current",
    question: "How does a workspace owner understand and finish setup?",
    actors: [{ id: "workspace-owner", title: "Workspace owner" }],
    stages: [
      { id: "review", title: "Review" },
      { id: "finish", title: "Finish" },
    ],
    lanes: [
      { id: "actions", title: "Actions", kind: "actor-action" },
      { id: "touchpoints", title: "Touchpoints", kind: "touchpoint" },
    ],
    items: [
      {
        id: "review-summary",
        stage: "review",
        lane: "actions",
        title: "Review what setup will save",
        actor: "workspace-owner",
        evidence: [refs.seed],
        assumption: false,
        pain_points: ["The saved result was previously unclear."],
        opportunities: ["Explain the consequence before the action."],
      },
      {
        id: "finish-action",
        stage: "finish",
        lane: "touchpoints",
        title: "Finish setup",
        evidence: [],
        assumption: true,
        pain_points: [],
        opportunities: ["Confirm completion."],
      },
    ],
    connections: [
      {
        from: "review-summary",
        to: "finish-action",
        relationship: "Builds confidence to continue",
      },
    ],
    design_contexts: [designContext],
    primary_context: designContext.id,
    provenance: provenance(
      "Mapped the accepted setup evidence.",
      [designContext],
      [refs.seed, refs.evaluation],
      {
        guidance: [guidancePin],
        externalBindings: ["guided-map-figma"],
      },
    ),
  };
  await mkdir(path.join(root, "design/integrations"), { recursive: true });
  await writeFile(
    path.join(root, "design/integrations/guided-map-figma.yaml"),
    stringify({
      schema: "silver/representation-binding/v2",
      id: "guided-map-figma",
      artifact: refs.journeyMap,
      counterpart: {
        type: "provider",
        provider: "figma",
        object_id: "fixture-map-node",
        revision: "v1",
      },
      adapter: { id: "silver-figma", version: "0.10.0" },
      authority: "workspace-authoritative",
      round_trip: "read-only",
      sync_policy: "manual",
      base: { state: "uninitialized" },
    }),
  );
  results.set("map", await invokeCase({
    root,
    id: "map",
    sources: [designContext, refs.seed, refs.evaluation],
    outputs: [
      jsonOutput(refs.journeyMap, mapArtifact, "map.schema.json"),
    ],
    checkEvidence,
    provenanceMetadata: {
      guidance: [guidancePin],
      externalBindings: ["guided-map-figma"],
    },
  }));
  await renderMap({
    root,
    map: refs.journeyMap.path,
    output: "design/maps/guided-setup/index.html",
  });
  const externalSnapshotPath =
    ".silver/results/reconciliation/snapshots/guided-map-figma-base.json";
  const externalSnapshot = `${JSON.stringify(
    {
      schema: "silver/external-map-fixture/v1",
      id: "guided-map-figma",
      provider_revision: "v1",
      map: refs.journeyMap,
    },
    null,
    2,
  )}\n`;
  await mkdir(path.dirname(path.join(root, externalSnapshotPath)), {
    recursive: true,
  });
  await writeFile(path.join(root, externalSnapshotPath), externalSnapshot);
  await writeFile(
    path.join(root, "design/integrations/guided-map-figma.yaml"),
    stringify({
      schema: "silver/representation-binding/v2",
      id: "guided-map-figma",
      artifact: refs.journeyMap,
      counterpart: {
        type: "provider",
        provider: "figma",
        object_id: "fixture-map-node",
        revision: "v1",
      },
      adapter: { id: "silver-figma", version: "0.10.0" },
      authority: "workspace-authoritative",
      round_trip: "read-only",
      sync_policy: "manual",
      base: {
        state: "initialized",
        local: {
          state: "present",
          revision: refs.journeyMap.revision,
          integrity: hash(
          await readFile(path.join(root, refs.journeyMap.path)),
          ),
        },
        external: { state: "present", revision: "v1", integrity: hash(externalSnapshot) },
        at: time,
      },
    }),
  );

  const practiceProposal = {
    schema: "silver/practice-change/v1",
    id: refs.practiceChange.id,
    kind: refs.practiceChange.kind,
    revision: refs.practiceChange.revision,
    expected_practice_revision: "r1",
    summary: "Keep assumptions distinguishable from evidence",
    reason: "The accepted evaluation was clearer when claims retained their evidence status.",
    updates: [
      {
        section: "quality",
        content: "Label assumptions and preserve evidence links in durable design artifacts.",
      },
    ],
    sanitization: {
      reviewed: true,
      removed: ["Fixture product details"],
    },
    provenance: provenance(
      "Generalized a reusable lesson from accepted evaluation.",
      [designContext],
      [refs.evaluation, refs.evaluationFinding],
    ),
  };
  results.set("practice-review", await invokeCase({
    root,
    id: "practice-review",
    sources: [refs.evaluation, refs.evaluationFinding],
    outputs: [
      jsonOutput(
        refs.practiceChange,
        practiceProposal,
        "practice-change.schema.json",
      ),
    ],
    checkEvidence,
  }));

  results.set("pitch", await invokeCase({
    root,
    id: "pitch",
    sources: [refs.evaluationFinding, secondEvaluation, refs.specification, refinedPrototype, refs.journeyMap],
    outputs: [
      jsonOutput(refs.changeCase, working(refs.changeCase, "Make setup completion predictable", {
        mode: "proposal",
        before: "The completion consequence is implicit.",
        reasons: ["Accepted finding setup-evaluation-finding@r1"],
        after: "The saved result is stated before the completion action.",
        impact: { kind: "estimated", claim: "Fewer incorrect completion predictions", confidence: "medium", source: "setup-re-evaluation@r1" },
        tradeoffs: ["Adds one sentence to the review state"],
        decision_request: "Approve production implementation of the refined guided setup.",
      }, [refs.evaluationFinding, secondEvaluation, refs.specification, refinedPrototype, refs.journeyMap]), "working-artifact.schema.json"),
      jsonOutput(refs.presentation, working(refs.presentation, "Guided setup presentation view", {
        format: "html",
        view_path: "presentations/guided-setup/index.html",
        change_case_revision: "r1",
        presentation_kit_revision: "r1",
      }, [refs.evaluationFinding, secondEvaluation, refs.specification, refinedPrototype, refs.journeyMap]), "working-artifact.schema.json"),
    ],
    checkEvidence,
    provenanceMetadata: {
      guidance: [guidancePin],
      externalBindings: ["guided-map-figma"],
    },
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
    sources: [refs.specification, refs.flow, refs.component, secondEvaluation, refinedPrototype, refs.journeyMap],
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
      }, [refs.specification, refs.flow, refs.component, secondEvaluation, refinedPrototype, refs.journeyMap], "accepted", "codebase"), "working-artifact.schema.json"),
      textOutput(refs.implementation, JSON.stringify({
        id: refs.implementation.id,
        kind: refs.implementation.kind,
        revision: refs.implementation.revision,
        recipe: "static-html",
        handoff: refs.handoff,
      }, null, 2)),
    ],
    checkEvidence,
    providers: [],
    provenanceMetadata: {
      guidance: [guidancePin],
      externalBindings: ["guided-map-figma"],
    },
  }));
  await renderStaticImplementation({ root, handoff: refs.handoff.path, output: "production/guided-setup" });

  results.set("design-check", await invokeCase({
    root,
    id: "design-check",
    sources: [refs.journeyMap, refs.handoff],
    checkEvidence,
    provenanceSources: [refs.journeyMap, refs.handoff],
    provenanceMetadata: {
      guidance: [guidancePin],
      externalBindings: ["guided-map-figma"],
    },
  }));
  const whatNowAnalysis = await inspectWorkspace(root, new Date(completed));
  results.set(
    "what-now",
    await invokeCase({
      root,
      id: "what-now",
      checkEvidence,
      recommendedNextActions: whatNowAnalysis.invocation_recommendations,
    }),
  );

  const manifestPath = path.join(root, "design/manifest.yaml");
  const manifest = parse(await readFile(manifestPath, "utf8"));
  for (const [id, targetRoot] of [
    ["visualization-guided-setup", "design/work/visualizations/guided-setup"],
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
    sources: [refs.seed],
    options: { "include-flow": true, "include-visualize": true, "include-prototype": true, "include-pitch": true, "include-implementation": true },
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
  const mapTrace = await traceArtifact({
    root,
    target: refs.journeyMap.id,
  });
  const implementationResult = results.get("implement");
  const qaResult = results.get("design-check");
  assert.equal(implementationResult.git_checkpoint.status, "committed");
  assert.deepEqual(mapTrace.guidance, [guidancePin]);
  for (const pins of [mapTrace.provenance.external_bindings, qaResult.provenance.external_bindings]) {
    assert.equal(pins[0].id, "guided-map-figma");
    assert.equal(pins[0].path, "design/integrations/guided-map-figma.yaml");
    assert.match(pins[0].integrity, /^sha256:[a-f0-9]{64}$/);
  }

  return {
    schema: "silver/complete-blank-scenario/v1",
    status: "pass",
    skills: [...results.keys()],
    portable_baselines: Object.fromEntries(
      [...results].map(([id, result]) => [
        id,
        result.representation_coverage.find(
          ({ role }) => role === "portable-artifact",
        )?.provider,
      ]),
    ),
    positive_results: [...results.values()].map(({ invocation_id }) => invocation_id),
    boundary_results: [...results.keys()]
      .filter((id) => !["design-check", "what-now"].includes(id))
      .map((id) => `${id}-boundary`),
    refinement_results: [refinedResult.invocation_id, secondEvalResult.invocation_id],
    fast: fast.status,
    browser: browser.status,
    local_views: {
      flow_mermaid: "design/flows/guided-setup/flow.mmd",
      flow_html: "design/flows/guided-setup/index.html",
      map_html: "design/maps/guided-setup/index.html",
      system_catalog: "design/system/showcase.html",
      visualization_html: "design/work/visualizations/guided-setup/index.html",
      prototype_html: "prototypes/guided-setup/index.html",
      pitch_html: "presentations/guided-setup/index.html",
    },
    playbook: { paused: true, resumed: true, invalidated: true },
    trace_chain: {
      map: mapTrace.target.id,
      guidance: mapTrace.guidance,
      practice: mapTrace.practice,
      design_contexts: mapTrace.design_contexts,
      sources: mapTrace.sources,
      invocation_sources: mapTrace.invocation_sources,
      external_bindings: mapTrace.provenance.external_bindings,
      implementation_checkpoint: implementationResult.git_checkpoint,
      qa_result: qaResult.invocation_id,
    },
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

if (import.meta.main ?? (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
)) void main();
