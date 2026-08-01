import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";

import { auditActivityCatalog, loadActivityCatalog } from "../runtime/activities.mjs";
import { migrateSkillContractV1 } from "../migrations/v1-to-v2/skill.mjs";
import { discoverProviders } from "../runtime/providers.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function yaml(relativePath) {
  return parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function schemas(version) {
  const directory = path.join(root, "framework", "schemas", version);
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".schema.json"))
    .sort();
  const values = await Promise.all(
    names.map(async (name) =>
      JSON.parse(await readFile(path.join(directory, name), "utf8")),
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const value of values) {
    ajv.addSchema(value);
  }
  return {
    count: values.length,
    validators: new Map(
      values.map((value, index) => [
        names[index],
        ajv.getSchema(value.$id),
      ]),
    ),
  };
}

function assertValid(validators, schemaName, value, label) {
  const validate = validators.get(schemaName);
  if (!validate) {
    throw new Error(`Unknown schema ${schemaName}`);
  }
  if (!validate(value)) {
    const details = validate.errors
      .map(
        (error) =>
          `  - ${error.instancePath || "<root>"}: ${error.message}`,
      )
      .join("\\n");
    throw new Error(`${label} failed ${schemaName}:\\n${details}`);
  }
}

function assertInvalid(validators, schemaName, value, label) {
  const validate = validators.get(schemaName);
  if (validate(value)) {
    throw new Error(`${label} unexpectedly passed ${schemaName}`);
  }
}

function frontmatter(content, label) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (!match) {
    throw new Error(`${label} has no YAML frontmatter`);
  }
  const value = parse(match[1]);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} frontmatter is not an object`);
  }
  return value;
}

function integrity(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

async function validateV1(validators) {
  const workspaceRoot = path.join(
    root,
    "fixtures",
    "blank-workspace",
    "expected",
  );
  const manifest = parse(
    await readFile(path.join(workspaceRoot, "design/manifest.yaml"), "utf8"),
  );
  assertValid(
    validators,
    "manifest.schema.json",
    manifest,
    "blank workspace manifest",
  );

  const artifactIds = new Set();
  for (const mapping of manifest.artifacts) {
    const artifactPath = path.join(workspaceRoot, mapping.path);
    const fileMetadata =
      mapping.kind === "component-catalog"
        ? null
        : await stat(artifactPath);
    const content = fileMetadata?.isFile()
      ? await readFile(artifactPath, "utf8")
      : null;
    if (
      mapping.kind !== "permission-policy" &&
      mapping.path.endsWith(".md") &&
      content !== null
    ) {
      const artifactMetadata = frontmatter(content, mapping.path);
      assertValid(
        validators,
        "artifact.schema.json",
        artifactMetadata,
        mapping.path,
      );
      for (const field of ["id", "kind", "scope", "status"]) {
        if (artifactMetadata[field] !== mapping[field]) {
          throw new Error(`${mapping.path} ${field} disagrees with manifest`);
        }
      }
    }
    if (artifactIds.has(mapping.id)) {
      throw new Error(`Duplicate artifact id: ${mapping.id}`);
    }
    artifactIds.add(mapping.id);
  }

  if (manifest.permission_policy) {
    assertValid(
      validators,
      "permission-policy.schema.json",
      parse(
        await readFile(
          path.join(workspaceRoot, manifest.permission_policy),
          "utf8",
        ),
      ),
      manifest.permission_policy,
    );
  }

  const lock = await yaml("fixtures/contracts/valid/lock-v1.yaml");
  assertValid(validators, "lock.schema.json", lock, "legacy v1 lock fixture");
  for (const managed of lock.managed_files) {
    if (!managed.base_integrity) {
      continue;
    }
    const content = await readFile(
      path.join(workspaceRoot, managed.path),
      "utf8",
    );
    if (integrity(content) !== managed.base_integrity) {
      throw new Error(`Managed integrity is stale: ${managed.path}`);
    }
  }

  const skillFiles = [
    "fixtures/contracts/valid/skill-brand.yaml",
  ];
  for (const relativePath of skillFiles) {
    assertValid(
      validators,
      "skill.schema.json",
      await yaml(relativePath),
      relativePath,
    );
  }
  assertValid(
    validators,
    "prototype.schema.json",
    await yaml("fixtures/contracts/valid/prototype-constrained.yaml"),
    "valid prototype fixture",
  );
  assertValid(
    validators,
    "flow.schema.json",
    await json("fixtures/contracts/valid/flow-campaign-setup.json"),
    "valid flow fixture",
  );
  assertValid(
    validators,
    "check-result.schema.json",
    await json("fixtures/contracts/valid/check-result-not-run.json"),
    "valid not-run check result",
  );

  assertInvalid(
    validators,
    "manifest.schema.json",
    await yaml("fixtures/contracts/invalid/manifest-unknown-field.yaml"),
    "invalid manifest",
  );
  assertInvalid(
    validators,
    "check-result.schema.json",
    await json(
      "fixtures/contracts/invalid/check-result-pass-with-finding.json",
    ),
    "invalid pass result",
  );
  assertInvalid(
    validators,
    "permission-policy.schema.json",
    await yaml("fixtures/contracts/invalid/permission-invalid-action.yaml"),
    "invalid permission",
  );
  return { artifacts: manifest.artifacts.length, skills: skillFiles.length };
}

async function validateV2(validators) {
  const positive = [
    ["skill.schema.json", "fixtures/contracts/v2/valid/skill-synthesize.yaml", "yaml"],
    ["skill-result.schema.json", "fixtures/contracts/v2/valid/skill-result-synthesize.json", "json"],
    ["working-artifact.schema.json", "fixtures/contracts/v2/valid/working-finding.json", "json"],
    ["guardrail-registry.schema.json", "framework/guardrails/registry.yaml", "yaml"],
    ["tool-profile.schema.json", "fixtures/contracts/v2/valid/tool-profile.yaml", "yaml"],
    ["playbook.schema.json", "framework/playbooks/default-design-loop.yaml", "yaml"],
    ["lock.schema.json", "fixtures/blank-workspace/expected/.silver/lock.yaml", "yaml"],
    ["asset-catalog.schema.json", "fixtures/blank-workspace/expected/design/assets/catalog.json", "json"],
    ["presentation-kit.schema.json", "fixtures/blank-workspace/expected/design/presentation-kit/kit.json", "json"],
  ];
  for (const [schemaName, relativePath, format] of positive) {
    assertValid(
      validators,
      schemaName,
      format === "yaml" ? await yaml(relativePath) : await json(relativePath),
      relativePath,
    );
  }
  assertInvalid(
    validators,
    "skill-result.schema.json",
    await json(
      "fixtures/contracts/v2/invalid/skill-result-not-run-ready.json",
    ),
    "invalid not-run result",
  );

  const skillEntries = (
    await readdir(path.join(root, "framework/skills"), {
      withFileTypes: true,
    })
  ).filter((entry) => entry.isDirectory());
  for (const entry of skillEntries) {
    const contract = await yaml(
      `framework/skills/${entry.name}/skill.yaml`,
    );
    assertValid(
      validators,
      "skill.schema.json",
      contract,
      `${entry.name} v2 skill`,
    );
  }
  const legacySkillFiles = [
    "fixtures/contracts/valid/skill-brand.yaml",
  ];
  for (const relativePath of legacySkillFiles) {
    assertValid(
      validators,
      "skill.schema.json",
      migrateSkillContractV1(await yaml(relativePath)),
      `migrated ${relativePath}`,
    );
  }

  // Activity support is derived from the provider and skill contracts, so the
  // catalog can go stale without anyone editing it: shipping a provider for a
  // `planned` activity, or dropping the last provider for a `served` one, both
  // make it lie. A stale catalog is worse than none — it promises tools that
  // are not there — so the drift is a gate, not a warning.
  const catalog = await loadActivityCatalog();
  const providers = await discoverProviders({ skipAvailability: true });
  const skills = [];
  for (const entry of skillEntries) {
    skills.push(await yaml(`framework/skills/${entry.name}/skill.yaml`));
  }
  const drift = auditActivityCatalog({ catalog, providers, skills });
  if (drift.length > 0) {
    throw new Error(`Activity catalog drift:\n  ${drift.join("\n  ")}`);
  }

  return {
    examples: positive.length,
    skills: skillEntries.length,
    migrations: legacySkillFiles.length,
    activities: catalog.activities.length,
  };
}

async function main() {
  const v1 = await schemas("v1");
  const v2 = await schemas("v2");
  const v1Evidence = await validateV1(v1.validators);
  const v2Evidence = await validateV2(v2.validators);
  console.log(
    `Validated ${v1.count} v1 schemas, ${v2.count} v2 schemas, ` +
      `${v1Evidence.artifacts} mapped artifacts, ${v1Evidence.skills} v1 skill contracts, ` +
      `${v2Evidence.examples} v2 examples, ${v2Evidence.skills} v2 skill contracts, ` +
      `${v2Evidence.migrations} v1-to-v2 skill migrations, ` +
      `and ${v2Evidence.activities} activities with no catalog drift.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
