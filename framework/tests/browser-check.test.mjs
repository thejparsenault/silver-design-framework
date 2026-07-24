import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runBrowserSuite } from "../skills/design-check/scripts/run-browser.mjs";
import { setupWorkspace } from "../../installer/setup.mjs";

test("declared local release target passes real browser checks", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-browser-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Browser fixture", id: "browser-fixture", date: "2026-07-24" });
  const result = await runBrowserSuite({ root });
  assert.equal(result.status, "pass", JSON.stringify(result, null, 2));
  assert.equal(result.browser.provider, "chrome-cdp");
  assert.match(result.browser.version, /Chrome/);
  assert.deepEqual(result.results.map(({ checker }) => checker), [
    "accessibility",
    "responsive-behavior",
    "critical-interactions",
  ]);
  assert.ok(result.results.every(({ status }) => status === "pass"));
});
