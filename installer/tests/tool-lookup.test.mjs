// Coverage for `silver tools --for "<phrase>"` — resolveActivityForTask's
// four outcomes (resolved, fallback, ambiguous, unresolved), plus the rule
// that an explicit transport name always wins over any activity match.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveActivityForTask } from "../tools.mjs";
import { setupWorkspace } from "../setup.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const emptyHome = path.join(repositoryRoot, "fixtures/host/empty");

async function temporaryDirectory(t, prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function workspace(t) {
  const root = await temporaryDirectory(t, "silver-tool-lookup-");
  await setupWorkspace({ root, name: "Tool Lookup", id: "tool-lookup", date: "2026-08-12" });
  return root;
}

test("a phrase naming a tool directly resolves to the transport, not an activity", async (t) => {
  const root = await workspace(t);
  const result = await resolveActivityForTask({
    root,
    home: emptyHome,
    phrase: "use the official Figma MCP instead",
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.matched, "transport");
  assert.equal(result.transport, "figma-official-mcp");
});

test("a phrase naming a task resolves to the activity Silver will use", async (t) => {
  const root = await workspace(t);
  const result = await resolveActivityForTask({
    root,
    home: emptyHome,
    phrase: "make a wireframe",
    interactive: true,
  });
  assert.equal(result.matched, "activity");
  assert.equal(result.activity, "visual.create-wireframe");
  assert.equal(result.status, "resolved");
  assert.equal(result.selected, "silver-portable");
});

test("a phrase matching a named activity with no installed provider returns the catalog fallback", async (t) => {
  const root = await workspace(t);
  const result = await resolveActivityForTask({ root, home: emptyHome, phrase: "query analytics" });
  assert.equal(result.status, "fallback");
  assert.equal(result.matched, "activity");
  assert.equal(result.activity, "measure.query-analytics");
  assert.equal(result.fallback.mode, "input-required");
  assert.ok(result.fallback.note.length > 0);
});

test("a phrase matching no known activity or transport is unresolved, with the nearest activities named", async (t) => {
  const root = await workspace(t);
  const result = await resolveActivityForTask({
    root,
    home: emptyHome,
    phrase: "do the thing from yesterday",
  });
  assert.equal(result.status, "unresolved");
  assert.ok(result.nearest_activities.length > 0);
  // Internal activities describe no real choice, so they must never appear
  // as a suggestion for what to ask for instead.
  assert.ok(!result.nearest_activities.some(({ id }) => id === "artifact.write-canonical"));
});

test("an explicit tool request overrides whatever a binding would otherwise choose", async (t) => {
  const root = await workspace(t);
  // Both the phrase's own tool name and the activity it also happens to
  // match are present; the explicit transport name must win.
  const result = await resolveActivityForTask({
    root,
    home: emptyHome,
    phrase: "use the console mcp to make a wireframe",
  });
  assert.equal(result.matched, "transport");
  assert.equal(result.transport, "figma-console-mcp");
});
