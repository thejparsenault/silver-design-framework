#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

import { applySourceLinkPlan, inspectSourceLink } from "../../installer/sources.mjs";
import { applySynchronization, inspectSynchronization, syncStatus } from "../../installer/sync.mjs";

function rootArgument(args) {
  const index = args.indexOf("--root");
  if (index < 0 || !args[index + 1]) throw new Error("portable-reconciliation requires --root.");
  return path.resolve(args[index + 1]);
}

export async function runPortableReconciliationScenario({ root }) {
  const external = path.resolve(`${root}-linked-system`);
  await mkdir(external, { recursive: true });
  await writeFile(path.join(external, "tokens.json"), '{"color":{"canvas":{"value":"#ffffff"}}}\n');
  const plan = await inspectSourceLink({
    root,
    targetPath: external,
    kind: "design-system",
    as: "scenario-system",
    answers: {
      authority: "external-authoritative",
      paths: ["tokens.json"],
      mappings: [{
        id: "tokens",
        external_path: "tokens.json",
        local_path: "design/system/scenario.tokens.json",
        format: "dtcg-json",
        artifact_kind: "token-source",
      }],
    },
  });
  await applySourceLinkPlan({ plan });
  const bindingId = "scenario-system-tokens";
  const inspected = await inspectSynchronization({ root, bindingId, direction: "external-to-local" });
  const applied = await applySynchronization({
    root,
    input: inspected,
    only: [inspected.proposal.operations[0].id],
  });
  const binding = parse(await readFile(path.join(root, `design/integrations/${bindingId}.yaml`), "utf8"));
  const status = await syncStatus({ root, bindingId });
  return {
    status: applied.status === "applied" && status.bindings[0].state === "current" ? "pass" : "fail",
    binding: bindingId,
    binding_schema: binding.schema,
    proposal_schema: inspected.proposal.schema,
    result_schema: applied.schema,
  };
}

if (import.meta.main) {
  runPortableReconciliationScenario({ root: rootArgument(process.argv.slice(2)) })
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
