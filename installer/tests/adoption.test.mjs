// Adopting a repository that already has work in it.
//
// One invariant matters more than all the others here and most of this file
// exists to defend it: **adoption never changes a file that already exists.**
// Every disposition is additive. If any test in this file can be made to pass
// while an original byte changes, the feature is broken regardless of what else
// works.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  applyAdoptionPlan,
  appendArtifactsToSource,
  enumerateRepository,
  inspectAdoption,
  readAdoptionRecord,
} from "../adopt.mjs";
import { doctorWorkspace } from "../doctor.mjs";
import { snapshotFiles } from "../lib/files.mjs";
import { setupWorkspace } from "../setup.mjs";

const run = promisify(execFile);

async function temporaryRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-adopt-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

// Three shapes of real repository: a docs-only one, a React app with a token
// file, and a plain HTML/CSS site. Adoption has to behave the same in all three
// without knowing which is which.
const FIXTURES = {
  docs: {
    "package.json": '{"name":"docs-only"}\n',
    "docs/design-guidelines.md": "# Design guidelines\n\nColour, type, spacing.\n",
    "docs/voice.md": "# Voice\n\nPlain and direct.\n",
  },
  react: {
    "package.json": '{"name":"app","dependencies":{"react":"19.0.0"}}\n',
    "src/tokens.json": '{"color":{"brand":"#2f5d62"}}\n',
    "src/components/Button.jsx": "export const Button = () => null;\n",
    "README.md": "# App\n",
  },
  static: {
    "index.html": "<!doctype html><title>Site</title>\n",
    "styles/site.css": ":root { --brand: #2f5d62; }\n",
    "brand/logo.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>\n",
  },
};

async function buildFixture(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = path.join(root, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
}

async function installedWorkspace(t, fixture = FIXTURES.docs) {
  const root = await temporaryRoot(t);
  await buildFixture(root, fixture);
  await setupWorkspace({
    root,
    name: "Existing Product",
    id: "existing-product",
    sourceReference: "framework-development-fixture",
  });
  return root;
}

// The original files, exactly as the product team left them.
async function originals(root, fixture) {
  const captured = new Map();
  for (const relativePath of Object.keys(fixture)) {
    captured.set(relativePath, await readFile(path.join(root, relativePath), "utf8"));
  }
  return captured;
}

async function assertOriginalsUntouched(root, before) {
  for (const [relativePath, content] of before) {
    assert.equal(
      await readFile(path.join(root, relativePath), "utf8"),
      content,
      `${relativePath} was modified; adoption must never rewrite existing work.`,
    );
  }
}

function decided(plan, items) {
  return { ...plan, items };
}

test("enumeration reports paths without guessing what they mean", async (t) => {
  const root = await temporaryRoot(t);
  await buildFixture(root, FIXTURES.react);
  await buildFixture(root, {
    "node_modules/react/index.js": "module.exports = {};\n",
    "dist/bundle.js": "console.log(1);\n",
    "coverage/report.html": "<html></html>\n",
  });

  const discovered = await enumerateRepository(root);
  const paths = discovered.entries.map((entry) => entry.path);

  assert.ok(paths.includes("src/tokens.json"));
  assert.ok(paths.includes("src/components/Button.jsx"));
  // Dependencies, build output, and coverage are nobody's design material.
  assert.ok(!paths.some((entry) => entry.startsWith("node_modules")));
  assert.ok(!paths.some((entry) => entry.startsWith("dist")));
  assert.ok(!paths.some((entry) => entry.startsWith("coverage")));
  assert.ok(discovered.skipped_directories.includes("node_modules"));

  // Facts only. An entry carries a kind and a size, never a classification.
  const tokens = discovered.entries.find((entry) => entry.path === "src/tokens.json");
  assert.equal(tokens.entry_kind, "file");
  assert.ok(tokens.size > 0);
  assert.deepEqual(Object.keys(tokens).sort(), ["entry_kind", "path", "size"]);
});

test("enumeration is bounded and says so rather than trimming silently", async (t) => {
  const root = await temporaryRoot(t);
  const deep = {};
  for (let index = 0; index < 60; index += 1) {
    deep[`wide/file-${index}.md`] = `# ${index}\n`;
  }
  deep["a/b/c/d/e/buried.md"] = "# Buried\n";
  await buildFixture(root, deep);

  const discovered = await enumerateRepository(root, { depthLimit: 2 });

  assert.equal(discovered.truncated, true);
  assert.ok(!discovered.entries.some((entry) => entry.path.includes("c/d")));
  const wide = discovered.entries.find((entry) => entry.path === "wide");
  assert.equal(wide.truncated, true);
});

test("enumeration excludes what Silver itself installed", async (t) => {
  const root = await installedWorkspace(t);

  const discovered = await enumerateRepository(root);
  const paths = discovered.entries.map((entry) => entry.path);

  // Otherwise the first thing adoption asks a designer is whether they would
  // like to adopt Silver into itself.
  for (const owned of [".silver", ".skills", "design", "AGENTS.md", "CLAUDE.md"]) {
    assert.ok(
      !paths.some((entry) => entry === owned || entry.startsWith(`${owned}/`)),
      `${owned} is Silver's own and must not be offered for adoption.`,
    );
  }
  assert.ok(paths.includes("docs/design-guidelines.md"));
});

test("inspect returns a question per undecided entry in the shape hosts render", async (t) => {
  const root = await installedWorkspace(t);

  const plan = await inspectAdoption({ root });

  assert.equal(plan.schema, "silver/adoption-plan/v1");
  // Silver enumerates; it proposes nothing. Every item is the agent's to add.
  assert.deepEqual(plan.items, []);
  assert.ok(plan.questions.length > 0);
  const question = plan.questions[0];
  for (const field of ["id", "question", "explanation", "options", "reversible"]) {
    assert.ok(field in question, `question is missing ${field}`);
  }
  for (const option of question.options) {
    assert.ok(option.value && option.summary && option.effect);
  }
});

test("register-in-place names an existing file without moving or rewriting it", async (t) => {
  const root = await installedWorkspace(t);
  const before = await originals(root, FIXTURES.docs);
  const plan = await inspectAdoption({ root });

  const result = await applyAdoptionPlan({
    plan: decided(plan, [
      {
        id: "existing-guidelines",
        path: "docs/design-guidelines.md",
        entry_kind: "file",
        observed: "Prose covering colour, type, and spacing.",
        agent_reading: "This product's design system.",
        confidence: "high",
        proposed_disposition: "register-in-place",
        rationale: "Already the team's source of truth.",
        artifact: {
          id: "existing-design-system",
          kind: "design-system",
          scope: "product",
          role: "canonical",
          status: "active",
        },
        decision: "accepted",
        decided_by: "test",
      },
    ]),
    checkpoint: false,
  });

  await assertOriginalsUntouched(root, before);
  assert.deepEqual(result.applied, [
    {
      id: "existing-guidelines",
      path: "docs/design-guidelines.md",
      disposition: "register-in-place",
    },
  ]);

  const manifest = await readFile(path.join(root, "design/manifest.yaml"), "utf8");
  assert.match(manifest, /path: docs\/design-guidelines\.md/);
  // Registered, not owned: the checkers must not demand Silver frontmatter in a
  // file the product team wrote, because satisfying them would mean editing it.
  assert.match(manifest, /origin: adopted/);
  assert.equal((await doctorWorkspace({ root })).ok, true);
});

test("translate writes a new artifact and leaves the source alone", async (t) => {
  const root = await installedWorkspace(t, FIXTURES.react);
  const before = await originals(root, FIXTURES.react);
  const plan = await inspectAdoption({ root });

  await applyAdoptionPlan({
    plan: decided(plan, [
      {
        id: "app-tokens",
        path: "src/tokens.json",
        entry_kind: "file",
        observed: "A JSON object with one brand colour.",
        agent_reading: "A token source the app builds from.",
        confidence: "medium",
        proposed_disposition: "translate",
        rationale: "Worth a Silver artifact that records where it came from.",
        target_path: "design/work/adopted-tokens.md",
        content: "# Adopted tokens\n\nDerived from src/tokens.json.\n",
        decision: "accepted",
        decided_by: "test",
      },
    ]),
    checkpoint: false,
  });

  await assertOriginalsUntouched(root, before);
  assert.match(
    await readFile(path.join(root, "design/work/adopted-tokens.md"), "utf8"),
    /Derived from src\/tokens\.json/,
  );
});

test("a disposition may not write outside its own scope", async (t) => {
  const root = await installedWorkspace(t);
  const plan = await inspectAdoption({ root });

  // A plan is untrusted input. A translate that could land anywhere would make
  // the additive-only rule a promise rather than a property.
  await assert.rejects(
    applyAdoptionPlan({
      plan: decided(plan, [
        {
          id: "escape-attempt",
          path: "docs/design-guidelines.md",
          entry_kind: "file",
          observed: "Prose.",
          agent_reading: "Design system.",
          confidence: "low",
          proposed_disposition: "translate",
          rationale: "Trying to write outside design/.",
          target_path: "src/components/Button.jsx",
          content: "clobbered\n",
          decision: "accepted",
        },
      ]),
      checkpoint: false,
    }),
    /may not write src\/components\/Button\.jsx/,
  );
});

test("translate refuses to overwrite a file that already exists", async (t) => {
  const root = await installedWorkspace(t);
  const before = await readFile(path.join(root, "design/brand.md"), "utf8");
  const plan = await inspectAdoption({ root });

  await assert.rejects(
    applyAdoptionPlan({
      plan: decided(plan, [
        {
          id: "collide",
          path: "docs/design-guidelines.md",
          entry_kind: "file",
          observed: "Prose.",
          agent_reading: "Brand material.",
          confidence: "low",
          proposed_disposition: "translate",
          rationale: "Targets an existing artifact.",
          target_path: "design/brand.md",
          content: "clobbered\n",
          decision: "accepted",
        },
      ]),
      checkpoint: false,
    }),
    /EEXIST/,
  );
  assert.equal(await readFile(path.join(root, "design/brand.md"), "utf8"), before);
});

test("a credential read out of an existing repository is never written on", async (t) => {
  const root = await installedWorkspace(t);
  const plan = await inspectAdoption({ root });

  // The realistic path: an agent reads a real config file and carries what it
  // found into a design artifact that then gets committed.
  await assert.rejects(
    applyAdoptionPlan({
      plan: decided(plan, [
        {
          id: "leaky",
          path: "docs/design-guidelines.md",
          entry_kind: "file",
          observed: "Prose, plus a stray token in an example.",
          agent_reading: "Design system with an embedded example.",
          confidence: "medium",
          proposed_disposition: "translate",
          rationale: "Carries the example through verbatim.",
          target_path: "design/work/leaky.md",
          content: "# Notes\n\nUse figd_aaaaaaaaaaaaaaaaaaaaaaaaaaaa to authenticate.\n",
          decision: "accepted",
        },
      ]),
      checkpoint: false,
    }),
    /looks like a credential/,
  );
});

test("nothing is applied until every scoped item is decided", async (t) => {
  const root = await installedWorkspace(t);
  const plan = await inspectAdoption({ root });
  const items = [
    {
      id: "decided",
      path: "docs/design-guidelines.md",
      entry_kind: "file",
      observed: "Prose.",
      agent_reading: "Design system.",
      confidence: "high",
      proposed_disposition: "ignore",
      rationale: "Decided.",
      decision: "accepted",
    },
    {
      id: "undecided",
      path: "docs/voice.md",
      entry_kind: "file",
      observed: "Prose.",
      agent_reading: "Voice guidance.",
      confidence: "medium",
      proposed_disposition: "register-in-place",
      rationale: "Nobody has answered yet.",
      artifact: {
        id: "existing-voice",
        kind: "voice",
        scope: "product",
        role: "canonical",
        status: "active",
      },
      decision: "pending",
    },
  ];

  await assert.rejects(
    applyAdoptionPlan({ plan: decided(plan, items), checkpoint: false }),
    /Still pending: undecided/,
  );

  // --only is the escape hatch: apply the decided subset, keep asking about the rest.
  const result = await applyAdoptionPlan({
    plan: decided(plan, items),
    only: ["decided"],
    checkpoint: false,
  });
  assert.equal(result.applied.length, 1);
});

test("a plan built against a different working tree is refused", async (t) => {
  const root = await installedWorkspace(t);
  const plan = await inspectAdoption({ root });
  await writeFile(path.join(root, "docs/late-arrival.md"), "# Added after\n");

  await assert.rejects(
    applyAdoptionPlan({
      plan: decided(plan, [
        {
          id: "stale",
          path: "docs/design-guidelines.md",
          entry_kind: "file",
          observed: "Prose.",
          agent_reading: "Design system.",
          confidence: "high",
          proposed_disposition: "ignore",
          rationale: "Plan is stale.",
          decision: "accepted",
        },
      ]),
      checkpoint: false,
    }),
    /built against a different state/,
  );
});

test("decisions are recorded so a second pass stops re-asking", async (t) => {
  const root = await installedWorkspace(t);
  const plan = await inspectAdoption({ root });

  await applyAdoptionPlan({
    plan: decided(plan, [
      {
        id: "not-design",
        path: "package.json",
        entry_kind: "file",
        observed: "An npm manifest.",
        agent_reading: "Build configuration, not design material.",
        confidence: "high",
        proposed_disposition: "ignore",
        rationale: "Not design material.",
        decision: "accepted",
      },
      {
        id: "declined",
        path: "docs/voice.md",
        entry_kind: "file",
        observed: "Prose about tone.",
        agent_reading: "Voice guidance.",
        confidence: "medium",
        proposed_disposition: "register-in-place",
        rationale: "Offered, and declined.",
        artifact: {
          id: "existing-voice",
          kind: "voice",
          scope: "product",
          role: "canonical",
          status: "active",
        },
        decision: "rejected",
      },
    ]),
    checkpoint: false,
  });

  const record = await readAdoptionRecord(root);
  assert.equal(record.length, 2);
  // A rejection is a decision too. Without recording it, every run re-asks.
  assert.equal(
    record.find((entry) => entry.id === "declined").disposition,
    "leave-in-place",
  );

  const second = await inspectAdoption({ root });
  const asked = second.questions.map((question) => question.id);
  assert.ok(!asked.some((id) => id.includes("package-json")));
  assert.ok(!asked.some((id) => id.includes("voice")));
});

test("a second repository is read for translation and never written to", async (t) => {
  const root = await installedWorkspace(t);
  const source = await temporaryRoot(t);
  await buildFixture(source, FIXTURES.static);
  const sourceBefore = await snapshotFiles(source);

  const plan = await inspectAdoption({ root, source });

  assert.equal(plan.source.kind, "local");
  assert.ok(
    plan.discovered.entries.some((entry) => entry.path === "styles/site.css"),
    "the source repository's own files should be enumerated",
  );

  await applyAdoptionPlan({
    plan: decided(plan, [
      {
        id: "site-styles",
        path: "styles/site.css",
        entry_kind: "file",
        observed: "A CSS custom property holding a brand colour.",
        agent_reading: "The live site's brand colour.",
        confidence: "medium",
        proposed_disposition: "translate",
        rationale: "Record what the shipped site actually uses.",
        target_path: "design/work/site-brand.md",
        content: "# Site brand\n\nTranslated from the marketing site.\n",
        decision: "accepted",
      },
    ]),
    checkpoint: false,
  });

  assert.deepEqual(await snapshotFiles(source), sourceBefore);
  assert.match(
    await readFile(path.join(root, "design/work/site-brand.md"), "utf8"),
    /Translated from the marketing site/,
  );
});

test("appending to the manifest leaves the rest of it byte-identical", async (t) => {
  const source = [
    "schema: silver/manifest/v1",
    "",
    "artifacts:",
    "  - id: brand",
    "    kind: brand",
    "    path: design/brand.md",
    "    scope: product",
    "    role: canonical",
    "    status: draft",
    "    authority:",
    "      type: local",
    "",
    "checks:",
    "  policy_profile: prototype",
    "",
  ].join("\n");

  const updated = appendArtifactsToSource(source, [
    {
      id: "adopted-system",
      kind: "design-system",
      path: "docs/design-guidelines.md",
      scope: "product",
      role: "canonical",
      status: "active",
    },
  ]);

  const addedBlock = [
    "  - id: adopted-system",
    "    kind: design-system",
    "    path: docs/design-guidelines.md",
    "    scope: product",
    "    role: canonical",
    "    status: active",
    "    authority:",
    "      type: local",
    "    origin: adopted",
    "",
  ].join("\n");

  // A canonical, hand-edited file. Re-serializing it to add an entry would drop
  // its blank lines and comments and turn a nine-line addition into a whole-file
  // diff — so removing exactly what was added must give back the original byte
  // for byte, including the blank line before `checks:`.
  assert.equal(updated.replace(addedBlock, ""), source);
  // The new entry lands inside the artifacts block, after what was already there.
  assert.ok(updated.indexOf("- id: brand") < updated.indexOf("- id: adopted-system"));
  assert.ok(updated.indexOf("- id: adopted-system") < updated.indexOf("checks:"));
});

test("an accepted adoption is checkpointed with the files it touched", async (t) => {
  const root = await installedWorkspace(t);
  await run("git", ["-C", root, "init", "-q"]);
  await run("git", ["-C", root, "add", "-A"]);
  await run("git", [
    "-C",
    root,
    "-c",
    "user.email=test@local",
    "-c",
    "user.name=Test",
    "commit",
    "-qm",
    "existing work",
  ]);

  const plan = await inspectAdoption({ root });
  const result = await applyAdoptionPlan({
    plan: decided(plan, [
      {
        id: "guidelines",
        path: "docs/design-guidelines.md",
        entry_kind: "file",
        observed: "Prose.",
        agent_reading: "Design system.",
        confidence: "high",
        proposed_disposition: "register-in-place",
        rationale: "Name it where it sits.",
        artifact: {
          id: "adopted-system",
          kind: "design-system",
          scope: "product",
          role: "canonical",
          status: "active",
        },
        decision: "accepted",
      },
    ]),
  });

  assert.equal(result.checkpoint.status, "committed");
  // Manifest, generated index, and lock move together or the workspace
  // disagrees with itself the moment doctor runs.
  for (const expected of ["design/manifest.yaml", "design/INDEX.md", ".silver/lock.yaml"]) {
    assert.ok(result.paths.includes(expected), `${expected} should be checkpointed`);
  }
  assert.equal((await doctorWorkspace({ root })).ok, true);
});
