import path from "node:path";

import { parse as parseYaml } from "yaml";

import { exists, snapshotFiles } from "./files.mjs";

function parse(relativePath, content) {
  try {
    if (relativePath.endsWith(".json")) {
      return JSON.parse(content.toString("utf8"));
    }
    if (/\.ya?ml$/.test(relativePath)) {
      return parseYaml(content.toString("utf8"));
    }
  } catch {
    return null;
  }
  return null;
}

function pins(value, field) {
  return [
    ...(Array.isArray(value?.[field]) ? value[field] : []),
    ...(Array.isArray(value?.provenance?.[field])
      ? value.provenance[field]
      : []),
  ];
}

export async function findPinnedDependents({
  root,
  field,
  id,
  revision,
  integrity,
  excludeRevision = false,
}) {
  const workspace = path.resolve(root);
  const matches = new Map();
  for (const relativeRoot of [
    "design",
    "prototypes",
    "presentations",
    "production",
    ".silver/results/skills",
  ]) {
    const absoluteRoot = path.join(workspace, relativeRoot);
    if (!(await exists(absoluteRoot))) continue;
    for (const [relativeFile, content] of await snapshotFiles(absoluteRoot)) {
      if (!/\.(?:json|ya?ml)$/.test(relativeFile)) continue;
      const value = parse(relativeFile, content);
      if (!value) continue;
      for (const pin of pins(value, field)) {
        if (pin?.id !== id) continue;
        const revisionMatches =
          revision === undefined ||
          (excludeRevision
            ? pin.revision !== revision
            : pin.revision === revision);
        const integrityMatches =
          integrity === undefined || pin.integrity === integrity;
        if (!revisionMatches || !integrityMatches) continue;
        const relativePath = path
          .join(relativeRoot, relativeFile)
          .split(path.sep)
          .join("/");
        matches.set(relativePath, {
          path: relativePath,
          pinned_revision: pin.revision ?? null,
          ...(pin.integrity ? { pinned_integrity: pin.integrity } : {}),
        });
      }
    }
  }
  return [...matches.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}
