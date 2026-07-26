import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { assertV2, validateV2 } from "../runtime/contracts.mjs";
import { resolveGuardrails } from "../runtime/guardrails.mjs";
import {
  resolveCapabilities,
  resolvePermissions,
} from "../runtime/permissions.mjs";
import { discoverProviders } from "../runtime/providers.mjs";
import { migrateSkillContractV1 } from "../migrations/v1-to-v2/skill.mjs";

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

test("v2 schemas validate representative positive contracts", async () => {
  await assertV2(
    "skill.schema.json",
    await yaml("fixtures/contracts/v2/valid/skill-synthesize.yaml"),
  );
  await assertV2(
    "skill-result.schema.json",
    await json("fixtures/contracts/v2/valid/skill-result-synthesize.json"),
  );
  await assertV2(
    "working-artifact.schema.json",
    await json("fixtures/contracts/v2/valid/working-finding.json"),
  );
  await assertV2(
    "guardrail-registry.schema.json",
    await yaml("framework/guardrails/registry.yaml"),
  );
  await assertV2(
    "tool-profile.schema.json",
    await yaml("fixtures/contracts/v2/valid/tool-profile.yaml"),
  );
  await assertV2("asset-catalog.schema.json", {
    schema: "silver/asset-catalog/v2",
    id: "assets",
    revision: "r1",
    updated: "2026-07-24T20:00:00Z",
    assets: [],
  });
  await assertV2("presentation-kit.schema.json", {
    schema: "silver/presentation-kit/v2",
    id: "kit",
    revision: "r1",
    updated: "2026-07-24T20:00:00Z",
    source_revisions: [
      { id: "brand", kind: "brand", revision: "r1", path: "design/brand.md" },
      { id: "voice", kind: "voice", revision: "r1", path: "design/voice.md" },
      { id: "system", kind: "design-system", revision: "r1", path: "design/system/README.md" }
    ],
    roles: {
      canvas: "--ds-surface-canvas",
      surface: "--ds-surface-raised",
      heading: "--ds-text-primary",
      body: "--ds-text-primary",
      muted: "--ds-text-muted",
      accent: "--ds-action-primary",
      border: "--ds-border-subtle"
    },
    components: [{ id: "title", purpose: "Title", slots: ["heading"] }],
    templates: [
      { mode: "opportunity", path: "design/presentation-kit/templates/opportunity.json" },
      { mode: "proposal", path: "design/presentation-kit/templates/proposal.json" },
      { mode: "outcome", path: "design/presentation-kit/templates/outcome.json" }
    ]
  });
});

test("not-run execution cannot claim downstream readiness", async () => {
  const result = await validateV2(
    "skill-result.schema.json",
    await json(
      "fixtures/contracts/v2/invalid/skill-result-not-run-ready.json",
    ),
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\\n"), /must NOT be valid/);
});

test("v1 skill contracts migrate to strict reviewable v2 contracts", async () => {
  const legacy = await yaml("fixtures/contracts/valid/skill-brand.yaml");
  const migrated = migrateSkillContractV1(legacy);
  await assertV2("skill.schema.json", migrated);
  assert.equal(migrated.schema, "silver/skill/v2");
  assert.equal(migrated.version, "0.3.0");
  assert.equal(migrated.completion.review.required, true);
  assert.equal(
    migrated.extensions["silver.migration"].review_required,
    true,
  );
});

test("permission resolution uses the strictest decision across every layer", async () => {
  const layers = [
    ["framework", "framework-default", "allow"],
    ["user", "user-ceiling", "allow"],
    ["workspace", "workspace-restriction", "ask"],
    ["profile", "artifact-profile", "allow"],
    ["skill", "skill-request", "allow"],
    ["invocation", "invocation-constraint", "allow"],
  ].map(([id, layer, decision]) => ({
    schema: "silver/permission-policy/v2",
    id,
    layer,
    rules: [
      {
        capability: "repository",
        actions: ["write"],
        decision,
        paths: ["design/**"],
      },
    ],
  }));
  for (const layer of layers) {
    await assertV2("permission-policy.schema.json", layer);
  }
  const resolved = resolvePermissions({
    layers,
    requests: [
      {
        capability: "repository",
        action: "write",
        path: "design/work/findings/finding.json",
      },
    ],
  });
  await assertV2("capability-resolution.schema.json", resolved);
  assert.equal(resolved.decisions[0].decision, "ask");

  const denied = resolvePermissions({
    layers: layers.map((layer) =>
      layer.id === "invocation" ? { ...layer, rules: [] } : layer,
    ),
    requests: [
      {
        capability: "repository",
        action: "write",
        path: "design/work/findings/finding.json",
      },
    ],
  });
  assert.equal(denied.decisions[0].decision, "deny");
  assert.throws(
    () =>
      resolvePermissions({
        layers,
        requests: [
          {
            capability: "repository",
            action: "write",
            path: "../outside",
          },
        ],
      }),
    /escapes workspace/,
  );
});

test("registered portable provider covers required capabilities while optional providers degrade", async () => {
  const contract = await yaml(
    "fixtures/contracts/v2/valid/skill-synthesize.yaml",
  );
  const resolution = resolveCapabilities({
    contract,
    registeredProviders: await discoverProviders({ root }),
    availableProviders: [],
  });
  assert.deepEqual(resolution.providers, [
    {
      capability: "repository",
      provider: "silver-portable",
      status: "selected",
    },
    {
      capability: "research-evidence",
      status: "degraded",
    },
  ]);
  assert.deepEqual(resolution.degradedCapabilities, [
    {
      capability: "research-evidence",
      coverage: "degraded",
      reason: "Optional provider unavailable.",
    },
  ]);
});

test("only declared relaxable guardrails accept explicit recorded relaxations", async () => {
  const registry = await yaml("framework/guardrails/registry.yaml");
  const decisionReference = {
    id: "prototype-constraint-choice",
    kind: "decision",
    revision: "r1",
    path: "design/decisions/prototype-constraint-choice.json",
  };
  const evaluations = resolveGuardrails({
    registry,
    required: ["semantic-styles-only", "permission-bounded"],
    relaxations: [
      {
        id: "semantic-styles-only",
        profile: "prototype-suspended",
        reason: "The designer explicitly requested a divergent visual study.",
        decision_reference: decisionReference,
      },
    ],
  });
  assert.equal(evaluations[0].status, "relaxed");
  assert.equal(evaluations[1].status, "pass");
  assert.throws(
    () =>
      resolveGuardrails({
        registry,
        required: ["permission-bounded"],
        relaxations: [
          {
            id: "permission-bounded",
            profile: "prototype-suspended",
            reason: "Attempted broadening.",
            decision_reference: decisionReference,
          },
        ],
      }),
    /non-relaxable/,
  );
});
