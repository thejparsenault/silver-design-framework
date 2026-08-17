import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { setupWorkspace } from "../setup.mjs";

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
  await rm(fixtureRoot, { force: true, recursive: true });
  await cp(temporaryRoot, fixtureRoot, { recursive: true });
  console.log("Refreshed generated blank-workspace fixture files.");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
