import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { parse } from "yaml";

import { FAST_CHECK_IDS } from "../skills/design-check/scripts/run-fast.mjs";

const root = path.resolve(import.meta.dirname, "../..");

async function walk(relative) {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else files.push(child);
  }
  return files;
}

async function mustExist(relative, label) {
  await assert.doesNotReject(
    access(path.join(root, relative)),
    `${label} points at missing ${relative}`,
  );
}

function moduleReference(source, reference, modules) {
  const normalized = reference.startsWith("silver-design-framework/")
    ? reference.slice("silver-design-framework/".length)
    : reference.startsWith(".")
      ? path.normalize(path.join(path.dirname(source), reference))
      : path.normalize(reference);
  return modules.has(normalized) ? normalized : null;
}

test("every declared executable exists and every fast check has a normal skill caller", async () => {
  const skillRoot = "framework/skills";
  const skillEntries = (await readdir(path.join(root, skillRoot), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const knownChecks = new Set(FAST_CHECK_IDS);
  const designCheckIds = [];

  for (const entry of skillEntries) {
    const directory = path.join(skillRoot, entry.name);
    const contract = parse(await readFile(path.join(root, directory, "skill.yaml"), "utf8"));
    for (const script of contract.scripts ?? []) {
      await mustExist(path.join(directory, script.path), `${contract.id}:${script.id}`);
    }
    for (const check of contract.checks ?? []) {
      assert.ok(knownChecks.has(check.id), `${contract.id} declares unknown check ${check.id}`);
      if (contract.id === "design-check") designCheckIds.push(check.id);
    }
  }

  assert.deepEqual(
    [...designCheckIds].sort(),
    [...FAST_CHECK_IDS].sort(),
    "the design-check skill must execute every registered fast checker",
  );
});

test("production modules are reachable from a command or declared package path", async () => {
  const files = (await Promise.all(["bin", "installer", "framework"].map(walk))).flat();
  const production = files.filter(
    (file) =>
      file.endsWith(".mjs") &&
      !file.includes("/tests/") &&
      !file.includes("/scenarios/") &&
      !file.includes("/testing/"),
  );
  const modules = new Set(production);
  const roots = new Set();
  const adjacency = new Map();

  for (const file of production) {
    const content = await readFile(path.join(root, file), "utf8");
    const targets = new Set();
    for (const match of content.matchAll(/["'`]([^"'`\n]+\.mjs)["'`]/g)) {
      const target = moduleReference(file, match[1], modules);
      if (target) targets.add(target);
    }
    adjacency.set(file, targets);
  }

  const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  for (const value of Object.values(packageManifest.bin ?? {})) {
    roots.add(value.replace(/^\.\//, ""));
  }
  for (const value of Object.values(packageManifest.scripts ?? {})) {
    for (const match of value.matchAll(/(?:^|\s)([\w./-]+\.mjs)(?=\s|$)/g)) {
      if (modules.has(match[1])) roots.add(match[1]);
    }
  }

  for (const file of files.filter((item) => /(?:skill|provider)\.yaml$/.test(item))) {
    const value = parse(await readFile(path.join(root, file), "utf8"));
    const packageRoot = path.dirname(file);
    for (const script of value.scripts ?? []) roots.add(path.join(packageRoot, script.path));
    if (value.availability?.script) roots.add(path.join(packageRoot, value.availability.script));
    for (const operation of value.operations ?? []) roots.add(path.join(packageRoot, operation.script));
    for (const codecPath of value.codecs ?? []) {
      const codec = parse(await readFile(path.join(root, packageRoot, codecPath), "utf8"));
      for (const script of Object.values(codec.scripts)) roots.add(path.join(packageRoot, script));
    }
  }

  const reachable = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift();
    if (reachable.has(current) || !modules.has(current)) continue;
    reachable.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }

  // Playbook execution remains a separately documented architecture finding.
  // Reconciliation and artifact codecs are reachable through `silver sync`.
  const architecturalExceptions = new Set([
    "framework/runtime/playbooks.mjs",
  ]);
  const unreachable = production.filter(
    (file) => !reachable.has(file) && !architecturalExceptions.has(file),
  );
  assert.deepEqual(unreachable, []);
  for (const exception of architecturalExceptions) await mustExist(exception, "architecture exception");
});
