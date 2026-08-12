import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkArtifacts } from "../skills/design-check/scripts/check-artifacts.mjs";
import { checkPrototypes } from "../skills/design-check/scripts/check-prototypes.mjs";
import { checkSemanticStyles } from "../skills/design-check/scripts/check-semantic-styles.mjs";
import { runFastSuite } from "../skills/design-check/scripts/run-fast.mjs";
import { initFlow } from "../skills/flow/scripts/init-flow.mjs";
import { initPrototype } from "../skills/prototype/scripts/init-prototype.mjs";
import { validateSchema } from "../../installer/lib/schemas.mjs";
import { setupWorkspace } from "../../installer/setup.mjs";

async function temporaryWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "design-check-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await setupWorkspace({
    root,
    name: "Check Fixture",
    id: "check-fixture",
    date: "2026-07-23",
  });
  return root;
}

test("bundled fast checks pass on a fresh blank workspace", async (t) => {
  const root = await temporaryWorkspace(t);
  const result = await runFastSuite({ root });

  assert.equal(result.status, "pass");
  assert.deepEqual(
    result.results.map(({ checker }) => checker),
    [
      "contract-integrity",
      "flow-structure",
      "map-structure",
      "semantic-styles",
      "prototype-policy",
      "evidence-provenance",
      "presentation-integrity",
      "production-readiness",
      "asset-integrity",
      "reference-integrity",
      "accessibility",
      "responsive-behavior",
      "critical-interactions",
      "binding-integrity",
      "provider-revision-pins",
      "view-provenance",
      "synchronization-status",
      "semantic-mapping",
      "stale-proposals",
      "authority",
      "secret-free-configuration",
    ],
  );
  for (const checkerResult of result.results) {
    assert.equal(
      (await validateSchema("check-result.schema.json", checkerResult)).valid,
      true,
    );
  }
});

test("artifact checker rejects malformed canonical metadata", async (t) => {
  const root = await temporaryWorkspace(t);
  const brandPath = path.join(root, "design", "brand.md");
  await writeFile(
    brandPath,
    (await readFile(brandPath, "utf8")).replace(
      "status: draft",
      "status: active",
    ),
  );

  const result = await checkArtifacts({ root });
  assert.equal(result.status, "fail");
  assert.ok(
    result.findings.some(
      ({ rule }) => rule === "artifact.frontmatter-mismatch",
    ),
  );
});

test("semantic checker rejects raw visual values in prototype code", async (t) => {
  const root = await temporaryWorkspace(t);
  const prototypeRoot = path.join(root, "prototypes", "raw-values");
  await mkdir(prototypeRoot, { recursive: true });
  await writeFile(
    path.join(prototypeRoot, "prototype.css"),
    ".example { color: #123456; margin: 13px; }\n",
  );

  const result = await checkSemanticStyles({ root });
  assert.equal(result.status, "fail");
  assert.ok(
    result.findings.some(({ rule }) => rule === "semantic-style.raw-color"),
  );
  assert.ok(
    result.findings.some(
      ({ rule }) => rule === "semantic-style.raw-dimension",
    ),
  );
});

test("semantic checker downgrades findings to informational under the adoption policy profile", async (t) => {
  const root = await temporaryWorkspace(t);
  const prototypeRoot = path.join(root, "prototypes", "raw-values");
  await mkdir(prototypeRoot, { recursive: true });
  await writeFile(
    path.join(prototypeRoot, "prototype.css"),
    ".example { color: #123456; margin: 13px; }\n",
  );
  const manifestPath = path.join(root, "design", "manifest.yaml");
  await writeFile(
    manifestPath,
    (await readFile(manifestPath, "utf8")).replace(
      "policy_profile: prototype",
      "policy_profile: adoption",
    ),
  );

  const result = await checkSemanticStyles({ root });
  assert.equal(result.policy_profile, "adoption");
  assert.notEqual(result.status, "pass");
  assert.ok(result.findings.length > 0);
  for (const item of result.findings) {
    assert.equal(item.severity, "info");
    assert.equal(item.policy_profile, "adoption");
    assert.match(item.message, /adoption/);
  }
});

test("semantic checker reports not-run when adopted work has no token index yet", async (t) => {
  const root = await temporaryWorkspace(t);
  const manifestPath = path.join(root, "design", "manifest.yaml");
  await writeFile(
    manifestPath,
    (await readFile(manifestPath, "utf8")).replace(
      "policy_profile: prototype",
      "policy_profile: adoption",
    ),
  );
  await rm(path.join(root, "design", "system", "tokens.json"), { force: true });

  const result = await checkSemanticStyles({ root });
  assert.equal(result.status, "not-run");
  assert.equal(result.policy_profile, "adoption");
  assert.ok(result.coverage.reason);
  assert.deepEqual(result.findings, []);
});

test("prototype checker reports flow revision drift", async (t) => {
  const root = await temporaryWorkspace(t);
  const { outputPath } = await initFlow({
    root,
    id: "setup-flow",
    title: "Setup flow",
    purpose: "Understand the setup path.",
    outcome: "Workspace is ready",
    date: "2026-07-23",
  });
  await initPrototype({
    root,
    id: "setup-prototype",
    title: "Setup prototype",
    flowRefs: ["setup-flow@1=design/flows/setup-flow/flow.json"],
    date: "2026-07-23",
  });
  const flow = JSON.parse(await readFile(outputPath, "utf8"));
  flow.revision = 2;
  await writeFile(outputPath, `${JSON.stringify(flow, null, 2)}\n`);

  const result = await checkPrototypes({ root });
  assert.equal(result.status, "fail");
  assert.ok(
    result.findings.some(
      ({ rule }) => rule === "prototype.flow-revision-mismatch",
    ),
  );
});
