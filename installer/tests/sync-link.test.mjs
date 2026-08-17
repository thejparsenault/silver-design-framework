import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

import { setupWorkspace } from "../setup.mjs";
import { applySourceLinkPlan, inspectSourceLink } from "../sources.mjs";

test("reviewed link inspection and apply register a v2 source and representation binding", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "silver-sync-link-"));
  const workspace = path.join(temporary, "workspace");
  const external = path.join(temporary, "system");
  await mkdir(external);
  await writeFile(path.join(external, "tokens.json"), `${JSON.stringify({ color: { value: "#fff" } }, null, 2)}\n`);
  await setupWorkspace({ root: workspace, name: "Sync", id: "sync" });
  const plan = await inspectSourceLink({
    root: workspace,
    targetPath: external,
    kind: "design-system",
    as: "shared-system",
    answers: {
      paths: ["tokens.json"],
      mappings: [{
        id: "tokens",
        external_path: "tokens.json",
        local_path: "design/system/imported.tokens.json",
        format: "dtcg-json",
        artifact_kind: "token-source",
      }],
    },
  });
  assert.equal(plan.unresolved.length, 0);
  const applied = await applySourceLinkPlan({ plan });
  assert.deepEqual(applied.bindings, ["shared-system-tokens"]);
  const registry = parse(await readFile(path.join(workspace, "design/sources/sources.yaml"), "utf8"));
  assert.equal(registry.schema, "silver/source-registry/v2");
  assert.equal(registry.sources[0].kind, "design-system");
  const binding = parse(await readFile(path.join(workspace, "design/integrations/shared-system-tokens.yaml"), "utf8"));
  assert.equal(binding.schema, "silver/representation-binding/v2");
  assert.equal(binding.base.state, "uninitialized");
  await assert.rejects(applySourceLinkPlan({ plan }), /registry changed|already linked/);
});
