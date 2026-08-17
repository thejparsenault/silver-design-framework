import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyProbe,
  isFresh,
  probePath,
  readProbe,
  recordProbe,
} from "../runtime/transport-probes.mjs";

const now = new Date("2026-08-16T20:00:00.000Z");
const provider = {
  id: "figma-console-mcp",
  available: true,
  availability_level: "configured",
  availability_reason: "Configured in the agent host.",
  probe: { freshness_hours: 24 },
};

function probe(overrides = {}) {
  return {
    schema: "silver/transport-probe/v1",
    transport: "figma-console-mcp",
    tool: "mcp__figma-console__status",
    outcome: "responded",
    recorded_at: "2026-08-16T19:00:00.000Z",
    recorded_by: "test-agent",
    ...overrides,
  };
}

test("only current probe evidence changes transport availability", () => {
  assert.equal(isFresh(probe(), provider, now), true);
  assert.equal(
    isFresh(probe({ recorded_at: "2026-08-16T21:00:00.000Z" }), provider, now),
    false,
  );

  const responded = applyProbe(provider, probe(), now);
  assert.equal(responded.available, true);
  assert.equal(responded.availability_level, "responding");
  assert.equal(responded.probe_state, "fresh");

  const failed = applyProbe(provider, probe({ outcome: "failed", detail: "Timed out." }), now);
  assert.equal(failed.available, false);
  assert.equal(failed.availability_level, "unresponsive");

  const staleFailure = applyProbe(
    provider,
    probe({ outcome: "failed", recorded_at: "2026-08-14T00:00:00.000Z" }),
    now,
  );
  assert.equal(staleFailure.available, true);
  assert.equal(staleFailure.availability_level, "configured");
  assert.equal(staleFailure.probe_state, "stale");

  const future = applyProbe(
    provider,
    probe({ recorded_at: "2026-08-16T21:00:00.000Z" }),
    now,
  );
  assert.equal(future.availability_level, "configured");
  assert.equal(future.probe_state, "stale");
  assert.match(future.availability_reason, /timestamp is in the future/);
});

test("probe files must validate and agree with their filename", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-probes-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.dirname(probePath(root, "figma-console-mcp")), { recursive: true });

  await writeFile(
    probePath(root, "figma-console-mcp"),
    `${JSON.stringify(probe({ transport: "different-transport" }), null, 2)}\n`,
  );
  assert.equal(await readProbe(root, "figma-console-mcp"), null);

  await writeFile(
    probePath(root, "figma-console-mcp"),
    `${JSON.stringify({ ...probe(), outcome: "invented" }, null, 2)}\n`,
  );
  assert.equal(await readProbe(root, "figma-console-mcp"), null);

  const recorded = await recordProbe({
    root,
    probe: probe(),
    providers: [provider],
  });
  assert.equal(recorded.path, ".silver/results/transports/figma-console-mcp.json");
  assert.deepEqual(await readProbe(root, "figma-console-mcp"), probe());
  assert.deepEqual(JSON.parse(await readFile(path.join(root, recorded.path), "utf8")), probe());

  await assert.rejects(
    recordProbe({
      root,
      probe: probe({ transport: "unknown-transport" }),
      providers: [provider],
    }),
    /No transport named unknown-transport/,
  );
});
