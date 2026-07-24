import path from "node:path";

import { parse, stringify } from "yaml";

import { doctorWorkspace } from "./doctor.mjs";
import {
  exists,
  readUtf8,
  replaceTree,
  treeIntegrity,
  writeUtf8,
} from "./lib/files.mjs";
import { validateSchema } from "./lib/schemas.mjs";
import { repairWorkspace } from "./repair.mjs";
import {
  payloadRoots,
  sourcePackages,
} from "./setup.mjs";
import {
  FRAMEWORK_VERSION,
  LOCAL_SOURCE_REFERENCE,
} from "./version.mjs";

async function loadLock(root) {
  const lockPath = path.join(root, ".silver", "lock.yaml");
  if (!(await exists(lockPath))) {
    throw new Error("Cannot update without .silver/lock.yaml.");
  }
  const lock = parse(await readUtf8(lockPath));
  const schemaName =
    lock.schema === "silver/lock/v2"
      ? "v2/lock.schema.json"
      : "lock.schema.json";
  const validation = await validateSchema(schemaName, lock);
  if (!validation.valid) {
    throw new Error(
      `.silver/lock.yaml violates its declared contract: ${validation.errors.join("; ")}`,
    );
  }
  return { lock, lockPath };
}

export async function updateWorkspace(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const payloadRoot = options.payloadRoot;
  const version = options.version ?? FRAMEWORK_VERSION;
  const sourceReference =
    options.sourceReference ?? LOCAL_SOURCE_REFERENCE;
  const { lock, lockPath } = await loadLock(root);
  const fromVersion = lock.framework.version;
  const source = await sourcePackages({ version, payloadRoot });
  const sourceById = new Map(source.map((item) => [item.id, item]));
  const conflicts = [];

  for (const installed of lock.packages) {
    if (installed.ownership !== "framework-managed") {
      continue;
    }
    const target = sourceById.get(installed.id);
    if (!target) {
      conflicts.push({
        package: installed.id,
        reason: "The installed framework-managed package is absent from the target release.",
      });
      continue;
    }
    const relativePath =
      installed.path ??
      (installed.type === "skill"
        ? `.skills/${installed.id}`
        : installed.type === "reference-system"
          ? "reference-system"
          : undefined);
    if (!relativePath) {
      conflicts.push({
        package: installed.id,
        reason: "The installed package has no managed path.",
      });
      continue;
    }
    const absolute = path.join(root, relativePath);
    if (
      (await exists(absolute)) &&
      installed.integrity &&
      (await treeIntegrity(absolute)) !== installed.integrity
    ) {
      conflicts.push({
        package: installed.id,
        path: relativePath,
        reason: "Local edits differ from the installed base.",
      });
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      root,
      fromVersion,
      toVersion: version,
      updated: [],
      preserved: [],
      proposals: [],
      conflicts,
    };
  }

  const updated = [];
  const preserved = [];
  const proposals = [];
  for (const installed of lock.packages) {
    const target = sourceById.get(installed.id);
    if (!target) {
      preserved.push(installed.id);
      continue;
    }
    if (installed.ownership === "framework-managed") {
      if (installed.integrity !== target.integrity) {
        await replaceTree(
          target.sourcePath,
          path.join(root, target.path),
        );
        const { sourcePath, ...record } = target;
        Object.assign(installed, record);
        updated.push(installed.id);
      } else {
        installed.version = target.version;
        preserved.push(installed.id);
      }
      continue;
    }
    if (installed.ownership === "copied-and-owned") {
      if (installed.integrity === target.integrity) {
        installed.version = target.version;
        preserved.push(installed.id);
      } else {
        proposals.push({
          package: installed.id,
          reason:
            "A newer copied-and-owned package is available; project files were not changed.",
          installed_integrity: installed.integrity,
          available_integrity: target.integrity,
        });
        preserved.push(installed.id);
      }
    }
  }

  lock.framework = {
    version,
    source: {
      type: "local",
      reference: sourceReference,
    },
  };
  await writeUtf8(lockPath, stringify(lock));
  const repair = await repairWorkspace({ root });
  const diagnosis = await doctorWorkspace({ root });

  return {
    ok: repair.ok && diagnosis.ok,
    root,
    fromVersion,
    toVersion: version,
    updated,
    preserved,
    proposals,
    conflicts: [],
    repaired: repair.repaired,
    diagnostics: diagnosis.diagnostics,
  };
}
