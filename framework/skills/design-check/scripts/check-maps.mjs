import path from "node:path";

import { checkMap } from "../../map/scripts/check-map.mjs";
import {
  checkResult,
  findFiles,
  finding,
  workspacePath,
} from "./check-lib.mjs";

export async function checkMaps(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "map-structure";
  const files = await findFiles(
    path.join(root, "design", "maps"),
    (file) => file.endsWith(".json"),
  );
  const findings = [];
  const completed = [];
  for (const absolute of files) {
    const file = workspacePath(root, absolute);
    const result = await checkMap({ root, map: file });
    completed.push(file);
    for (const message of result.findings) {
      findings.push(
        finding({
          checker,
          rule: "map.structure-invalid",
          file,
          message,
        }),
      );
    }
  }
  return checkResult({
    checker,
    requested: ["design/maps"],
    completed,
    findings,
  });
}
