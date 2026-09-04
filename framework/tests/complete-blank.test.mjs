import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCompleteBlankScenario } from "../scenarios/complete-blank.mjs";
import { setupWorkspace } from "../../installer/setup.mjs";

test("complete blank workspace invokes every skill and passes the full local loop", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-complete-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Complete fixture", id: "complete-fixture", date: "2026-07-24" });
  const result = await runCompleteBlankScenario({ root });
  assert.equal(result.status, "pass");
  assert.equal(result.skills.length, 21);
  assert.equal(result.positive_results.length, 21);
  assert.equal(result.boundary_results.length, 19);
  assert.deepEqual(result.playbook, { paused: true, resumed: true, invalidated: true });
  assert.equal(result.trace_chain.map, "guided-setup-journey");
  assert.equal(result.trace_chain.practice.revision, "r1");
  assert.equal(result.trace_chain.guidance[0].id, "fixture-design-guidance");
  assert.equal(
    result.trace_chain.design_contexts[0].id,
    "default-design-context",
  );
  assert.ok(Array.isArray(result.trace_chain.sources));
  assert.ok(Array.isArray(result.trace_chain.invocation_inputs));
  assert.equal(result.trace_chain.external_bindings[0].id, "guided-map-figma");
  assert.equal(
    result.trace_chain.external_bindings[0].path,
    "design/integrations/guided-map-figma.yaml",
  );
  assert.match(result.trace_chain.external_bindings[0].integrity, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    result.trace_chain.implementation_checkpoint.status,
    "committed",
  );
  assert.equal(result.trace_chain.qa_result, "design-check-local-degraded");
});
