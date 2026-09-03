import path from "node:path";
import { readFile } from "node:fs/promises";

import { checkResult, finding, parseYaml } from "./check-lib.mjs";

let runtime;
async function managedRuntime() {
  if (runtime) return runtime;
  for (const specifier of [
    "silver-design-framework/framework/runtime/managed-integrity.mjs",
    "../../../.silver/runtime/managed-integrity.mjs",
    "../../../runtime/managed-integrity.mjs",
  ]) {
    try {
      runtime = await import(specifier);
      return runtime;
    } catch {
      // Try the package, installed workspace, then source tree.
    }
  }
  throw new Error("The shared managed-integrity runtime is unavailable.");
}

export async function checkManagedIntegrity(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "managed-integrity";
  const requested = [".silver/lock.yaml"];
  const completed = [];
  const findings = [];
  const { inspectManagedIntegrity } = await managedRuntime();
  let lock = null;
  try {
    lock = parseYaml(await readFile(path.join(root, ".silver/lock.yaml"), "utf8"));
  } catch {
    // The shared runtime emits managed-lock-invalid below.
  }
  const issues = await inspectManagedIntegrity(root, lock);
  if (!issues.some(({ path: issuePath }) => issuePath === ".silver/lock.yaml")) {
    completed.push(".silver/lock.yaml");
  }
  for (const issue of issues) {
    requested.push(issue.path);
    findings.push(finding({
      checker,
      rule: `managed-integrity.${issue.code}`,
      file: issue.path,
      message: issue.message,
    }));
  }
  return checkResult({ checker, requested: [...new Set(requested)], completed, findings });
}
