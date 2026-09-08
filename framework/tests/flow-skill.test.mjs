import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkFlowStructure,
  checkResult,
} from "../skills/flow/scripts/check-flow.mjs";
import { initFlow } from "../skills/flow/scripts/init-flow.mjs";
import {
  renderFlow,
  renderFlowFile,
} from "../skills/flow/scripts/render-flow.mjs";
import { validateSchema } from "../../installer/lib/schemas.mjs";

async function temporaryWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "flow-skill-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

test("flow initializer creates a valid portable graph without overwriting", async (t) => {
  const root = await temporaryWorkspace(t);
  const result = await initFlow({
    root,
    id: "campaign-setup",
    title: "Campaign setup",
    purpose: "Explore the shortest setup path.",
    outcome: "Campaign ready for review",
    actorId: "marketer",
    actorName: "Marketer",
    date: "2026-07-23",
  });

  assert.equal(
    (await validateSchema("flow.schema.json", result.flow)).valid,
    true,
  );
  assert.deepEqual(checkFlowStructure(result.flow), []);
  await assert.rejects(
    initFlow({
      root,
      id: "campaign-setup",
      title: "Campaign setup",
      purpose: "Overwrite the first flow.",
      outcome: "Campaign ready",
      date: "2026-07-23",
    }),
    /EEXIST/,
  );
});

test("flow renderer creates a revision-stamped Mermaid view", async (t) => {
  const root = await temporaryWorkspace(t);
  const { flow, outputPath } = await initFlow({
    root,
    id: "campaign-setup",
    title: "Campaign setup",
    purpose: "Explore setup.",
    outcome: "Campaign ready",
    date: "2026-07-23",
  });
  const rendered = renderFlow(flow);
  assert.match(rendered, /Generated from campaign-setup revision r1/);
  assert.match(rendered, /node_start -->\|"Continue"\| node_complete/);

  const result = await renderFlowFile(outputPath);
  assert.equal(await readFile(result.outputPath, "utf8"), rendered);
});

test("flow structural checker reports broken references and reachability", async () => {
  const flow = {
    scope: "product",
    actors: [{ id: "user" }],
    start_nodes: ["start"],
    nodes: [
      { id: "start", type: "decision" },
      { id: "orphan", type: "screen" },
    ],
    transitions: [
      { id: "broken", from: "start", to: "missing", actor: "unknown" },
    ],
  };
  const findings = checkFlowStructure(flow, {
    file: "design/flows/broken/flow.json",
  });
  const rules = new Set(findings.map(({ rule }) => rule));

  assert.ok(rules.has("flow.missing-transition-target"));
  assert.ok(rules.has("flow.missing-actor"));
  assert.ok(rules.has("flow.unreachable-node"));
  assert.ok(rules.has("flow.incomplete-decision"));
  assert.ok(rules.has("flow.missing-outcome"));
  assert.equal(
    (
      await validateSchema(
        "check-result.schema.json",
        checkResult(flow, findings, "design/flows/broken/flow.json"),
      )
    ).valid,
    true,
  );
});
