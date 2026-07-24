import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = parse(
  await readFile(path.join(root, "framework/catalog/skills.yaml"), "utf8"),
);
const skillRoot = path.join(root, "framework/skills");
const baselineGuardrails = [
  "authority-respected",
  "permission-bounded",
  "no-silent-mutation",
  "revision-pinned",
  "followups-recommended-only",
];
const extraGuardrails = {
  research: ["privacy-sanitized-evidence", "no-fabricated-evidence", "provenance-required"],
  synthesize: ["privacy-sanitized-evidence", "no-fabricated-evidence", "provenance-required"],
  ideate: ["provenance-required", "semantic-styles-only"],
  specify: ["provenance-required"],
  flow: ["provenance-required"],
  sketch: ["semantic-styles-only", "constraint-profile-explicit"],
  component: ["approved-components-only", "semantic-styles-only"],
  prototype: ["semantic-styles-only", "approved-components-only", "constraint-profile-explicit"],
  evaluate: ["privacy-sanitized-evidence", "no-fabricated-evidence", "provenance-required"],
  pitch: ["provenance-required", "no-fabricated-evidence"],
  implement: ["production-readiness-required", "semantic-styles-only", "approved-components-only"],
};
const canonicalKinds = new Set(["brand", "product", "voice", "design-principles", "design-system", "token-source", "component-catalog"]);
const renderCapabilities = new Set(["sketch-renderer", "prototype-renderer", "presentation-renderer"]);

function parseInput(value) {
  const optional = value.endsWith("?");
  return {
    kind: optional ? value.slice(0, -1) : value,
    required: !optional,
    role: value === "evidence" ? "evidence" : canonicalKinds.has(value.replace("?", "")) ? "canonical" : "working",
  };
}

function parseOutput(value) {
  const [kind, pathPattern, mode] = value.split(":");
  return {
    kind,
    scope: pathPattern.startsWith("prototypes/") ? "prototype" : kind === "implementation" ? "codebase" : "product",
    path_pattern: pathPattern,
    authority: mode === "canonical" ? "canonical-with-approval" : mode === "generated" ? "generated" : "project-owned",
  };
}

function parseCapability(value) {
  const optional = value.endsWith("?");
  return { capability: optional ? value.slice(0, -1) : value, optional };
}

function permissionFor(output) {
  if (output.authority === "canonical-with-approval") {
    return {
      capability: "canonical-artifact",
      actions: ["create", "write", "update"],
      paths: [output.path_pattern],
      decision: "ask",
    };
  }
  if (output.kind === "implementation") {
    return {
      capability: "production-source",
      actions: ["create", "write", "update"],
      paths: [output.path_pattern],
      decision: "ask",
    };
  }
  return {
    capability: "repository",
    actions: ["create", "write", "update"],
    paths: [output.path_pattern],
    decision: "allow",
  };
}

function displayName(title) {
  return title.replace(/(^|\\s)\\S/g, (match) => match.toUpperCase());
}

for (const skill of catalog.skills) {
  const directory = path.join(skillRoot, skill.id);
  await mkdir(path.join(directory, "agents"), { recursive: true });
  await mkdir(path.join(directory, "scripts"), { recursive: true });
  const outputs = skill.outputs.map(parseOutput);
  const capabilities = skill.capabilities.map(parseCapability);
  const existingScripts = (await readdir(path.join(directory, "scripts")))
    .filter((name) => name.endsWith(".mjs") && name !== "invoke.mjs")
    .sort();
  const contract = {
    schema: "silver/skill/v2",
    id: skill.id,
    version: catalog.version,
    summary: skill.summary,
    context_budget: ["flow", "prototype", "implement", "pitch", "evaluate"].includes(skill.id) ? "medium" : "small",
    inputs: skill.inputs.map(parseInput),
    outputs,
    capabilities: {
      required: capabilities.filter(({ optional }) => !optional).map(({ capability }) => capability),
      optional: capabilities.filter(({ optional }) => optional).map(({ capability }) => ({
        capability,
        providers: [],
        fallback: renderCapabilities.has(capability) ? "local" : "degraded",
        description: `Use ${capability} when configured; preserve explicit fallback coverage otherwise.`,
      })),
    },
    permissions: [
      {
        capability: "repository",
        actions: ["read", "inspect"],
        paths: ["design/**", "prototypes/**", "presentations/**", "production/**", "reference-system/**", ".silver/**"],
        decision: "allow",
      },
      ...outputs.map(permissionFor),
    ],
    guardrails: [...new Set([...baselineGuardrails, ...(extraGuardrails[skill.id] ?? [])])],
    completion: {
      invariants: skill.invariants,
      quality_criteria: [{
        id: "task-quality",
        description: skill.quality,
        evaluation: skill.id === "design-check" ? "deterministic" : "human",
      }],
      unresolved_questions: ["design-check", "research"].includes(skill.id) ? "warn" : "block-handoff",
      review: {
        required: skill.id !== "design-check",
        reviewer: skill.id === "design-check" ? "none" : "human",
        checkpoint: skill.id === "design-check" ? "Review findings when any check fails or is not-run." : "Review and accept the result before a readiness-gated handoff.",
      },
    },
    checks: skill.checks.map((id) => ({ id, required: true, blocks: skill.handoffs })),
    handoffs: skill.handoffs.map((target) => ({
      id: `${skill.id}-to-${target}`,
      target,
      readiness: target === "implement" ? "production" : target,
      requires: outputs.map(({ kind }) => kind),
    })),
    external_effects: skill.capabilities.some((value) => value.includes("external")) ? ["read-external"] : ["none"],
    scripts: [
      { id: "invoke", path: "scripts/invoke.mjs", purpose: "Run this skill through the shared guarded invocation runtime." },
      ...existingScripts.map((name) => ({
        id: name.replace(/\.mjs$/, "").replace(/[^a-z0-9]+/g, "-"),
        path: `scripts/${name}`,
        purpose: `Bundled deterministic ${skill.id} operation.`,
      })),
    ],
    recommend_after: skill.handoffs,
  };
  const body = [
    "---",
    `name: ${skill.id}`,
    `description: ${skill.description}`,
    "---",
    "",
    `# ${skill.title}`,
    "",
    "## Workflow",
    "",
    ...skill.workflow.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's permission, guardrail, and output checks.",
    "",
    "## Done",
    "",
    `- Satisfy: ${skill.invariants.join(", ")}.`,
    `- Evaluate quality: ${skill.quality}`,
    "- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.",
    "- Recommend follow-up skills; never start them automatically.",
    "",
    "## Boundaries",
    "",
    ...skill.boundaries.map((boundary) => `- ${boundary}`),
    "",
  ].join("\n");
  const agent = {
    interface: {
      display_name: displayName(skill.title),
      short_description: skill.summary,
      default_prompt: `Use $${skill.id} to ${skill.summary.charAt(0).toLowerCase()}${skill.summary.slice(1)}`,
    },
  };
  const shim = [
    "#!/usr/bin/env node",
    'let runtime;',
    'try {',
    '  runtime = await import("silver-design-framework/framework/runtime/invoke-skill.mjs");',
    '} catch {',
    '  try {',
    '    runtime = await import("../../../.silver/runtime/invoke-skill.mjs");',
    '  } catch {',
    '    runtime = await import("../../../runtime/invoke-skill.mjs");',
    '  }',
    '}',
    'runtime.runSkillCli({ skillDirectory: new URL("..", import.meta.url), args: process.argv.slice(2) }).then((code) => { process.exitCode = code; });',
    "",
  ].join("\n");
  await writeFile(path.join(directory, "skill.yaml"), stringify(contract), "utf8");
  await writeFile(path.join(directory, "SKILL.md"), body, "utf8");
  await writeFile(path.join(directory, "agents/openai.yaml"), stringify(agent, { lineWidth: 0 }), "utf8");
  await writeFile(path.join(directory, "scripts/invoke.mjs"), shim, { encoding: "utf8", mode: 0o755 });
}

console.log(`Built ${catalog.skills.length} Silver v2 skill packages.`);
