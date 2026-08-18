import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

const kindMap = new Map([
  ["decision-log", "decision"],
  ["prototype-index", "prototype"],
  ["research", "evidence"],
  ["testing", "evaluation"],
]);
const capabilityMap = new Map([
  ["prototype", "prototype-renderer"],
]);

function migrateKind(kind) {
  return kindMap.get(kind) ?? kind;
}

function migrateCapability(capability) {
  return capabilityMap.get(capability) ?? capability;
}

export function migrateSkillContractV1(input) {
  if (input.schema !== "silver/skill/v1") {
    throw new Error("Expected a silver/skill/v1 contract.");
  }
  return {
    schema: "silver/skill/v2",
    id: input.id,
    version: "0.4.0",
    summary: input.summary,
    context_budget: input.context_budget,
    inputs: input.requires.artifacts.map((artifact) => ({
      kind: migrateKind(artifact.kind),
      required: artifact.required,
      role:
        artifact.role === "generated"
          ? "working"
          : artifact.role ?? "supporting",
    })),
    outputs: input.produces.map((output) => ({
      kind: migrateKind(output.kind),
      scope: output.scope,
      path_pattern: output.path_pattern,
      authority:
        output.scope === "prototype"
          ? "project-owned"
          : "canonical-with-approval",
    })),
    capabilities: {
      required: input.requires.capabilities.map(migrateCapability),
      optional: [],
    },
    permissions: input.requested_permissions.map((permission) => ({
      capability: migrateCapability(permission.capability),
      actions: permission.actions,
      ...(permission.paths ? { paths: permission.paths } : {}),
      decision: "ask",
    })),
    guardrails: [
      "authority-respected",
      "permission-bounded",
      "no-silent-mutation",
      "revision-pinned",
      "followups-recommended-only",
    ],
    completion: {
      invariants: ["contract-valid-output", "source-revisions-pinned"],
      quality_criteria: [
        {
          id: "task-intent-addressed",
          description:
            "The result addresses the declared task without inventing missing intent.",
          evaluation: "human",
        },
      ],
      unresolved_questions: "block-handoff",
      review: {
        required: true,
        reviewer: "human",
        checkpoint: "Review migrated defaults before accepting v2 behavior.",
      },
    },
    checks: [],
    handoffs: [],
    external_effects: input.external_effects,
    ...(input.scripts ? { scripts: input.scripts } : {}),
    recommend_after: input.recommend_after,
    extensions: {
      "silver.migration": {
        source_schema: "silver/skill/v1",
        review_required: true,
      },
    },
  };
}

async function main(args) {
  const inputPath = args[0];
  if (!inputPath) {
    throw new Error("Usage: node skill.mjs <input.yaml> [output.yaml]");
  }
  const outputPath = args[1];
  const migrated = migrateSkillContractV1(
    parse(await readFile(path.resolve(inputPath), "utf8")),
  );
  const rendered = stringify(migrated);
  if (outputPath) {
    await writeFile(path.resolve(outputPath), rendered, "utf8");
  } else {
    process.stdout.write(rendered);
  }
}

if (import.meta.main ?? (process.argv[1] === fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
