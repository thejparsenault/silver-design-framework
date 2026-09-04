import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkMap } from "../skills/map/scripts/check-map.mjs";
import { renderMap } from "../skills/map/scripts/render-map.mjs";
import {
  traceArtifact,
  renderTrace,
  writeTraceView,
} from "../../installer/trace.mjs";

const fixedTime = "2026-07-30T12:00:00.000Z";

async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-map-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function reference(id, kind, artifactPath, revision = "r1") {
  return { id, kind, revision, path: artifactPath };
}

function provenance(context) {
  return {
    schema: "silver/provenance/v1",
    origin: "agent-assisted",
    recorded_at: fixedTime,
    contributors: [{ kind: "agent", id: "test-agent" }],
    sources: [],
    practice: {
      id: "my-practice",
      revision: "r2",
      methods: ["evidence-first"],
    },
    guidance: [
      {
        id: "research-standard",
        revision: "commit-123",
        integrity: `sha256:${"a".repeat(64)}`,
      },
    ],
    design_contexts: [context],
    change: { reason: "Created from reviewed evidence." },
    acceptance: "accepted",
    external_bindings: [],
  };
}

function mapFixture(mapType = "journey") {
  const context = reference(
    "default-design-context",
    "design-context",
    "design/contexts/default.yaml",
  );
  const laneKinds =
    mapType === "service-blueprint"
      ? ["actor-action", "frontstage", "backstage", "support", "system"]
      : ["actor-action", "touchpoint"];
  return {
    schema: "silver/map/v1",
    id: `${mapType}-map`,
    kind: "map",
    revision: "r1",
    title:
      mapType === "journey" ? "Onboarding journey" : "Onboarding service",
    map_type: mapType,
    state: "current",
    question: "How does a new member become productive?",
    actors: [{ id: "member", title: "Member" }],
    stages: [{ id: "start", title: "Start" }],
    lanes: laneKinds.map((kind) => ({
      id: kind,
      title: kind,
      kind,
    })),
    items: laneKinds.map((kind, index) => ({
      id: `item-${index + 1}`,
      stage: "start",
      lane: kind,
      title: `${kind} activity`,
      ...(kind === "actor-action" ? { actor: "member" } : {}),
      evidence: [],
      assumption: true,
      pain_points: index === 0 ? ["Unclear next step"] : [],
      opportunities: index === 0 ? ["Show progress"] : [],
    })),
    connections: laneKinds.slice(1).map((kind, index) => ({
      from: `item-${index + 1}`,
      to: `item-${index + 2}`,
      relationship: `Enables ${kind}`,
    })),
    design_contexts: [context],
    primary_context: context.id,
    provenance: provenance(context),
  };
}

test("journey maps validate, render semantic HTML, and trace complete provenance", async (t) => {
  const root = await workspace(t);
  const artifact = mapFixture("journey");
  const artifactPath = path.join(root, "design", "maps", "journey.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

  assert.equal(
    (await checkMap({ root, map: "design/maps/journey.json" })).status,
    "pass",
  );
  const rendered = await renderMap({
    root,
    map: "design/maps/journey.json",
    output: "design/maps/journey.html",
  });
  assert.equal(rendered.context.revision, "r1");
  const html = await readFile(
    path.join(root, "design", "maps", "journey.html"),
    "utf8",
  );
  assert.match(html, /data-design-context="default-design-context@r1"/);
  assert.match(html, /data-source-revision="r1"/);
  assert.match(html, /data-renderer-version="map-html@0\.7\.0"/);
  assert.match(
    html,
    /data-design-system-revision="via-context:default-design-context@r1"/,
  );

  const trace = await traceArtifact({
    root,
    target: "journey-map",
  });
  assert.equal(trace.practice.revision, "r2");
  assert.equal(trace.guidance[0].id, "research-standard");
  assert.equal(trace.design_contexts[0].revision, "r1");
  assert.equal(
    await writeTraceView({ root, trace }),
    ".silver/results/traces/journey-map.md",
  );
});

test("service blueprints require every semantic lane and reject broken references", async (t) => {
  const root = await workspace(t);
  const valid = mapFixture("service-blueprint");
  const validPath = path.join(root, "service.json");
  await writeFile(validPath, `${JSON.stringify(valid, null, 2)}\n`);
  assert.equal((await checkMap({ root, map: "service.json" })).status, "pass");

  valid.lanes = valid.lanes.filter(({ kind }) => kind !== "backstage");
  valid.items[0].stage = "missing";
  valid.connections.push({
    from: "missing",
    to: "item-1",
    relationship: "Broken",
  });
  await writeFile(validPath, `${JSON.stringify(valid, null, 2)}\n`);
  const invalid = await checkMap({ root, map: "service.json" });
  assert.equal(invalid.status, "fail");
  assert.match(invalid.findings.join(" "), /backstage/);
  assert.match(invalid.findings.join(" "), /missing stage/);
  assert.match(invalid.findings.join(" "), /missing item/);
});

test("trace refuses paths outside the workspace", async (t) => {
  const root = await workspace(t);
  await assert.rejects(
    traceArtifact({ root, target: "../outside.json" }),
    /escapes workspace/,
  );
});

test("trace joins the newest exact result and exposes duplicates and disagreement", async (t) => {
  const root = await workspace(t);
  const artifact = {
    id: "joined-finding",
    kind: "finding",
    revision: "r1",
    status: "accepted",
    sources: [{ id: "authored-from", revision: "r3", path: "design/specs/original.json" }],
  };
  const relativePath = "design/work/findings/joined-finding.json";
  await mkdir(path.join(root, "design/work/findings"), { recursive: true });
  await writeFile(path.join(root, relativePath), `${JSON.stringify(artifact, null, 2)}\n`);
  await mkdir(path.join(root, ".silver/results/skills"), { recursive: true });
  const output = reference("joined-finding", "finding", relativePath);
  for (const [invocationId, completedAt, acceptance] of [
    ["older-result", "2026-07-30T12:00:01.000Z", "awaiting-review"],
    ["newer-result", "2026-07-30T12:00:02.000Z", "rejected"],
  ]) {
    await writeFile(
      path.join(root, `.silver/results/skills/${invocationId}.json`),
      `${JSON.stringify({
        schema: "silver/skill-result/v2",
        invocation_id: invocationId,
        completed_at: completedAt,
        inputs: [{ id: "current-input", kind: "design-spec", revision: "r4", path: "design/specs/current.json" }],
        outputs: [output],
        provenance: {
          origin: "agent-assisted",
          sources: [{ id: "source", kind: "evidence", revision: "r1", path: "design/evidence/source.json" }],
          guidance: [],
          design_contexts: [],
          external_bindings: [],
        },
        acceptance: { status: acceptance },
        checks: [{ id: "contract-integrity", status: "pass" }],
        readiness: [{ name: "ideate", status: "not-ready", reasons: [] }],
      }, null, 2)}\n`,
    );
  }

  const trace = await traceArtifact({ root, target: "joined-finding" });
  assert.equal(trace.producing_result.invocation_id, "newer-result");
  assert.equal(trace.acceptance, "rejected");
  assert.deepEqual(trace.artifact_source_pins, artifact.sources);
  assert.deepEqual(trace.sources, artifact.sources);
  assert.deepEqual(trace.invocation_inputs, [{ id: "current-input", kind: "design-spec", revision: "r4", path: "design/specs/current.json" }]);
  assert.equal(trace.joined_result.selection, "newest-completed-at-then-invocation-id");
  assert.equal(trace.checks.length, 1);
  assert.ok(trace.consistency_findings.some((message) => /2 skill results/.test(message)));
  assert.ok(trace.consistency_findings.some((message) => /Artifact status accepted/.test(message)));
  assert.match(renderTrace(trace), /Producing result: newer-result/);
  assert.match(renderTrace(trace), /Artifact source pins: 1/);
  assert.match(renderTrace(trace), /Invocation inputs: 1/);
});
