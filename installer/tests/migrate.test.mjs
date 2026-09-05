import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parse, stringify } from "yaml";

import { doctorWorkspace } from "../doctor.mjs";
import { exists, snapshotFiles } from "../lib/files.mjs";
import { migrateWorkspace } from "../migrate.mjs";
import { validateSchema } from "../lib/schemas.mjs";
import { setupWorkspace } from "../setup.mjs";
import { runCli } from "../cli.mjs";

async function legacyWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({
    root,
    name: "Legacy Product",
    id: "legacy-product",
    date: "2026-07-23",
    version: "0.4.0",
    sourceReference: "migration-fixture-source",
  });
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const currentLock = parse(await readFile(lockPath, "utf8"));
  const brand = currentLock.packages.find(({ id }) => id === "brand");
  // A v0.1.0-alpha.1 workspace predates design/system entirely — it shipped
  // reference-system, which is what a genuinely legacy lock would still name.
  // v1's schema keeps "reference-system" in its enum for exactly this reason.
  const legacyLock = {
    schema: "silver/lock/v1",
    framework: {
      version: "0.1.0-alpha.1",
      source: { type: "local", reference: "legacy-fixture" },
    },
    packages: [
      {
        id: "brand",
        type: "skill",
        version: "0.1.0-alpha.1",
        ownership: "framework-managed",
        integrity: brand.integrity,
      },
      {
        id: "reference-system",
        type: "reference-system",
        version: "0.1.0-alpha.1",
        ownership: "copied-and-owned",
        integrity: `sha256:${"a".repeat(64)}`,
      },
    ],
    managed_files: currentLock.managed_files,
  };
  await writeFile(lockPath, stringify(legacyLock), "utf8");

  for (const skill of await readdir(path.join(root, ".skills"))) {
    if (skill !== "brand") await rm(path.join(root, ".skills", skill), { recursive: true, force: true });
  }
  for (const relative of ["schemas", "guardrails", "runtime", "playbooks"]) {
    await rm(path.join(root, ".silver", relative), { recursive: true, force: true });
  }
  for (const relative of [
    "design/assets",
    "design/presentation-kit",
    "design/work",
    "presentations",
    "production",
  ]) {
    await rm(path.join(root, relative), { recursive: true, force: true });
  }
  const manifestPath = path.join(root, "design", "manifest.yaml");
  const manifest = parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts = manifest.artifacts.filter(
    ({ id }) => !["project-assets", "presentation-kit"].includes(id),
  );
  manifest.artifacts.push({
    id: "permissions",
    kind: "permission-policy",
    path: "design/permissions.yaml",
    scope: "codebase",
    role: "canonical",
    status: "active",
    authority: { type: "local" },
  });
  manifest.permission_policy = "design/permissions.yaml";
  await writeFile(
    path.join(root, "design", "permissions.yaml"),
    "schema: silver/permission-policy/v1\nid: legacy-policy\ndefault_decision: ask\nrules: []\n",
    "utf8",
  );
  manifest.checks.enabled = [
    "artifact-schema",
    "flow-structure",
    "semantic-style",
    "prototype-policy",
    "accessibility",
    "responsive",
  ];
  manifest.checks.suites = {
    fast: ["artifact-schema", "flow-structure", "semantic-style", "prototype-policy"],
    browser: ["accessibility", "responsive"],
    full: ["artifact-schema", "flow-structure", "semantic-style", "prototype-policy", "accessibility", "responsive"],
  };
  await writeFile(manifestPath, stringify(manifest), "utf8");
  return root;
}

function comparable(snapshot) {
  return [...snapshot.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, content]) => [name, content.toString("base64")]);
}

test("migration preview is read-only and apply upgrades the installed shape without changing owned work", async (t) => {
  const root = await legacyWorkspace(t);
  const brandPath = path.join(root, "design", "brand.md");
  const ownedBrand = `${await readFile(brandPath, "utf8")}\nProject-owned legacy note.\n`;
  await writeFile(brandPath, ownedBrand, "utf8");
  const before = comparable(await snapshotFiles(root));

  const preview = await migrateWorkspace({
    root,
    date: "2026-07-24",
    sourceReference: "migration-test",
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.applied, false);
  assert.ok(preview.changes.some(({ action }) => action === "upgrade-lock"));
  assert.deepEqual(comparable(await snapshotFiles(root)), before);

  const applied = await migrateWorkspace({
    root,
    apply: true,
    date: "2026-07-24",
    sourceReference: "migration-test",
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.applied, true);
  assert.equal(await readFile(brandPath, "utf8"), ownedBrand);
  const lock = parse(await readFile(path.join(root, ".silver", "lock.yaml"), "utf8"));
  assert.equal(lock.schema, "silver/lock/v2");
  assert.equal(lock.framework.version, "0.9.2");
  // 0.9 adds the silver-browser-local provider, the shipped transport
  // catalog, and W10's collect/structure/measure skills (visualize replaces
  // sketch rather than adding to the count).
  assert.equal(lock.packages.length, 36);
  assert.equal(lock.packages.filter(({ type }) => type === "skill").length, 25);
  const manifest = parse(await readFile(path.join(root, "design", "manifest.yaml"), "utf8"));
  assert.ok(manifest.artifacts.some(({ id }) => id === "project-assets"));
  assert.ok(manifest.artifacts.some(({ id }) => id === "presentation-kit"));
  assert.ok(manifest.artifacts.some(({ id }) => id === "default-design-context"));
  assert.ok(manifest.artifacts.some(({ id }) => id === "component-catalog"));
  assert.ok(!manifest.artifacts.some(({ kind }) => kind === "permission-policy"));
  assert.equal(manifest.permission_policy, undefined);
  assert.equal(applied.inactiveArtifacts[0].path, "design/permissions.yaml");
  await readFile(path.join(root, "design", "permissions.yaml"), "utf8");
  const bootstrap = JSON.parse(
    await readFile(
      path.join(root, ".silver", "provenance", "legacy-artifacts.json"),
      "utf8",
    ),
  );
  assert.equal(bootstrap.schema, "silver/provenance-bootstrap/v1");
  assert.equal(
    bootstrap.artifacts.find(({ id }) => id === "brand").origin,
    "legacy",
  );
  assert.ok(manifest.checks.enabled.includes("critical-interactions"));
  assert.equal((await doctorWorkspace({ root })).ok, true);

  const repeat = await migrateWorkspace({ root, apply: true });
  assert.equal(repeat.needed, false);
  assert.equal(repeat.applied, false);
});

test("migration stops before all writes when a managed legacy skill was edited", async (t) => {
  const root = await legacyWorkspace(t);
  const skillPath = path.join(root, ".skills", "brand", "SKILL.md");
  await writeFile(skillPath, `${await readFile(skillPath, "utf8")}\nLocal edit.\n`, "utf8");
  const before = comparable(await snapshotFiles(root));
  const result = await migrateWorkspace({ root, apply: true, date: "2026-07-24" });
  assert.equal(result.ok, false);
  assert.equal(result.applied, false);
  assert.ok(result.conflicts.some(({ package: id }) => id === "brand"));
  assert.deepEqual(comparable(await snapshotFiles(root)), before);
});

test("0.4-to-current migration preserves an edited legacy policy as inactive and bootstraps provenance", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-04-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({
    root,
    name: "Silver 0.4 workspace",
    id: "silver-04-workspace",
    date: "2026-07-30",
  });
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.4.0";
  await writeFile(lockPath, stringify(lock), "utf8");

  const manifestPath = path.join(root, "design", "manifest.yaml");
  const manifest = parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts.push({
    id: "permissions",
    kind: "permission-policy",
    path: "design/permissions.yaml",
    scope: "codebase",
    role: "canonical",
    status: "active",
    authority: { type: "local" },
  });
  manifest.permission_policy = "design/permissions.yaml";
  await writeFile(manifestPath, stringify(manifest), "utf8");
  const editedPolicy = "Project-owned legacy policy notes.\n";
  await writeFile(path.join(root, "design", "permissions.yaml"), editedPolicy);
  await writeFile(
    path.join(root, "design", "work", "legacy-note.md"),
    "Legacy working artifact.\n",
  );

  const preview = await migrateWorkspace({ root });
  assert.equal(preview.fromVersion, "0.4.0");
  assert.equal(preview.toVersion, "0.9.2");
  assert.ok(
    preview.changes.some(({ action }) => action === "bootstrap-provenance"),
  );
  assert.equal(preview.inactiveArtifacts[0].path, "design/permissions.yaml");

  const applied = await migrateWorkspace({
    root,
    apply: true,
    date: "2026-07-30",
  });
  assert.equal(applied.applied, true);
  assert.equal(
    await readFile(path.join(root, "design", "permissions.yaml"), "utf8"),
    editedPolicy,
  );
  const bootstrap = JSON.parse(
    await readFile(
      path.join(root, ".silver", "provenance", "legacy-artifacts.json"),
      "utf8",
    ),
  );
  assert.ok(
    bootstrap.artifacts.some(
      ({ path: artifactPath }) =>
        artifactPath === "design/work/legacy-note.md",
    ),
  );
});

test("0.3 workspace previews and applies the current installation idempotently", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-03-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({
    root,
    name: "Silver 0.3 workspace",
    id: "silver-03-workspace",
    date: "2026-07-25",
  });
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.3.0";
  lock.framework.source.reference = "silver-0.3-fixture";
  lock.packages = lock.packages
    .filter(({ id }) => id !== "what-now")
    .map((record) =>
      record.ownership === "framework-managed"
        ? { ...record, version: "0.3.0" }
        : record,
    );
  await writeFile(lockPath, stringify(lock), "utf8");
  await rm(path.join(root, ".skills", "what-now"), {
    recursive: true,
    force: true,
  });
  const brandPath = path.join(root, "design", "brand.md");
  const ownedBrand = `${await readFile(brandPath, "utf8")}\nProject-owned 0.3 content.\n`;
  await writeFile(brandPath, ownedBrand, "utf8");

  const before = comparable(await snapshotFiles(root));
  const preview = await migrateWorkspace({ root });
  assert.equal(preview.ok, true);
  assert.equal(preview.needed, true);
  assert.equal(preview.applied, false);
  assert.ok(
    preview.changes.some(
      ({ package: id, action }) =>
        id === "what-now" && action === "install",
    ),
  );
  assert.deepEqual(comparable(await snapshotFiles(root)), before);

  const applied = await migrateWorkspace({ root, apply: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.applied, true);
  assert.equal(await readFile(brandPath, "utf8"), ownedBrand);
  await readFile(path.join(root, ".skills", "what-now", "SKILL.md"), "utf8");
  assert.equal((await doctorWorkspace({ root })).ok, true);

  const repeated = await migrateWorkspace({ root, apply: true });
  assert.equal(repeated.needed, false);
  assert.equal(repeated.applied, false);
});

test("0.2 v2 workspace previews, applies, and reruns the current migration idempotently", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-v2-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({
    root,
    name: "Silver 0.2 workspace",
    id: "silver-02-workspace",
    date: "2026-07-24",
  });
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.2.0";
  lock.framework.source.reference = "silver-0.2-fixture";
  lock.packages = lock.packages
    .filter(({ type }) => type !== "provider")
    .map((record) =>
      record.ownership === "framework-managed"
        ? { ...record, version: "0.2.0" }
        : record,
    );
  await writeFile(lockPath, stringify(lock), "utf8");
  await rm(path.join(root, ".silver", "providers"), { recursive: true, force: true });
  const brandPath = path.join(root, "design", "brand.md");
  const ownedBrand = `${await readFile(brandPath, "utf8")}\nProject-owned 0.2 content.\n`;
  await writeFile(brandPath, ownedBrand, "utf8");

  const before = comparable(await snapshotFiles(root));
  const preview = await migrateWorkspace({ root });
  assert.equal(preview.ok, true);
  assert.equal(preview.needed, true);
  assert.equal(preview.applied, false);
  assert.ok(preview.changes.some(({ package: id, action }) => id === "silver-portable" && action === "install"));
  // 0.8 installs Figma as separate transports rather than one provider.
  assert.ok(preview.changes.some(({ package: id, action }) => id === "figma-console-mcp" && action === "install"));
  assert.ok(preview.changes.some(({ package: id, action }) => id === "figma-official-mcp" && action === "install"));
  assert.deepEqual(comparable(await snapshotFiles(root)), before);

  const applied = await migrateWorkspace({ root, apply: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.applied, true);
  assert.equal(await readFile(brandPath, "utf8"), ownedBrand);
  const migrated = parse(await readFile(lockPath, "utf8"));
  assert.equal(migrated.framework.version, "0.9.2");
  assert.deepEqual(
    migrated.packages.filter(({ type }) => type === "provider").map(({ id }) => id).sort(),
    ["figma-console-mcp", "figma-official-mcp", "silver-browser-local", "silver-portable"],
  );
  assert.equal((await doctorWorkspace({ root })).ok, true);

  const repeated = await migrateWorkspace({ root, apply: true });
  assert.equal(repeated.needed, false);
  assert.equal(repeated.applied, false);
});

test("0.2-to-current migration surfaces edited managed packages without writing", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-v2-conflict-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Edited 0.2", id: "edited-02", date: "2026-07-24" });
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.2.0";
  lock.packages = lock.packages.filter(({ type }) => type !== "provider");
  await writeFile(lockPath, stringify(lock), "utf8");
  await rm(path.join(root, ".silver", "providers"), { recursive: true, force: true });
  const managedPath = path.join(root, ".skills", "brand", "SKILL.md");
  await writeFile(managedPath, `${await readFile(managedPath, "utf8")}\nEdited by project.\n`, "utf8");
  const before = comparable(await snapshotFiles(root));
  const result = await migrateWorkspace({ root, apply: true });
  assert.equal(result.ok, false);
  assert.equal(result.applied, false);
  assert.ok(result.conflicts.some(({ package: id }) => id === "brand"));
  assert.deepEqual(comparable(await snapshotFiles(root)), before);
});

test("a pre-adapter workspace gains the agent-host adapters without touching owned work", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-06-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({
    root,
    name: "Legacy Product",
    id: "legacy-product",
    date: "2026-07-23",
    sourceReference: "migration-fixture-source",
  });

  // Rewind the workspace to the 0.5 shape: no adapters, older lock version.
  await rm(path.join(root, "CLAUDE.md"), { force: true });
  await rm(path.join(root, ".claude"), { force: true, recursive: true });
  await rm(path.join(root, ".silver", "bin"), { force: true, recursive: true });
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.5.0";
  lock.managed_files = lock.managed_files.filter(
    ({ path: managedPath }) => managedPath !== "CLAUDE.md",
  );
  await writeFile(lockPath, stringify(lock), "utf8");
  const ownedNote = "Project-owned brand note.\n";
  const brandPath = path.join(root, "design", "brand.md");
  await writeFile(brandPath, `${await readFile(brandPath, "utf8")}${ownedNote}`);

  const preview = await migrateWorkspace({ root });
  assert.equal(preview.fromVersion, "0.5.0");
  assert.equal(preview.toVersion, "0.9.2");
  assert.equal(preview.applied, false);
  for (const expected of ["CLAUDE.md", ".claude/skills", ".silver/bin/silver"]) {
    assert.ok(
      preview.changes.some(({ path: changed }) => changed === expected),
      `preview should plan ${expected}`,
    );
  }
  assert.equal(await exists(path.join(root, "CLAUDE.md")), false);

  const applied = await migrateWorkspace({ root, apply: true });
  assert.equal(applied.applied, true);
  assert.match(
    await readFile(path.join(root, "CLAUDE.md"), "utf8"),
    /^@AGENTS\.md$/m,
  );
  assert.equal((await readdir(path.join(root, ".claude", "skills"))).length, 25);
  assert.ok(await exists(path.join(root, ".silver", "bin", "silver")));
  assert.ok(
    (await readFile(brandPath, "utf8")).endsWith(ownedNote),
    "project-owned edits survive the migration",
  );

  assert.equal((await migrateWorkspace({ root })).needed, false);
});

test("a 0.8 workspace migrates to 0.9, preserving hand-edited reference-system and installing design-system-tokens-seed", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-08-09-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({
    root,
    name: "Pre 0.9 Product",
    id: "pre-09-product",
    date: "2026-07-23",
    sourceReference: "migration-fixture-source",
  });

  // Rewind to the 0.8 shape: no design/system/tokens tree at all, a
  // hand-edited reference-system/ instead, and the old manifest/context
  // pointers that went with it.
  await rm(path.join(root, "design/system/tokens"), { recursive: true, force: true });
  await rm(path.join(root, "design/system/tokens.json"), { force: true });
  await rm(path.join(root, "design/system/showcase.html"), { force: true });
  await rm(path.join(root, "design/system/expressions"), { recursive: true, force: true });
  await rm(path.join(root, "design/system/components.json"), { force: true });
  const handEditedMarker = "/* hand-edited before 0.9 */\n.ds-button { color: var(--ds-action-primary-fg); }\n";
  await mkdir(path.join(root, "reference-system", "packages", "css", "src"), { recursive: true });
  await writeFile(
    path.join(root, "reference-system", "packages", "css", "src", "ds.css"),
    handEditedMarker,
  );

  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.8.0-pre-w9";
  lock.packages = lock.packages.filter(({ id }) => id !== "design-system-tokens-seed");
  lock.packages.push({
    id: "reference-system",
    type: "reference-system",
    path: "reference-system",
    version: "0.8.0",
    ownership: "copied-and-owned",
    integrity: `sha256:${"b".repeat(64)}`,
  });
  await writeFile(lockPath, stringify(lock), "utf8");

  const manifestPath = path.join(root, "design", "manifest.yaml");
  const manifest = parse(await readFile(manifestPath, "utf8"));
  manifest.artifacts = manifest.artifacts.filter(({ id }) => id !== "design-system-tokens");
  const componentCatalog = manifest.artifacts.find(({ id }) => id === "component-catalog");
  componentCatalog.path = "reference-system/html-contracts";
  await writeFile(manifestPath, stringify(manifest), "utf8");

  const contextPath = path.join(root, "design/contexts/default.yaml");
  const context = parse(await readFile(contextPath, "utf8"));
  delete context.token_source;
  context.component_catalog.path = "reference-system/html-contracts";
  // Before 0.9.2, provenance.schema.json still allowed (and every writer
  // populated) a `sources` field later removed as a dead mirror of the
  // invocation's own inputs. A design context or component expression
  // written under that older schema still carries it.
  context.provenance.sources = [];
  await writeFile(contextPath, stringify(context), "utf8");

  const expressionPath = path.join(root, "design/contexts/default-expression.yaml");
  const expression = parse(await readFile(expressionPath, "utf8"));
  expression.provenance.sources = [];
  await writeFile(expressionPath, stringify(expression), "utf8");

  const preview = await migrateWorkspace({ root });
  assert.equal(preview.applied, false);
  assert.ok(preview.changes.some(({ path: changed }) => changed === "design/manifest.yaml" && changed));
  assert.ok(
    preview.changes.some(
      ({ action, path: changed }) => action === "upgrade-design-context" && changed === "design/contexts/default.yaml",
    ),
  );
  assert.ok(preview.changes.some(({ package: pkg }) => pkg === "design-system-tokens-seed"));
  // Preview never writes.
  assert.equal(await exists(path.join(root, "design/system/tokens.json")), false);
  assert.equal(
    await readFile(path.join(root, "reference-system/packages/css/src/ds.css"), "utf8"),
    handEditedMarker,
  );

  const applied = await migrateWorkspace({ root, apply: true });
  assert.equal(applied.applied, true);

  // The hand-edited copied-and-owned directory is never touched.
  assert.equal(
    await readFile(path.join(root, "reference-system/packages/css/src/ds.css"), "utf8"),
    handEditedMarker,
  );

  // The new copied-and-owned seed installs fresh alongside it.
  assert.ok(await exists(path.join(root, "design/system/tokens.json")));
  assert.ok(await exists(path.join(root, "design/system/components.json")));

  const migratedManifest = parse(await readFile(manifestPath, "utf8"));
  assert.equal(
    migratedManifest.artifacts.find(({ id }) => id === "component-catalog").path,
    "design/system/components.json",
  );
  assert.ok(migratedManifest.artifacts.some(({ id }) => id === "design-system-tokens"));

  const migratedContext = parse(await readFile(contextPath, "utf8"));
  assert.equal(migratedContext.token_source.path, "design/system/tokens.json");
  assert.equal(migratedContext.component_catalog.path, "design/system/components.json");
  assert.equal("sources" in migratedContext.provenance, false);

  const migratedExpressionProvenance = parse(await readFile(expressionPath, "utf8")).provenance;
  assert.equal("sources" in migratedExpressionProvenance, false);

  assert.equal((await doctorWorkspace({ root })).ok, true);

  const migratedLock = parse(await readFile(lockPath, "utf8"));
  assert.ok(migratedLock.packages.some(({ id }) => id === "design-system-tokens-seed"));
  // The retired package is neither deleted nor tracked going forward — its
  // ownership was copied-and-owned, so migration never touches it at all.
  assert.equal(migratedLock.packages.some(({ id }) => id === "reference-system"), false);
  assert.ok(await exists(path.join(root, "reference-system")));

  assert.equal((await migrateWorkspace({ root })).needed, false);
});

test("a 0.8 workspace with sketch migrates to visualize, preserving the deprecated artifact", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-sketch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({
    root,
    name: "Pre-visualize Product",
    id: "pre-visualize-product",
    date: "2026-07-23",
    sourceReference: "migration-fixture-source",
  });

  // Rewind to the pre-0.9 shape: .skills/sketch instead of .skills/visualize,
  // and a hand-authored sketch artifact a designer produced with it.
  const visualizeSkillPath = path.join(root, ".skills", "visualize");
  const sketchSkillPath = path.join(root, ".skills", "sketch");
  const visualizeTree = await readdir(visualizeSkillPath, { recursive: true });
  await rm(sketchSkillPath, { recursive: true, force: true });
  await mkdir(sketchSkillPath, { recursive: true });
  for (const entry of visualizeTree) {
    const source = path.join(visualizeSkillPath, entry);
    const info = await stat(source);
    if (info.isDirectory()) {
      await mkdir(path.join(sketchSkillPath, entry), { recursive: true });
    } else {
      await mkdir(path.dirname(path.join(sketchSkillPath, entry)), { recursive: true });
      await writeFile(path.join(sketchSkillPath, entry), await readFile(source));
    }
  }
  await rm(visualizeSkillPath, { recursive: true, force: true });

  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.8.0-pre-visualize";
  const visualizeEntry = lock.packages.find(({ id }) => id === "visualize");
  lock.packages = lock.packages.filter(({ id }) => id !== "visualize");
  lock.packages.push({
    ...visualizeEntry,
    id: "sketch",
    path: ".skills/sketch",
  });
  await writeFile(lockPath, stringify(lock), "utf8");

  const sketchArtifactPath = "design/work/sketches/onboarding/sketch.json";
  const sketchArtifact = {
    schema: "silver/working-artifact/v2",
    id: "onboarding-sketch",
    kind: "sketch",
    revision: "r1",
    scope: "product",
    status: "draft",
    title: "Onboarding alternatives",
    created: "2026-07-23T20:00:00Z",
    updated: "2026-07-23T20:00:00Z",
    sources: [],
    payload: {
      fidelity: "low",
      constraint_profile: "constrained",
      question: "Which structure makes the next action clearest?",
      view_path: "design/work/sketches/onboarding/index.html",
      alternatives: [
        { title: "Single focus", summary: "One centered decision.", tradeoff: "Less context visible." },
        { title: "Guided context", summary: "Context beside the decision.", tradeoff: "More to scan." },
      ],
    },
  };
  await mkdir(path.join(root, "design/work/sketches/onboarding"), { recursive: true });
  await writeFile(
    path.join(root, sketchArtifactPath),
    `${JSON.stringify(sketchArtifact, null, 2)}\n`,
  );

  const preview = await migrateWorkspace({ root });
  assert.equal(preview.applied, false);
  assert.equal(preview.conflicts.length, 0, JSON.stringify(preview.conflicts, null, 2));
  assert.ok(
    preview.changes.some(
      ({ action, package: pkg }) => action === "retire" && pkg === "sketch",
    ),
  );

  const applied = await migrateWorkspace({ root, apply: true });
  assert.equal(applied.applied, true);

  assert.equal(await exists(sketchSkillPath), false);
  assert.ok(await exists(visualizeSkillPath));

  // The deprecated artifact is preserved exactly as authored — migration
  // never rewrites project-owned content — and still schema-valid.
  assert.equal(
    await readFile(path.join(root, sketchArtifactPath), "utf8"),
    `${JSON.stringify(sketchArtifact, null, 2)}\n`,
  );
  const artifactValidation = await validateSchema(
    "v2/working-artifact.schema.json",
    JSON.parse(await readFile(path.join(root, sketchArtifactPath), "utf8")),
  );
  assert.equal(artifactValidation.valid, true, JSON.stringify(artifactValidation.errors));

  const migratedLock = parse(await readFile(lockPath, "utf8"));
  assert.equal(migratedLock.packages.some(({ id }) => id === "sketch"), false);
  assert.ok(migratedLock.packages.some(({ id }) => id === "visualize"));

  const report = await doctorWorkspace({ root });
  assert.ok(
    report.diagnostics.some(
      ({ code, level }) => code === "deprecated-artifact-kind" && level === "info",
    ),
  );

  assert.equal((await migrateWorkspace({ root })).needed, false);
});

test("a 0.6.0 workspace migrates to the current release idempotently", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-migrate-061-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Published Product", id: "published-product" });

  // 0.6.0 shipped only as a GitHub release, so its launcher pinned the release
  // tarball URL rather than the npm package spec.
  const lockPath = path.join(root, ".silver", "lock.yaml");
  const lock = parse(await readFile(lockPath, "utf8"));
  lock.framework.version = "0.6.0";
  for (const installed of lock.packages) {
    if (installed.version === "0.9.2") installed.version = "0.6.0";
  }
  await writeFile(lockPath, stringify(lock), "utf8");
  // The published 0.6 expression had no stylesheet field and still referenced
  // the HTML-contract catalog. This exact shape was reproduced from the real
  // task-tracker workspace during the audit.
  const expressionPath = path.join(root, "design", "contexts", "default-expression.yaml");
  const expression = parse(await readFile(expressionPath, "utf8"));
  delete expression.stylesheet;
  expression.component_catalog.path = "reference-system/html-contracts";
  await writeFile(expressionPath, stringify(expression), "utf8");
  const launcherPath = path.join(root, ".silver", "bin", "silver");
  await writeFile(
    launcherPath,
    '#!/bin/sh\nexec npx --yes https://github.com/thejparsenault/silver-design-framework/releases/download/v0.6.0/silver-design-framework-0.6.0.tgz "$@"\n',
  );
  const ownedNote = "Project-owned voice note.\n";
  const voicePath = path.join(root, "design", "voice.md");
  await writeFile(voicePath, `${await readFile(voicePath, "utf8")}${ownedNote}`);

  const preview = await migrateWorkspace({ root });
  assert.equal(preview.fromVersion, "0.6.0");
  assert.equal(preview.toVersion, "0.9.2");
  assert.equal(preview.applied, false);
  assert.ok(
    preview.changes.some(
      ({ action, path: changedPath }) =>
        action === "upgrade-component-expression" &&
        changedPath === "design/contexts/default-expression.yaml",
    ),
  );

  const applied = await migrateWorkspace({ root, apply: true });
  assert.equal(applied.applied, true);
  // The launcher is regenerated for however this CLI was delivered, so the
  // pin on the superseded 0.6.0 release artifact is gone either way.
  const launcher = await readFile(launcherPath, "utf8");
  assert.doesNotMatch(launcher, /releases\/download\/v0\.6\.0/);
  // The npx rung is guarded now, so it is indented inside the `command -v` test.
  assert.match(launcher, /^ *exec (node "|npx --yes silver-design-framework@0\.9\.0)/m);
  assert.ok((await readFile(voicePath, "utf8")).endsWith(ownedNote));
  const migratedExpression = parse(await readFile(expressionPath, "utf8"));
  assert.equal(
    migratedExpression.stylesheet,
    "design/system/expressions/html/styles/ds.css",
  );
  assert.equal(
    migratedExpression.component_catalog.path,
    "design/system/components.json",
  );
  assert.equal((await migrateWorkspace({ root })).needed, false);
});

test("silver migrate --apply runs the fast suite automatically and reports it in JSON output", async (t) => {
  const root = await legacyWorkspace(t);
  const stdout = [];
  const code = await runCli(
    ["migrate", root, "--apply", "--json"],
    { stdout: (message) => stdout.push(message), stderr: () => {} },
  );
  assert.equal(code, 0);
  const result = JSON.parse(stdout.join("\n"));
  assert.equal(result.applied, true);
  assert.ok(result.checkSuite);
  assert.ok(["pass", "fail", "not-run", "error"].includes(result.checkSuite.status));
  const persisted = await readdir(path.join(root, ".silver/results/checks"));
  assert.ok(persisted.includes("semantic-styles.json"));
});

test("silver migrate without --apply is a preview and never runs the fast suite", async (t) => {
  const root = await legacyWorkspace(t);
  const stdout = [];
  const code = await runCli(
    ["migrate", root, "--json"],
    { stdout: (message) => stdout.push(message), stderr: () => {} },
  );
  assert.equal(code, 0);
  const result = JSON.parse(stdout.join("\n"));
  assert.equal(result.applied, false);
  assert.equal(result.checkSuite, null);
  assert.equal(await exists(path.join(root, ".silver/results/checks")), false);
});

test("silver update runs the fast suite automatically and reports it in JSON output", async (t) => {
  // update re-syncs framework-managed packages within the current lock
  // schema — it is not the v1-to-v2 upgrade migrate handles, so it needs a
  // workspace already on the current schema, not the legacy migrate fixture.
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-update-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await setupWorkspace({ root, name: "Update Fixture", id: "update-fixture", date: "2026-07-23" });
  const stdout = [];
  const code = await runCli(
    ["update", root, "--json"],
    { stdout: (message) => stdout.push(message), stderr: () => {} },
  );
  assert.equal(code, 0);
  const result = JSON.parse(stdout.join("\n"));
  assert.equal(result.ok, true);
  assert.ok(result.checkSuite);
  const persisted = await readdir(path.join(root, ".silver/results/checks"));
  assert.ok(persisted.includes("semantic-styles.json"));
});

test("a failing post-migrate check does not change migrate's own exit code", async (t) => {
  const root = await legacyWorkspace(t);
  const prototypeRoot = path.join(root, "prototypes", "broken-token");
  await mkdir(prototypeRoot, { recursive: true });
  await writeFile(
    path.join(prototypeRoot, "prototype.css"),
    ".example { color: #123456; }\n",
  );
  const stdout = [];
  const code = await runCli(
    ["migrate", root, "--apply", "--json"],
    { stdout: (message) => stdout.push(message), stderr: () => {} },
  );
  const result = JSON.parse(stdout.join("\n"));
  assert.equal(result.ok, true);
  assert.equal(result.checkSuite.status, "fail");
  assert.equal(code, 0);
});
