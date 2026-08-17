import path from "node:path";

import { checkStructure } from "../../structure/scripts/check-structure.mjs";
import {
  checkResult,
  findFiles,
  finding,
  workspacePath,
} from "./check-lib.mjs";

export async function checkStructures(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "structure-integrity";
  const files = await findFiles(
    path.join(root, "design", "structures"),
    (file) => file.endsWith(".json"),
  );
  const findings = [];
  const completed = [];
  for (const absolute of files) {
    const file = workspacePath(root, absolute);
    const result = await checkStructure({ root, structure: file });
    completed.push(file);
    for (const message of result.findings) {
      findings.push(
        finding({
          checker,
          rule: "structure.structure-invalid",
          file,
          message,
        }),
      );
    }
  }
  return checkResult({
    checker,
    requested: ["design/structures"],
    completed,
    findings,
  });
}
