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
  assert.equal(result.skills.length, 19);
  assert.equal(result.positive_results.length, 19);
  assert.equal(result.boundary_results.length, 17);
  assert.deepEqual(result.playbook, { paused: true, resumed: true, invalidated: true });
});
