#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkResult, exitCode, findFiles, finding, parseArguments, workspacePath } from "./check-lib.mjs";

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
async function exists(file) { try { await access(file); return true; } catch { return false; } }

export async function checkAssets(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "asset-integrity";
  const file = "design/assets/catalog.json";
  const requested = [file];
  const completed = [];
  const findings = [];
  try {
    const catalog = JSON.parse(await readFile(path.join(root, file), "utf8"));
    if (catalog.schema !== "silver/asset-catalog/v2") throw new Error("Catalog does not declare silver/asset-catalog/v2.");
    const ids = new Set();
    for (const asset of catalog.assets ?? []) {
      if (ids.has(asset.id)) throw new Error(`Duplicate asset ID: ${asset.id}.`);
      ids.add(asset.id);
      for (const rendition of asset.renditions ?? []) {
        const absolute = path.resolve(root, rendition.path);
        const relative = rendition.path.split(path.sep).join("/");
        if (!absolute.startsWith(`${root}${path.sep}`) || !(await exists(absolute))) {
          findings.push(finding({ checker, rule: "asset.rendition-unavailable", file, message: `Rendition is unavailable: ${relative}.`, observedValue: asset.id }));
          continue;
        }
        if (sha256(await readFile(absolute)) !== rendition.integrity) {
          findings.push(finding({ checker, rule: "asset.integrity-mismatch", file: relative, message: `Integrity does not match catalog entry ${asset.id}.` }));
        }
        const validScope =
          (asset.ownership === "project-shared" && relative.startsWith("design/assets/shared/")) ||
          (asset.ownership === "prototype-local" && relative.startsWith("prototypes/")) ||
          (asset.ownership === "production-projection" && relative.startsWith("production/"));
        if (!validScope) findings.push(finding({ checker, rule: "asset.ownership-path-mismatch", file: relative, message: `Asset ${asset.id} is outside its declared ownership scope.` }));
        if (asset.ownership === "production-projection" && asset.license?.usage === "prototype") findings.push(finding({ checker, rule: "asset.license-production-block", file: relative, message: `Prototype-only asset ${asset.id} cannot be a production projection.` }));
      }
    }
    completed.push(file);
  } catch (error) {
    findings.push(finding({ checker, rule: "asset.catalog-invalid", file, message: error.message }));
  }
  const productionFiles = await findFiles(path.join(root, "production"), (candidate) => /\.(?:html|css|js|json)$/.test(candidate));
  for (const absolute of productionFiles) {
    const relative = workspacePath(root, absolute);
    completed.push(relative);
    if ((await readFile(absolute, "utf8")).includes("prototypes/")) {
      findings.push(finding({ checker, rule: "asset.prototype-production-leak", file: relative, message: "Production source cannot silently consume prototype-local assets." }));
    }
  }
  return checkResult({ checker, requested, completed, findings, policyProfile: "production" });
}

async function main() { try { const options = parseArguments(process.argv.slice(2)); const result = await checkAssets(options); console.log(JSON.stringify(result, null, 2)); process.exitCode = exitCode(result); } catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 3; } }
if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await main();
