import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parse } from "yaml";

import { initPrototype } from "../skills/prototype/scripts/init-prototype.mjs";
import { validateSchema } from "../../installer/lib/schemas.mjs";

async function temporaryWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "prototype-skill-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

test("prototype initializer defaults to constrained metadata", async (t) => {
  const root = await temporaryWorkspace(t);
  const { outputPath } = await initPrototype({
    root,
    id: "campaign-flow",
    title: "Campaign flow",
    question: "Can a marketer understand the setup sequence?",
    date: "2026-07-23",
  });
  const metadata = parse(await readFile(outputPath, "utf8"));

  assert.equal(metadata.constraint_profile, "constrained");
  assert.equal("suspended_constraints" in metadata, false);
  assert.equal(
    (await validateSchema("prototype.schema.json", metadata)).valid,
    true,
  );
});

test("prototype initializer requires explicit partial override", async (t) => {
  const root = await temporaryWorkspace(t);
  await assert.rejects(
    initPrototype({
      root,
      id: "campaign-flow",
      title: "Campaign flow",
      profile: "partial",
      suspendedConstraints: ["component-contract"],
      overrideReason: "Testing a new navigation structure.",
    }),
    /requires --confirm-override/,
  );
});

test("prototype initializer records an explicit partial override", async (t) => {
  const root = await temporaryWorkspace(t);
  const { metadata } = await initPrototype({
    root,
    id: "campaign-flow",
    title: "Campaign flow",
    profile: "partial",
    suspendedConstraints: ["component-contract"],
    overrideReason: "Testing a new navigation structure.",
    confirmOverride: true,
    date: "2026-07-23",
  });

  assert.deepEqual(metadata.suspended_constraints, ["component-contract"]);
  assert.equal(
    (await validateSchema("prototype.schema.json", metadata)).valid,
    true,
  );
});
