import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { doctorWorkspace } from "../doctor.mjs";
import { snapshotFiles } from "../lib/files.mjs";
import { repairWorkspace } from "../repair.mjs";
import { setupWorkspace } from "../setup.mjs";
import { updateWorkspace } from "../update.mjs";
import { scaffoldInvocation } from "../invoke.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const expectedRoot = path.join(
  repositoryRoot,
  "fixtures",
  "blank-workspace",
  "expected",
);
const skillSourceRoot = path.join(repositoryRoot, "framework", "skills");
const installedSkillIds = [
  "what-now",
  "brand",
  "product",
  "voice",
  "principles",
  "theme",
  "system",
  "research",
  "collect",
  "synthesize",
  "ideate",
  "map",
  "specify",
  "structure",
  "flow",
  "component",
  "visualize",
  "prototype",
  "evaluate",
  "pitch",
  "implement",
  "measure",
  "practice-review",
  "design-check",
];
const managedPayloads = [
  ["framework/schemas/v2", ".silver/schemas/v2"],
  ["framework/guardrails", ".silver/guardrails"],
  ["framework/runtime", ".silver/runtime"],
  ["framework/playbooks", ".silver/playbooks"],
  ["framework/providers", ".silver/providers"],
  ["framework/activities", ".silver/activities"],
  ["framework/transports", ".silver/transports"],
];

async function temporaryWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function temporaryPayload(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-payload-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await mkdir(path.join(root, "framework"), { recursive: true });
  await cp(
    path.join(repositoryRoot, "framework", "skills"),
    path.join(root, "framework", "skills"),
    { recursive: true },
  );
  await mkdir(
    path.join(root, "installer", "templates", "blank-workspace", "design", "system"),
    { recursive: true },
  );
  await cp(
    path.join(
      repositoryRoot,
      "installer",
      "templates",
      "blank-workspace",
      "design",
      "system",
      "tokens",
    ),
    path.join(root, "installer", "templates", "blank-workspace", "design", "system", "tokens"),
    { recursive: true },
  );
  for (const relativePath of [
    "schemas/v2",
    "guardrails",
    "runtime",
    "playbooks",
    "providers",
    "activities",
    "transports",
  ]) {
    await cp(
      path.join(repositoryRoot, "framework", relativePath),
      path.join(root, "framework", relativePath),
      { recursive: true },
    );
  }
  return root;
}

// Agent-host adapters are excluded from byte comparison: the launcher embeds an
// absolute path to the running installation, and .claude/skills is a symlink on
// POSIX and a copy on Windows. Both are asserted by shape instead.
function isMachineSpecificAdapter(relativePath) {
  const posixPath = relativePath.split(path.sep).join("/");
  return (
    posixPath.startsWith(".silver/bin/") || posixPath.startsWith(".claude/")
  );
}

function comparableSnapshot(snapshot) {
  return [...snapshot.entries()]
    .filter(([relativePath]) => !isMachineSpecificAdapter(relativePath))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relativePath, content]) => [relativePath, content.toString("utf8")]);
}

async function expectedBlankWorkspaceSnapshot() {
  const expected = await snapshotFiles(expectedRoot);
  for (const id of installedSkillIds) {
    for (const [relativePath, content] of await snapshotFiles(
      path.join(skillSourceRoot, id),
    )) {
      expected.set(path.join(".skills", id, relativePath), content);
    }
  }
  for (const [source, destination] of managedPayloads) {
    for (const [relativePath, content] of await snapshotFiles(
      path.join(repositoryRoot, source),
    )) {
      expected.set(path.join(destination, relativePath), content);
    }
  }
  return expected;
}

test("setup produces the expected blank workspace", async (t) => {
  const root = await temporaryWorkspace(t);
  const result = await setupWorkspace({
    root,
    name: "Example Product",
    id: "example-product",
    date: "2026-07-23",
    version: "0.7.0",
    sourceReference: "framework-development-fixture",
  });

  assert.equal(result.mode, "new");
  assert.deepEqual(
    comparableSnapshot(await snapshotFiles(root)),
    comparableSnapshot(await expectedBlankWorkspaceSnapshot()),
  );
  assert.equal((await doctorWorkspace({ root })).ok, true);
});

test("setup is idempotent and preserves project edits", async (t) => {
  const root = await temporaryWorkspace(t);
  await setupWorkspace({
    root,
    name: "Example Product",
    id: "example-product",
    date: "2026-07-23",
    sourceReference: "framework-development-fixture",
  });
  const brandPath = path.join(root, "design", "brand.md");
  const tokenPath = path.join(
    root,
    "design",
    "system",
    "tokens",
    "primitive",
    "color.tokens.json",
  );
  const edited = `${await readFile(brandPath, "utf8")}\nProject-owned note.\n`;
  const editedToken = (await readFile(tokenPath, "utf8")).replace(
    "Primitive color scale.",
    "Primitive color scale. Product-owned note.",
  );
  await writeFile(brandPath, edited);
  await writeFile(tokenPath, editedToken);
  const before = comparableSnapshot(await snapshotFiles(root));

  const result = await setupWorkspace({
    root,
    name: "Ignored on resume",
    id: "ignored-on-resume",
    date: "2026-07-24",
  });

  assert.equal(result.mode, "existing");
  assert.equal(result.created.length, 0);
  assert.deepEqual(comparableSnapshot(await snapshotFiles(root)), before);
  assert.equal(await readFile(brandPath, "utf8"), edited);
  assert.equal(await readFile(tokenPath, "utf8"), editedToken);
});

test("doctor reports missing artifacts and stale managed files", async (t) => {
  const root = await temporaryWorkspace(t);
  await setupWorkspace({
    root,
    name: "Example Product",
    id: "example-product",
    date: "2026-07-23",
  });
  await unlink(path.join(root, "design", "voice.md"));
  await writeFile(path.join(root, "design", "INDEX.md"), "stale\n");

  const result = await doctorWorkspace({ root });
  assert.equal(result.ok, false);
  assert.ok(
    result.diagnostics.some(
      ({ code, path: target }) =>
        code === "missing-artifact" && target === "design/voice.md",
    ),
  );
  assert.ok(
    result.diagnostics.some(
      ({ code, path: target }) =>
        code === "managed-file-stale" && target === "design/INDEX.md",
    ),
  );
});

test("doctor verifies framework-managed skills but permits design-system edits", async (t) => {
  const root = await temporaryWorkspace(t);
  await setupWorkspace({
    root,
    name: "Example Product",
    id: "example-product",
    date: "2026-07-23",
  });
  const tokenPath = path.join(
    root,
    "design",
    "system",
    "tokens",
    "primitive",
    "color.tokens.json",
  );
  await writeFile(
    tokenPath,
    `${await readFile(tokenPath, "utf8")}`.replace(
      "Primitive color scale.",
      "Primitive color scale, edited by the project.",
    ),
  );
  assert.equal((await doctorWorkspace({ root })).ok, true);

  const skillPath = path.join(root, ".skills", "brand", "SKILL.md");
  await writeFile(
    skillPath,
    `${await readFile(skillPath, "utf8")}\nUnexpected managed edit.\n`,
  );
  const result = await doctorWorkspace({ root });
  assert.equal(result.ok, false);
  assert.ok(
    result.diagnostics.some(
      ({ code, path: target }) =>
        code === "managed-package-stale" && target === ".skills/brand",
    ),
  );
  await assert.rejects(
    scaffoldInvocation({ root, skillId: "brand", now: new Date("2026-07-23T00:00:00Z") }),
    /managed-package-stale.*silver repair|managed-package-stale.*silver update/,
  );
});

test("repair regenerates the index and agent pointer without changing owned files", async (t) => {
  const root = await temporaryWorkspace(t);
  await setupWorkspace({
    root,
    name: "Example Product",
    id: "example-product",
    date: "2026-07-23",
  });
  const brandPath = path.join(root, "design", "brand.md");
  const editedBrand = `${await readFile(brandPath, "utf8")}\nOwned note.\n`;
  await writeFile(brandPath, editedBrand);
  await writeFile(path.join(root, "design", "INDEX.md"), "stale index\n");
  await writeFile(path.join(root, "AGENTS.md"), "stale pointer\n");

  const result = await repairWorkspace({ root });

  assert.equal(result.ok, true);
  assert.ok(result.repaired.includes("design/INDEX.md"));
  assert.ok(result.repaired.includes("AGENTS.md"));
  assert.equal(await readFile(brandPath, "utf8"), editedBrand);
  assert.equal((await doctorWorkspace({ root })).ok, true);
});

test("update replaces clean managed skills and only proposes copied-owned changes", async (t) => {
  const root = await temporaryWorkspace(t);
  const payloadRoot = await temporaryPayload(t);
  await setupWorkspace({
    root,
    name: "Example Product",
    id: "example-product",
    date: "2026-07-23",
  });

  const brandArtifactPath = path.join(root, "design", "brand.md");
  const seedTokenPath = path.join(
    root,
    "design",
    "system",
    "tokens",
    "primitive",
    "color.tokens.json",
  );
  const editedBrandArtifact = `${await readFile(brandArtifactPath, "utf8")}\nOwned brand note.\n`;
  const editedSeedToken = (await readFile(seedTokenPath, "utf8")).replace(
    "Primitive color scale.",
    "Primitive color scale. Owned project edit.",
  );
  await writeFile(brandArtifactPath, editedBrandArtifact);
  await writeFile(seedTokenPath, editedSeedToken);

  const sourceSkillPath = path.join(
    payloadRoot,
    "framework",
    "skills",
    "brand",
    "SKILL.md",
  );
  await writeFile(
    sourceSkillPath,
    `${await readFile(sourceSkillPath, "utf8")}\nFixture release improvement.\n`,
  );
  const sourceSkillContractPath = path.join(
    payloadRoot,
    "framework",
    "skills",
    "brand",
    "skill.yaml",
  );
  await writeFile(
    sourceSkillContractPath,
    (await readFile(sourceSkillContractPath, "utf8")).replace(
      "version: 0.7.0",
      "version: 0.2.1",
    ),
  );
  const sourceSeedTokenPath = path.join(
    payloadRoot,
    "installer",
    "templates",
    "blank-workspace",
    "design",
    "system",
    "tokens",
    "primitive",
    "color.tokens.json",
  );
  await writeFile(
    sourceSeedTokenPath,
    (await readFile(sourceSeedTokenPath, "utf8")).replace(
      "Primitive color scale.",
      "Primitive color scale. Improved in a later release.",
    ),
  );

  const result = await updateWorkspace({
    root,
    payloadRoot,
    version: "0.2.1",
    sourceReference: "fixture-v2",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.updated, ["brand"]);
  assert.ok(
    result.proposals.some(
      ({ package: id }) => id === "design-system-tokens-seed",
    ),
  );
  assert.equal(
    await readFile(path.join(root, ".skills", "brand", "SKILL.md"), "utf8"),
    await readFile(sourceSkillPath, "utf8"),
  );
  assert.equal(await readFile(brandArtifactPath, "utf8"), editedBrandArtifact);
  assert.equal(await readFile(seedTokenPath, "utf8"), editedSeedToken);
  assert.equal((await doctorWorkspace({ root })).ok, true);

  const afterFirstUpdate = comparableSnapshot(await snapshotFiles(root));
  const repeated = await updateWorkspace({
    root,
    payloadRoot,
    version: "0.2.1",
    sourceReference: "fixture-v2",
  });
  assert.equal(repeated.ok, true);
  assert.deepEqual(repeated.updated, []);
  assert.deepEqual(
    comparableSnapshot(await snapshotFiles(root)),
    afterFirstUpdate,
  );
});

test("update stops before changing a locally edited managed skill", async (t) => {
  const root = await temporaryWorkspace(t);
  const payloadRoot = await temporaryPayload(t);
  await setupWorkspace({
    root,
    name: "Example Product",
    id: "example-product",
    date: "2026-07-23",
  });
  const installedSkillPath = path.join(root, ".skills", "brand", "SKILL.md");
  await writeFile(
    installedSkillPath,
    `${await readFile(installedSkillPath, "utf8")}\nLocal edit.\n`,
  );
  const before = comparableSnapshot(await snapshotFiles(root));

  const result = await updateWorkspace({
    root,
    payloadRoot,
    version: "0.2.1",
    sourceReference: "fixture-v2",
  });

  assert.equal(result.ok, false);
  assert.ok(result.conflicts.some(({ package: id }) => id === "brand"));
  assert.deepEqual(comparableSnapshot(await snapshotFiles(root)), before);
});

test("setup installs into a folder with existing work without touching it", async (t) => {
  const root = await temporaryWorkspace(t);
  // Deliberately not package.json or README.md: installing Silver itself leaves
  // a package manifest behind, so treating one as evidence of an existing
  // product classified every single installation as an adoption.
  const productPath = path.join(root, "src", "components", "Button.jsx");
  const documentPath = path.join(root, "docs", "design-guidelines.md");
  await mkdir(path.dirname(productPath), { recursive: true });
  await mkdir(path.dirname(documentPath), { recursive: true });
  await writeFile(productPath, "export const Button = () => null;\n");
  await writeFile(documentPath, "# Existing product\n");

  // Silver used to throw here, which after `npm install` meant every real
  // repository. Installing is safe because setup only creates files it owns;
  // what it must not do is decide on its own what the existing work means.
  const result = await setupWorkspace({
    root,
    name: "Existing Product",
    id: "existing-product",
    sourceReference: "framework-development-fixture",
  });

  assert.equal(result.mode, "with-existing-work");
  assert.equal(
    await readFile(productPath, "utf8"),
    "export const Button = () => null;\n",
  );
  assert.equal(await readFile(documentPath, "utf8"), "# Existing product\n");
  assert.equal((await doctorWorkspace({ root })).ok, true);
});
