import { cp, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SEEDED_TEMPLATES, setupWorkspace } from "../setup.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const fixtureRoot = path.join(
  repositoryRoot,
  "fixtures/blank-workspace/expected",
);
const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), "silver-refresh-fixture-"),
);

try {
  await setupWorkspace({
    root: temporaryRoot,
    name: "Example Product",
    id: "example-product",
    date: "2026-07-23",
    version: "0.7.0",
    sourceReference: "framework-development-fixture",
  });
  for (const relativePath of [
    ".gitignore",
    "AGENTS.md",
    "CLAUDE.md",
    "design/INDEX.md",
    "design/manifest.yaml",
    ".silver/lock.yaml",
    "design/system/tokens.json",
    "design/system/showcase.html",
    ...SEEDED_TEMPLATES,
  ]) {
    await mkdir(path.dirname(path.join(fixtureRoot, relativePath)), {
      recursive: true,
    });
    await copyFile(
      path.join(temporaryRoot, relativePath),
      path.join(fixtureRoot, relativePath),
    );
  }
  for (const relativeDirectory of ["design/system/tokens", "design/system/expressions"]) {
    await rm(path.join(fixtureRoot, relativeDirectory), { force: true, recursive: true });
    await cp(
      path.join(temporaryRoot, relativeDirectory),
      path.join(fixtureRoot, relativeDirectory),
      { recursive: true },
    );
  }
  console.log("Refreshed generated blank-workspace fixture files.");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
