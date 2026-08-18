// Keeping the manifest, index, and lock consistent with canonical artifacts.
//
// An accepted `brand` invocation wrote `design/brand.md` with `status: active`
// while `design/manifest.yaml` went on saying `draft`. Fast validation then
// failed on the disagreement, and the fix was to hand-edit the manifest and run
// `silver repair`. The same thing happened again for `design-system`, so it was
// never specific to one skill: nothing derived manifest status from accepted
// output.
//
// Activation is now part of the invocation that caused it. The artifact, the
// manifest, the generated index, and the lock move together or not at all.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse, stringify } from "yaml";

import { renderIndex } from "./index-view.mjs";
import { integrity } from "./integrity.mjs";

export const MANIFEST_PATH = "design/manifest.yaml";
export const INDEX_PATH = "design/INDEX.md";
export const LOCK_PATH = ".silver/lock.yaml";

// Narrative artifacts declare their own status in frontmatter. That is the
// artifact's own statement about itself, so it is what the manifest follows.
function frontmatterStatus(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (!match) return null;
  try {
    const value = parse(match[1]);
    return typeof value?.status === "string" ? value.status : null;
  } catch {
    return null;
  }
}

function structuredStatus(value) {
  return typeof value?.status === "string" ? value.status : null;
}

// Read the status an artifact claims for itself, or null when it does not say.
export async function declaredArtifactStatus(root, artifactPath) {
  const absolute = path.resolve(root, artifactPath);
  let content;
  try {
    content = await readFile(absolute, "utf8");
  } catch {
    return null;
  }
  if (artifactPath.endsWith(".md")) return frontmatterStatus(content);
  if (/\.(json|ya?ml)$/.test(artifactPath)) {
    try {
      return structuredStatus(parse(content));
    } catch {
      return null;
    }
  }
  return null;
}

// Reconcile manifest entries against what their artifacts say about themselves.
// Returns the changed entries without writing anything, so callers can preview.
export async function planManifestStatusSync({ root, manifest, only }) {
  const changes = [];
  for (const artifact of manifest.artifacts ?? []) {
    if (only && !only.includes(artifact.path)) continue;
    const declared = await declaredArtifactStatus(root, artifact.path);
    if (!declared || declared === artifact.status) continue;
    changes.push({
      id: artifact.id,
      path: artifact.path,
      from: artifact.status,
      to: declared,
    });
  }
  return changes;
}

// Apply status changes to the manifest and regenerate everything derived from
// it. Returns the workspace-relative paths that changed, so an accepted
// invocation can include them in its Git checkpoint.
// design/INDEX.md lists the installed skills, so regenerating it needs the same
// list `silver repair` uses: the skill packages recorded in the lock.
async function installedSkillIds(workspaceRoot) {
  try {
    const lock = parse(
      await readFile(path.join(workspaceRoot, LOCK_PATH), "utf8"),
    );
    return (lock?.packages ?? [])
      .filter(({ type }) => type === "skill")
      .map(({ id }) => id);
  } catch {
    return [];
  }
}

// design/manifest.yaml is a canonical, human-edited file. Re-serializing the
// whole document to flip one field would drop its blank lines and comments and
// bury a one-word change in a whole-file diff, so the status line is rewritten
// in place instead.
export function applyStatusChangesToSource(source, changes) {
  let updated = source;
  for (const change of changes) {
    const entry = new RegExp(
      // The artifact's own block: from its `- id:` line up to the next entry.
      `(^[ \\t]*-[ \\t]+id:[ \\t]*${change.id}[ \\t]*$[\\s\\S]*?)(^([ \\t]+)status:[ \\t]*)${change.from}([ \\t]*$)`,
      "m",
    );
    if (!entry.test(updated)) {
      throw new Error(
        `Could not locate the status line for manifest artifact ${change.id}.`,
      );
    }
    updated = updated.replace(entry, `$1$2${change.to}$4`);
  }
  return updated;
}

export async function syncManifestStatus({ root, only, write }) {
  const workspaceRoot = path.resolve(root);
  const manifestAbsolute = path.join(workspaceRoot, MANIFEST_PATH);
  let source;
  let manifest;
  try {
    source = await readFile(manifestAbsolute, "utf8");
    manifest = parse(source);
  } catch {
    return { changes: [], paths: [] };
  }
  const changes = await planManifestStatusSync({
    root: workspaceRoot,
    manifest,
    only,
  });
  if (changes.length === 0) return { changes: [], paths: [] };

  const byId = new Map(changes.map((change) => [change.id, change]));
  manifest.artifacts = manifest.artifacts.map((artifact) =>
    byId.has(artifact.id)
      ? { ...artifact, status: byId.get(artifact.id).to }
      : artifact,
  );

  const paths = [MANIFEST_PATH];
  await write(manifestAbsolute, applyStatusChangesToSource(source, changes));

  // design/INDEX.md prints each artifact's status, so a stale manifest produced
  // a stale index too.
  await write(
    path.join(workspaceRoot, INDEX_PATH),
    renderIndex(manifest, await installedSkillIds(workspaceRoot)),
  );
  paths.push(INDEX_PATH);

  // The lock records integrity for generated files. Leaving it behind is what
  // made `silver repair` a required manual follow-up.
  const lockAbsolute = path.join(workspaceRoot, LOCK_PATH);
  try {
    const lock = parse(await readFile(lockAbsolute, "utf8"));
    if (Array.isArray(lock?.managed_files)) {
      let lockChanged = false;
      for (const entry of lock.managed_files) {
        if (entry.path !== INDEX_PATH) continue;
        const observed = integrity(
          await readFile(path.join(workspaceRoot, INDEX_PATH), "utf8"),
        );
        if (entry.base_integrity !== observed) {
          entry.base_integrity = observed;
          lockChanged = true;
        }
      }
      if (lockChanged) {
        await write(lockAbsolute, stringify(lock));
        paths.push(LOCK_PATH);
      }
    }
  } catch {
    // A workspace without a readable lock still gets a consistent manifest and
    // index; `silver doctor` reports the lock separately.
  }

  return { changes, paths };
}
