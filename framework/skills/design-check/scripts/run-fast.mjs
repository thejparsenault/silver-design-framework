#!/usr/bin/env node

import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkArtifacts } from "./check-artifacts.mjs";
import { checkAccessibility } from "./check-accessibility.mjs";
import { checkAssets } from "./check-assets.mjs";
import { checkEvidence } from "./check-evidence.mjs";
import { checkFlows } from "./check-flows.mjs";
import { checkMaps } from "./check-maps.mjs";
import { checkStructures } from "./check-structures.mjs";
import {
  checkResult,
  finding,
  parseArguments,
} from "./check-lib.mjs";
import { checkPrototypes } from "./check-prototypes.mjs";
import { checkPresentations } from "./check-presentations.mjs";
import { checkProduction } from "./check-production.mjs";
import { checkReferenceIntegrity } from "./check-reference-integrity.mjs";
import { checkResponsive } from "./check-responsive.mjs";
import { checkInteractions } from "./check-interactions.mjs";
import { checkSemanticStyles } from "./check-semantic-styles.mjs";
import { checkAuthority } from "./check-authority.mjs";
import { checkBindingIntegrity } from "./check-binding-integrity.mjs";
import { checkProviderRevisionPins } from "./check-provider-revision-pins.mjs";
import { checkSecretFreeConfiguration } from "./check-secret-free-configuration.mjs";
import { checkSemanticMapping } from "./check-semantic-mapping.mjs";
import { checkStaleProposals } from "./check-stale-proposals.mjs";
import { checkSynchronizationStatus } from "./check-synchronization-status.mjs";
import { checkViewProvenance } from "./check-view-provenance.mjs";

const checkers = [
  ["contract-integrity", checkArtifacts],
  ["flow-structure", checkFlows],
  ["map-structure", checkMaps],
  ["structure-integrity", checkStructures],
  ["semantic-styles", checkSemanticStyles],
  ["prototype-policy", checkPrototypes],
  ["evidence-provenance", checkEvidence],
  ["presentation-integrity", checkPresentations],
  ["production-readiness", checkProduction],
  ["asset-integrity", checkAssets],
  ["reference-integrity", checkReferenceIntegrity],
  ["accessibility", checkAccessibility],
  ["responsive-behavior", checkResponsive],
  ["critical-interactions", checkInteractions],
  ["binding-integrity", checkBindingIntegrity],
  ["provider-revision-pins", checkProviderRevisionPins],
  ["view-provenance", checkViewProvenance],
  ["synchronization-status", checkSynchronizationStatus],
  ["semantic-mapping", checkSemanticMapping],
  ["stale-proposals", checkStaleProposals],
  ["authority", checkAuthority],
  ["secret-free-configuration", checkSecretFreeConfiguration],
];

export async function runFastSuite(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const results = [];
  for (const [checker, run] of checkers) {
    try {
      results.push(await run({ root }));
    } catch (error) {
      results.push(
        checkResult({
          checker,
          requested: [checker],
          completed: [checker],
          findings: [
            finding({
              checker,
              rule: `${checker}.checker-error`,
              message: error.message,
            }),
          ],
        }),
      );
    }
  }
  const status = results.some(({ status }) => status === "fail")
    ? "fail"
    : results.some(({ status }) => status === "not-run")
      ? "not-run"
      : "pass";
  return {
    schema: "silver/check-suite-result/v1",
    suite: "fast",
    status,
    results,
  };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("Usage: run-fast.mjs [--root <workspace>]");
      return;
    }
    const result = await runFastSuite(options);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode =
      result.status === "pass"
        ? 0
        : result.status === "fail"
          ? 1
          : 2;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 3;
  }
}

if (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
) {
  await main();
}
