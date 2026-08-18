// Coverage for the generically-derived rungs that replaced the authored
// `setup` ladder in W7 — this had zero coverage before, since it was the one
// piece of pre-0.9 architecture no test touched directly.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { diagnoseTransport } from "../runtime/transport-diagnosis.mjs";

async function temporaryDirectory(t, prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

function provider(overrides = {}) {
  return {
    id: "test-transport",
    available: false,
    availability_level: "absent",
    availability_reason: "not configured",
    ...overrides,
  };
}

test("an MCP transport with no host-config entry reports a failed connection rung", async (t) => {
  const home = await temporaryDirectory(t, "silver-diagnosis-home-");
  const result = await diagnoseTransport(
    provider({ connection: { kind: "mcp", server: "some-server" } }),
    { home },
  );
  const connection = result.steps.find((step) => step.id === "host-config");
  assert.equal(connection.state, "failed");
  assert.match(connection.detail, /No MCP server named some-server/);
  assert.equal(result.verdict, "blocked");
  assert.equal(result.blocked_at, "host-config");
});

test("an MCP transport declared in the host config reports a held connection rung", async (t) => {
  const home = await temporaryDirectory(t, "silver-diagnosis-home-");
  await writeFile(
    path.join(home, ".claude.json"),
    JSON.stringify({ mcpServers: { "some-server": { command: "x" } } }),
    "utf8",
  );
  const result = await diagnoseTransport(
    provider({
      available: true,
      availability_level: "configured",
      connection: { kind: "mcp", server: "some-server" },
    }),
    { home },
  );
  const connection = result.steps.find((step) => step.id === "host-config");
  assert.equal(connection.state, "held");
  assert.match(connection.detail, /Declared as some-server/);
});

test("a host-native transport reports an unknown rung the agent alone can confirm", async (t) => {
  const home = await temporaryDirectory(t, "silver-diagnosis-home-");
  const result = await diagnoseTransport(
    provider({ connection: { kind: "host-native" }, availability_level: "unknown" }),
    { home },
  );
  const step = result.steps.find((step) => step.id === "host-native");
  assert.equal(step.state, "unknown");
  assert.equal(result.verdict, "unknown");
});

test("a CLI transport with detection reports found or missing generically, without a host config", async (t) => {
  const home = await temporaryDirectory(t, "silver-diagnosis-home-");
  const binDir = await temporaryDirectory(t, "silver-diagnosis-bin-");
  await writeFile(path.join(binDir, "some-cli"), "#!/bin/sh\n", { mode: 0o755 });

  const found = await diagnoseTransport(
    provider({
      interface: { kind: "cli", detection: { executables: ["some-cli"] } },
      available: true,
      availability_level: "configured",
    }),
    { home, pathEntries: [binDir] },
  );
  const foundStep = found.steps.find((step) => step.id === "interface-detection");
  assert.equal(foundStep.state, "held");
  assert.match(foundStep.detail, /executable some-cli/);

  const missing = await diagnoseTransport(
    provider({ interface: { kind: "cli", detection: { executables: ["some-cli"] } } }),
    { home, pathEntries: [] },
  );
  const missingStep = missing.steps.find((step) => step.id === "interface-detection");
  assert.equal(missingStep.state, "failed");
});

test("required env vars are checked by name only, and post_setup notes are carried through untouched", async (t) => {
  const home = await temporaryDirectory(t, "silver-diagnosis-home-");
  const result = await diagnoseTransport(
    provider({
      requires_env: ["SOME_TOKEN"],
      post_setup: ["Do a thing that cannot be derived."],
    }),
    { home },
  );
  const env = result.steps.find((step) => step.id === "env");
  assert.equal(env.state, "failed");
  assert.match(env.detail, /Not set: SOME_TOKEN/);
  assert.deepEqual(result.post_setup, ["Do a thing that cannot be derived."]);
});

test("a transport declaring none of connection, interface, env, or probe reports no rungs at all", async (t) => {
  const home = await temporaryDirectory(t, "silver-diagnosis-home-");
  const result = await diagnoseTransport(provider(), { home });
  assert.deepEqual(result.steps, []);
});
