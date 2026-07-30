import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
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
    version: "0.6.1",
    sourceReference: "framework-development-fixture",
  });
  for (const relativePath of [
    "AGENTS.md",
    "CLAUDE.md",
    "design/INDEX.md",
    "design/manifest.yaml",
    ".silver/lock.yaml",
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
  console.log("Refreshed generated blank-workspace fixture files.");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
