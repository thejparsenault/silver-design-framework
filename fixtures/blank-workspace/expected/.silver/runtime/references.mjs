import { readFile } from "node:fs/promises";
import path from "node:path";

async function readCollection(root, collectionId) {
  const collectionPath = path.join(root, "design", "references", `${collectionId}.json`);
  let raw;
  try {
    raw = await readFile(collectionPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`No reference collection named ${collectionId} at design/references/${collectionId}.json.`);
    }
    throw error;
  }
  const value = JSON.parse(raw);
  if (value.schema !== "silver/reference-collection/v1") {
    throw new Error(`design/references/${collectionId}.json does not declare the reference-collection contract.`);
  }
  return value;
}

// Turning a citation intent (`{collection, ids}` — what a skill invocation
// declares it looked at) into a pinned provenance record (adds the
// collection's revision at citation time), the same fidelity `guidance` and
// `linked_sources` pins already carry. A cited id that is not actually in the
// collection is refused rather than recorded: citing something invents
// evidence about what was looked at.
export async function resolveReferenceCitations(root, references = []) {
  const resolved = [];
  for (const { collection, ids } of references) {
    const value = await readCollection(root, collection);
    const known = new Set(value.references.map((item) => item.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new Error(
        `Reference collection ${collection} has no entry named ${missing.join(", ")}.`,
      );
    }
    resolved.push({ collection, revision: value.revision, ids: [...ids] });
  }
  return resolved;
}
