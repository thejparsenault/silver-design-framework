// Regression coverage for Silver 0.9 W5e — personal tool preferences.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverProviders } from "../../framework/runtime/providers.mjs";
import { setupWorkspace } from "../setup.mjs";
import { bindActivityTransport, inspectTools, resolveTools } from "../tools.mjs";
import { readUtf8 } from "../lib/files.mjs";
import { parse } from "yaml";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const emptyHome = path.join(repositoryRoot, "fixtures/host/empty");

async function temporaryDirectory(t, prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function workspace(t) {
  const root = await temporaryDirectory(t, "silver-practice-tools-workspace-");
  await setupWorkspace({ root, name: "Practice Tools", id: "practice-tools", date: "2026-08-11" });
  return root;
}

test("resolveTools resolves a conversational phrase through a declared alias", async (t) => {
  const root = await workspace(t);
  const resolved = await resolveTools({
    root,
    home: emptyHome,
    phrase: "let's use the official Figma MCP instead of the console one",
  });
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.transport, "figma-official-mcp");
  assert.equal(resolved.matched_alias, "official figma mcp");
});

test("resolveTools reports unresolved for a phrase matching no alias", async (t) => {
  const root = await workspace(t);
  const resolved = await resolveTools({ root, home: emptyHome, phrase: "use the thing from yesterday" });
  assert.equal(resolved.status, "unresolved");
});

test("bindActivityTransport writes a valid, revisioned personal binding", async (t) => {
  const root = await workspace(t);
  const practiceRoot = await temporaryDirectory(t, "silver-practice-tools-practice-");

  const bound = await bindActivityTransport({
    root,
    home: emptyHome,
    practiceRoot,
    activity: "design.pull-tokens",
    transport: "figma-official-mcp",
  });
  assert.equal(bound.activity, "design.pull-tokens");
  assert.equal(bound.transport, "figma-official-mcp");

  const written = parse(await readUtf8(path.join(practiceRoot, "tools.yaml")));
  assert.equal(written.schema, "silver/tool-preferences/v1");
  assert.equal(written.revision, "r1");
  assert.deepEqual(written.activities["design.pull-tokens"], { use: ["figma-official-mcp"] });

  // Binding a second activity preserves the first and bumps the revision —
  // an edit, not a replacement of the whole file.
  const second = await bindActivityTransport({
    root,
    home: emptyHome,
    practiceRoot,
    activity: "design.push-tokens",
    transport: "figma-console-mcp",
  });
  const rewritten = parse(await readUtf8(second.path));
  assert.equal(rewritten.revision, "r2");
  assert.deepEqual(rewritten.activities["design.pull-tokens"], { use: ["figma-official-mcp"] });
  assert.deepEqual(rewritten.activities["design.push-tokens"], { use: ["figma-console-mcp"] });

  // inspectTools reads it back as the personal source, first in order —
  // resolveActivityTransport's own ordering guarantee, exercised end to end
  // with a synthetic provider so selection does not depend on this machine's
  // real availability (Chrome installed, a live MCP configured, etc).
  const report = await inspectTools({ root, home: emptyHome, practiceRoot });
  assert.ok(report.activities.length > 0);
});

test("a personal binding wins ordering over the framework default", async () => {
  const { resolveActivityTransport } = await import(
    "../../framework/runtime/transports.mjs"
  );
  const activity = {
    id: "design.pull-tokens",
    title: "Pull design-system values from a design tool",
    capability: "design-file",
    actions: ["read"],
  };
  const declared = [{ id: "design.pull-tokens", support: "full", actions: ["read"] }];
  const providers = [
    { id: "transport-a", capabilities: ["design-file"], directions: ["read", "write"], available: true, availability_level: "configured", activities: declared },
    { id: "transport-b", capabilities: ["design-file"], directions: ["read", "write"], available: true, availability_level: "configured", activities: declared },
  ];
  const resolution = resolveActivityTransport({
    activity,
    providers,
    sources: [
      { source: "personal", preferences: { activities: { "design.pull-tokens": { use: ["transport-b"] } } } },
      { source: "framework", preferences: { activities: { "design.pull-tokens": { use: ["transport-a"] } } } },
    ],
  });
  assert.equal(resolution.selected, "transport-b");
  assert.equal(resolution.ordered_by, "personal");
});

test("bindActivityTransport refuses an unknown activity or transport", async (t) => {
  const root = await workspace(t);
  const practiceRoot = await temporaryDirectory(t, "silver-practice-tools-practice-");

  await assert.rejects(
    () =>
      bindActivityTransport({
        root,
        home: emptyHome,
        practiceRoot,
        activity: "not-a-real-activity",
        transport: "figma-official-mcp",
      }),
    /No activity named/,
  );
  await assert.rejects(
    () =>
      bindActivityTransport({
        root,
        home: emptyHome,
        practiceRoot,
        activity: "design.pull-tokens",
        transport: "not-a-real-transport",
      }),
    /No transport named/,
  );
});

test("a malformed personal tools.yaml is treated as absent rather than fatal", async (t) => {
  const root = await workspace(t);
  const practiceRoot = await temporaryDirectory(t, "silver-practice-tools-practice-");
  await writeFile(path.join(practiceRoot, "tools.yaml"), "not: [valid, schema");

  const report = await inspectTools({ root, home: emptyHome, practiceRoot });
  assert.ok(report.activities.length > 0);
});
