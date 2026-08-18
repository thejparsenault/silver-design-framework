import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkReferenceIntegrity } from "../skills/design-check/scripts/check-reference-integrity.mjs";
import { setupWorkspace } from "../../installer/setup.mjs";

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

async function temporaryWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "reference-integrity-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await setupWorkspace({
    root,
    name: "Reference Fixture",
    id: "reference-fixture",
    date: "2026-08-11",
  });
  return root;
}

async function writeCollection(root, id, references) {
  await mkdir(path.join(root, "design", "references"), { recursive: true });
  await writeFile(
    path.join(root, "design", "references", `${id}.json`),
    JSON.stringify({
      schema: "silver/reference-collection/v1",
      id,
      revision: "r1",
      updated: "2026-08-11T00:00:00Z",
      references,
    }),
  );
}

test("a fresh workspace with no reference collections is clean", async (t) => {
  const root = await temporaryWorkspace(t);
  const result = await checkReferenceIntegrity({ root });
  assert.equal(result.status, "pass");
});

test("a reference pointing at a missing file is flagged", async (t) => {
  const root = await temporaryWorkspace(t);
  await writeCollection(root, "missing-file", [
    {
      id: "shot-1",
      revision: "r1",
      description: "A screenshot.",
      rights: { usage: "inspiration-only" },
      path: "design/references/assets/shot-1.png",
      media_type: "image/png",
      integrity: sha256("anything"),
    },
  ]);
  const result = await checkReferenceIntegrity({ root });
  assert.equal(result.status, "fail");
  assert.ok(result.findings.some(({ rule }) => rule === "reference.file-unavailable"));
});

test("a reference whose file no longer matches its recorded integrity is flagged", async (t) => {
  const root = await temporaryWorkspace(t);
  await mkdir(path.join(root, "design", "references", "assets"), { recursive: true });
  await writeFile(path.join(root, "design", "references", "assets", "shot-1.png"), "real bytes");
  await writeCollection(root, "stale-integrity", [
    {
      id: "shot-1",
      revision: "r1",
      description: "A screenshot.",
      rights: { usage: "internal" },
      path: "design/references/assets/shot-1.png",
      media_type: "image/png",
      integrity: sha256("different bytes"),
    },
  ]);
  const result = await checkReferenceIntegrity({ root });
  assert.ok(result.findings.some(({ rule }) => rule === "reference.integrity-mismatch"));
});

test("a duplicate reference id within a collection is flagged", async (t) => {
  const root = await temporaryWorkspace(t);
  await mkdir(path.join(root, "design", "references", "assets"), { recursive: true });
  await writeFile(path.join(root, "design", "references", "assets", "shot-1.png"), "bytes");
  const entry = {
    id: "shot-1",
    revision: "r1",
    description: "A screenshot.",
    rights: { usage: "internal" },
    path: "design/references/assets/shot-1.png",
    media_type: "image/png",
    integrity: sha256("bytes"),
  };
  await writeCollection(root, "duplicate-id", [entry, { ...entry }]);
  const result = await checkReferenceIntegrity({ root });
  assert.ok(result.findings.some(({ rule }) => rule === "reference.duplicate-id"));
});

test("an unrecognized rights.usage value is flagged", async (t) => {
  const root = await temporaryWorkspace(t);
  await mkdir(path.join(root, "design", "references", "assets"), { recursive: true });
  await writeFile(path.join(root, "design", "references", "assets", "shot-1.png"), "bytes");
  await writeCollection(root, "unknown-rights", [
    {
      id: "shot-1",
      revision: "r1",
      description: "A screenshot.",
      rights: { usage: "whatever-i-feel-like" },
      path: "design/references/assets/shot-1.png",
      media_type: "image/png",
      integrity: sha256("bytes"),
    },
  ]);
  const result = await checkReferenceIntegrity({ root });
  assert.ok(result.findings.some(({ rule }) => rule === "reference.unknown-rights"));
});

test("an inspiration-only reference cited by a production-touching invocation is blocked", async (t) => {
  const root = await temporaryWorkspace(t);
  await mkdir(path.join(root, "design", "references", "assets"), { recursive: true });
  await writeFile(path.join(root, "design", "references", "assets", "shot-1.png"), "bytes");
  await writeCollection(root, "competitor-flows", [
    {
      id: "shot-1",
      revision: "r1",
      description: "A competitor's flow.",
      rights: { usage: "inspiration-only" },
      path: "design/references/assets/shot-1.png",
      media_type: "image/png",
      integrity: sha256("bytes"),
    },
  ]);
  await mkdir(path.join(root, ".silver", "results", "skills"), { recursive: true });
  await writeFile(
    path.join(root, ".silver", "results", "skills", "implement-1.json"),
    JSON.stringify({
      invocation_id: "implement-1",
      outputs: [{ path: "production/checkout/index.html" }],
      provenance: {
        references: [{ collection: "competitor-flows", revision: "r1", ids: ["shot-1"] }],
      },
    }),
  );
  const result = await checkReferenceIntegrity({ root });
  assert.ok(
    result.findings.some(
      ({ rule }) => rule === "reference.inspiration-only-cited-by-production",
    ),
  );
});

test("an inspiration-only reference cited by a non-production invocation is not blocked", async (t) => {
  const root = await temporaryWorkspace(t);
  await mkdir(path.join(root, "design", "references", "assets"), { recursive: true });
  await writeFile(path.join(root, "design", "references", "assets", "shot-1.png"), "bytes");
  await writeCollection(root, "competitor-flows", [
    {
      id: "shot-1",
      revision: "r1",
      description: "A competitor's flow.",
      rights: { usage: "inspiration-only" },
      path: "design/references/assets/shot-1.png",
      media_type: "image/png",
      integrity: sha256("bytes"),
    },
  ]);
  await mkdir(path.join(root, ".silver", "results", "skills"), { recursive: true });
  await writeFile(
    path.join(root, ".silver", "results", "skills", "visualize-1.json"),
    JSON.stringify({
      invocation_id: "visualize-1",
      outputs: [{ path: "design/work/visualizations/onboarding/index.html" }],
      provenance: {
        references: [{ collection: "competitor-flows", revision: "r1", ids: ["shot-1"] }],
      },
    }),
  );
  const result = await checkReferenceIntegrity({ root });
  assert.ok(
    !result.findings.some(
      ({ rule }) => rule === "reference.inspiration-only-cited-by-production",
    ),
  );
});
