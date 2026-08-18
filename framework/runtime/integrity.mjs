// Content integrity, in the runtime so workspace-side code can compute the same
// value the installer records in `.silver/lock.yaml`.
import { createHash } from "node:crypto";

export function integrity(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
