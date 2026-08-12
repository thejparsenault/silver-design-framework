import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkAssets } from "../skills/design-check/scripts/check-assets.mjs";
import { checkEvidence } from "../skills/design-check/scripts/check-evidence.mjs";
import { checkPresentations } from "../skills/design-check/scripts/check-presentations.mjs";
import { runBrowserSuite } from "../skills/design-check/scripts/run-browser.mjs";
import { setupWorkspace } from "../../installer/setup.mjs";

async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-negative-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Negative fixture", id: "negative-fixture", date: "2026-07-24" });
  return root;
}

test("untraceable or fabricated findings fail evidence provenance", async (t) => {
  const root = await workspace(t);
  const target = path.join(root, "design/work/findings/untraceable.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({
    schema: "silver/working-artifact/v2",
    id: "untraceable",
    kind: "finding",
    revision: "r1",
    scope: "product",
    status: "draft",
    title: "Unsupported claim",
    created: "2026-07-24T20:00:00Z",
    updated: "2026-07-24T20:00:00Z",
    sources: [],
    payload: {
      statement: "Five participants preferred this design.",
      evidence_refs: [],
      confidence: "high"
    }
  }, null, 2)}\n`);
  const result = await checkEvidence({ root });
  assert.equal(result.status, "fail");
  assert.ok(result.findings.some(({ rule }) => rule === "evidence.sources-required"));
  assert.ok(result.findings.some(({ rule }) => rule === "evidence.finding-untraceable"));
});

test("evidence without a pinned source fails evidence provenance", async (t) => {
  const root = await workspace(t);
  const target = path.join(root, "design/evidence/unpinned.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({
    schema: "silver/working-artifact/v2",
    id: "unpinned",
    kind: "evidence",
    revision: "r1",
    scope: "product",
    status: "draft",
    title: "Unpinned evidence",
    created: "2026-07-24T20:00:00Z",
    updated: "2026-07-24T20:00:00Z",
    sources: [],
    payload: {
      observation: "Something was observed, from somewhere, at some point.",
    },
  }, null, 2)}\n`);
  const result = await checkEvidence({ root });
  assert.equal(result.status, "fail");
  assert.ok(result.findings.some(({ rule }) => rule === "evidence.source-unpinned"));
});

test("evidence with a complete source pin passes evidence provenance", async (t) => {
  const root = await workspace(t);
  const target = path.join(root, "design/evidence/pinned.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({
    schema: "silver/working-artifact/v2",
    id: "pinned",
    kind: "evidence",
    revision: "r1",
    scope: "product",
    status: "accepted",
    title: "Pinned evidence",
    created: "2026-07-24T20:00:00Z",
    updated: "2026-07-24T20:00:00Z",
    sources: [],
    payload: {
      source_pin: {
        source: "Support tickets, Q3 export",
        query: "What blocks checkout completion?",
        retrieved_at: "2026-07-24T20:00:00Z",
        sanitized: true,
      },
      observation: "Several tickets cite a missing confirmation step.",
    },
  }, null, 2)}\n`);
  const result = await checkEvidence({ root });
  assert.equal(result.status, "pass");
});

test("production cannot silently consume a prototype-local asset", async (t) => {
  const root = await workspace(t);
  const production = path.join(root, "production/leak");
  await mkdir(production, { recursive: true });
  await writeFile(path.join(production, "index.html"), '<img src="../../prototypes/test/local.png" alt="" />\n');
  const result = await checkAssets({ root });
  assert.equal(result.status, "fail");
  assert.ok(result.findings.some(({ rule }) => rule === "asset.prototype-production-leak"));
});

test("presentation views without pinned case and kit revisions fail", async (t) => {
  const root = await workspace(t);
  const directory = path.join(root, "presentations/unpinned");
  await mkdir(directory, { recursive: true });
  await writeFile(directory + "/index.html", '<html lang="en"><main><h1>Unpinned</h1></main></html>\n');
  const result = await checkPresentations({ root });
  assert.equal(result.status, "fail");
  assert.ok(result.findings.some(({ rule }) => rule === "presentation.pin-missing"));
});

test("an unavailable required browser target reports not-run, never pass", async (t) => {
  const root = await workspace(t);
  const result = await runBrowserSuite({
    root,
    chromePath: "/definitely/unavailable/silver-chrome",
  });
  assert.equal(result.status, "not-run");
  assert.ok(result.results.every(({ status }) => status === "not-run"));
  assert.ok(result.results.every(({ coverage }) => coverage.reason));
});
