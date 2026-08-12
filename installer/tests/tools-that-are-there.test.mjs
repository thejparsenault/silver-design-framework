// Regression coverage for Silver 0.8 — one test per claim the release makes.
//
// The through-line: a designer's options are never narrowed silently. Every
// transport removed from the running is named, attributed, and explained, and
// nothing is substituted on their behalf.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parse, stringify } from "yaml";

import {
  auditActivityCatalog,
  findActivity,
  loadActivityCatalog,
  providerSupportsActivity,
  skillPerformsActivity,
} from "../../framework/runtime/activities.mjs";
import { readHostMcpServers, unmappedHostServers } from "../../framework/runtime/host-mcp.mjs";
import { discoverProviders } from "../../framework/runtime/providers.mjs";
import { resolveActivityTransport } from "../../framework/runtime/transports.mjs";
import { planHostMcpConfig, writeHostMcpConfig } from "../host-mcp-config.mjs";
import { applyPracticeChange, initializePractice } from "../practice.mjs";
import { resolveStudioVoice } from "../practice-overlay.mjs";
import { setupWorkspace } from "../setup.mjs";
import { inspectTools } from "../tools.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
// A home with no agent host configuration, so availability probes cannot pick
// up whatever the machine running the tests happens to have installed.
const emptyHome = path.join(repositoryRoot, "fixtures/host/empty");

async function temporaryDirectory(t, prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function workspace(t) {
  const root = await temporaryDirectory(t, "silver-tools-");
  await setupWorkspace({ root, name: "Tools", id: "tools", date: "2026-07-31" });
  return root;
}

async function shippedProviders() {
  return discoverProviders({ home: emptyHome });
}

function transport(id, overrides = {}) {
  return {
    id,
    capabilities: ["design-file"],
    directions: ["read", "write"],
    available: true,
    availability_level: "configured",
    activities: [],
    ...overrides,
  };
}

// A provider that declares full support for `design.pull-file` — the shared
// shape most of the tests below reuse so they read as "this transport, doing
// this one job" rather than reconstructing a declaration each time.
function pullFileSupport() {
  return [{ id: "design.pull-file", support: "full", actions: ["read", "inspect"] }];
}

test("every named activity is served by a shipped provider and performed by a skill", async () => {
  const catalog = await loadActivityCatalog();
  const providers = await discoverProviders({ skipAvailability: true });
  const skills = [];
  const { readdir } = await import("node:fs/promises");
  for (const entry of await readdir(path.join(repositoryRoot, "framework/skills"), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    skills.push(
      parse(
        await readFile(
          path.join(repositoryRoot, "framework/skills", entry.name, "skill.yaml"),
          "utf8",
        ),
      ),
    );
  }
  assert.deepEqual(auditActivityCatalog({ catalog, providers, skills }), []);

  // Drift is caught in both directions, so a catalog cannot quietly promise a
  // tool that is not there, nor keep calling a served activity planned.
  const lying = {
    ...catalog,
    activities: catalog.activities.map((activity) =>
      activity.id === "design.pull-file" ? { ...activity, status: "planned" } : activity,
    ),
  };
  const findings = auditActivityCatalog({ catalog: lying, providers, skills });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /design\.pull-file is marked planned/);
});

test("a provider that cannot take an action does not support the activity", async () => {
  const catalog = await loadActivityCatalog();
  const pull = findActivity(catalog, "design.pull-file");
  const editComponents = findActivity(catalog, "system.edit-components");
  const pushTokens = findActivity(catalog, "design.push-tokens");

  // Declaring the activity is necessary but not sufficient: directions must
  // still cover the declared actions.
  const readOnly = transport("read-only", { directions: ["read"], activities: pullFileSupport() });
  assert.equal(providerSupportsActivity(readOnly, pull), true);
  assert.equal(providerSupportsActivity(readOnly, editComponents), false);

  // Artifact kinds narrow further: editing components and pushing tokens are
  // both (design-file, write) and must stay distinguishable.
  const componentsOnly = transport("components-only", {
    supported_artifact_kinds: ["component-catalog"],
    activities: [
      { id: "system.edit-components", support: "full", actions: ["create", "write", "update"] },
      { id: "design.push-tokens", support: "full", actions: ["write", "update"] },
    ],
  });
  assert.equal(providerSupportsActivity(componentsOnly, editComponents), true);
  assert.equal(providerSupportsActivity(componentsOnly, pushTokens), false);
});

test("pull and push resolve to different transports in one workspace", async () => {
  const catalog = await loadActivityCatalog();
  const providers = [
    transport("reader", { directions: ["read"], activities: pullFileSupport() }),
    transport("writer", {
      directions: ["read", "write"],
      activities: [{ id: "design.push-tokens", support: "full", actions: ["write", "update"] }],
    }),
  ];
  const sources = [
    {
      source: "project",
      preferences: {
        activities: {
          "design.pull-file": { use: ["reader"] },
          "design.push-tokens": { use: ["writer"] },
        },
      },
    },
  ];
  const pull = resolveActivityTransport({
    activity: findActivity(catalog, "design.pull-file"),
    providers,
    sources,
  });
  const push = resolveActivityTransport({
    activity: findActivity(catalog, "design.push-tokens"),
    providers,
    sources,
  });
  assert.equal(pull.selected, "reader");
  assert.equal(push.selected, "writer");
  assert.equal(pull.ordered_by, "project");
});

test("a project order beats the framework default", async () => {
  const catalog = await loadActivityCatalog();
  const providers = [
    transport("alpha", { activities: pullFileSupport() }),
    transport("zulu", { activities: pullFileSupport() }),
  ];
  const activity = findActivity(catalog, "design.pull-file");

  // Framework order is alphabetical once availability and evidence tie.
  assert.equal(resolveActivityTransport({ activity, providers }).selected, "alpha");
  assert.equal(
    resolveActivityTransport({
      activity,
      providers,
      sources: [
        { source: "project", preferences: { activities: { "design.pull-file": { use: ["zulu"] } } } },
      ],
    }).selected,
    "zulu",
  );
});

test("an unavailable first choice asks rather than substituting", async () => {
  const catalog = await loadActivityCatalog();
  const activity = findActivity(catalog, "design.pull-file");
  const providers = [
    transport("preferred", {
      available: false,
      availability_level: "absent",
      availability_reason: "Not configured in this agent host.",
      connection: { kind: "mcp", server: "preferred" },
      activities: pullFileSupport(),
    }),
    transport("second", { activities: pullFileSupport() }),
  ];
  const sources = [
    {
      source: "project",
      preferences: { activities: { "design.pull-file": { use: ["preferred", "second"] } } },
    },
  ];

  const asked = resolveActivityTransport({ activity, providers, sources, interactive: true });
  assert.equal(asked.decision, "ask");
  assert.equal(asked.selected, null, "the second transport must not be chosen for the designer");
  assert.deepEqual(asked.options, ["second"]);
  assert.equal(asked.removed[0].reason, "unavailable");
  assert.equal(asked.removed[0].failing_step, "connection");
  assert.equal(asked.removed[0].fixable_by, "designer");

  // Opting in is what allows the chain to be walked.
  const walked = resolveActivityTransport({
    activity,
    providers,
    sources: [
      {
        source: "project",
        preferences: {
          activities: {
            "design.pull-file": { use: ["preferred", "second"], on_unavailable: "use_next" },
          },
        },
      },
    ],
  });
  assert.equal(walked.decision, "fallback");
  assert.equal(walked.selected, "second");
});

test("with nobody to ask, the run stops instead of choosing", async () => {
  const catalog = await loadActivityCatalog();
  const stopped = resolveActivityTransport({
    activity: findActivity(catalog, "design.pull-file"),
    providers: [
      transport("preferred", {
        available: false,
        availability_reason: "down",
        activities: pullFileSupport(),
      }),
      transport("second", { activities: pullFileSupport() }),
    ],
    sources: [
      {
        source: "project",
        preferences: { activities: { "design.pull-file": { use: ["preferred", "second"] } } },
      },
    ],
    interactive: false,
  });
  assert.equal(stopped.decision, "stop");
  assert.equal(stopped.selected, null);
  assert.equal(stopped.would_select, "second");
  assert.match(stopped.reason, /non-interactive/);
});

test("a veto is never overridable and always names its source", async () => {
  const catalog = await loadActivityCatalog();
  const resolution = resolveActivityTransport({
    activity: findActivity(catalog, "design.pull-file"),
    providers: [transport("remote", { activities: pullFileSupport() })],
    sources: [
      {
        source: "project",
        preferences: { activities: { "design.pull-file": { use: ["remote"] } } },
      },
      {
        source: "team",
        preferences: {
          forbid: [
            {
              transport: "remote",
              reason: "Design files must not transit a third party.",
              fixable_by: "policy-owner",
            },
          ],
        },
      },
    ],
  });
  assert.equal(resolution.selected, null);
  assert.equal(resolution.decision, "none");
  assert.equal(resolution.removed[0].reason, "vetoed");
  assert.equal(resolution.removed[0].source, "team");
  assert.equal(resolution.removed[0].fixable_by, "policy-owner");
  assert.match(resolution.removed[0].detail, /third party/);
});

test("an unmapped host server is surfaced but never selected", async (t) => {
  const root = await workspace(t);
  const home = await temporaryDirectory(t, "silver-home-");
  await writeFile(
    path.join(home, ".claude.json"),
    JSON.stringify({ mcpServers: { "some-design-tool": { command: "x" } } }),
    "utf8",
  );

  const servers = await readHostMcpServers({ root, home });
  assert.ok(servers.some(({ name }) => name === "some-design-tool"));

  const providers = await discoverProviders({ root, home });
  const unmapped = await unmappedHostServers({ root, providers, home });
  assert.deepEqual(
    unmapped.map(({ name }) => name),
    ["some-design-tool"],
  );

  const report = await inspectTools({ root, home });
  assert.deepEqual(
    report.unmapped.map(({ name }) => name),
    ["some-design-tool"],
  );
  // Present in the report, absent from every chain: Silver knows it exists and
  // nothing more, so it must not be put to work on a guess.
  for (const activity of report.activities) {
    assert.notEqual(activity.selected, "some-design-tool");
    assert.ok(!activity.chain.includes("some-design-tool"));
  }
});

test("connecting writes a declaration, never a credential, and never installs", async (t) => {
  const root = await workspace(t);
  const providers = await shippedProviders();

  const written = await writeHostMcpConfig({ root, providers, transport: "figma-official-mcp" });
  assert.equal(written.written, true);
  const config = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8"));
  assert.ok(config.mcpServers.figma);
  assert.equal(
    JSON.stringify(config).toLowerCase().includes("token"),
    false,
    "a generated host declaration must never carry a credential",
  );

  // Re-running changes nothing.
  const again = await writeHostMcpConfig({ root, providers, transport: "figma-official-mcp" });
  assert.equal(again.written, false);
  assert.deepEqual(again.already_present, ["figma-official-mcp"]);

  // A transport whose launch command Silver does not know is handed back as
  // manual work rather than guessed into someone's agent configuration.
  const manual = await planHostMcpConfig({ root, providers, transport: "figma-console-mcp" });
  assert.equal(manual.additions.length, 0);
  assert.equal(manual.manual_only.transport, "figma-console-mcp");
  assert.ok(manual.manual_only.manual_steps.length > 0);
});

test("Silver refuses to rewrite a host config that already holds a secret", async (t) => {
  const root = await workspace(t);
  await writeFile(
    path.join(root, ".mcp.json"),
    JSON.stringify({ mcpServers: { existing: { url: "https://x", api_key: "abc123" } } }),
    "utf8",
  );
  await assert.rejects(
    () => writeHostMcpConfig({ root, providers: shippedProvidersSync, transport: "figma-official-mcp" }),
    /Secret-bearing field|providers/,
  );
});

test("post-setup notes are informational only — nothing shells out to satisfy them", async () => {
  // 0.9 replaced the authored setup ladder with generically derived rungs plus
  // freeform `post_setup` notes. The ceiling still holds and is asserted
  // against the source rather than by observation: no code path runs a
  // transport's commands, in either the file that used to and the one that
  // derives diagnosis today.
  for (const file of ["installer/host-mcp-config.mjs", "framework/runtime/transport-diagnosis.mjs"]) {
    const source = await readFile(path.join(repositoryRoot, file), "utf8");
    assert.equal(
      /child_process|\bspawn\(|\bexecFile\(|[^.\w]exec\(/.test(source),
      false,
      `${file} must not shell out`,
    );
  }
  const providers = await shippedProviders();
  for (const provider of providers) {
    for (const note of provider.post_setup ?? []) {
      assert.equal(typeof note, "string", `${provider.id}'s post_setup entries must be plain notes`);
    }
  }
});

test("changing a studio voice through practice apply changes what resolves", async (t) => {
  const practiceRoot = await temporaryDirectory(t, "silver-practice-");
  await initializePractice({ root: practiceRoot, now: "2026-07-31T00:00:00Z" });

  // The seeded starter is commented out, so the framework default still wins.
  const before = await resolveStudioVoice({ practiceRoot });
  assert.equal(before.source, "framework");

  await applyPracticeChange({
    root: practiceRoot,
    now: "2026-07-31T00:00:00Z",
    proposal: {
      schema: "silver/practice-change/v1",
      id: "voice-change",
      kind: "practice-change",
      revision: "r1",
      summary: "Be blunt and bring options",
      reason: "The default register is too even for how I work.",
      expected_practice_revision: "r1",
      sanitization: { reviewed: true, removed: [] },
      provenance: {
        schema: "silver/provenance/v1",
        origin: "human-authored",
        recorded_at: "2026-07-31T00:00:00Z",
        sources: [],
        guidance: [],
        design_contexts: [],
        change: { reason: "Record how I want the agent to talk." },
        acceptance: "not-required",
        external_bindings: [],
      },
      updates: [
        {
          section: "studio-voice",
          content: "Lead with the idea. Bring two options and say which you would pick.",
        },
      ],
    },
  });

  // Before 0.8 this appended prose to PRACTICE.md, which the resolver never
  // reads: the sanctioned path validated, committed, reported success, and did
  // nothing at all.
  const after = await resolveStudioVoice({ practiceRoot });
  assert.equal(after.source, "practice");
  assert.match(after.body, /Bring two options/);
  const manifest = parse(
    await readFile(path.join(practiceRoot, ".silver/practice.yaml"), "utf8"),
  );
  assert.equal(manifest.studio_voice, "studio-voice.md");
});

// Resolved once at module scope so the secret test can pass providers without
// awaiting inside assert.rejects.
const shippedProvidersSync = await shippedProviders();
