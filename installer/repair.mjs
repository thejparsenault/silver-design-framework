import path from "node:path";

import { parse, stringify } from "yaml";

import { doctorWorkspace } from "./doctor.mjs";
import { exists, integrity, readUtf8, writeUtf8 } from "./lib/files.mjs";
import { renderIndex } from "./lib/index.mjs";
import { validateSchema } from "./lib/schemas.mjs";
import { renderAgentPointer } from "./setup.mjs";

async function loadValidatedYaml(root, relativePath, schemaName) {
  const absolute = path.join(root, relativePath);
  if (!(await exists(absolute))) {
    throw new Error(`Cannot repair without ${relativePath}.`);
  }
  let value;
  try {
    value = parse(await readUtf8(absolute));
  } catch (error) {
    throw new Error(`${relativePath} is invalid YAML: ${error.message}`);
  }
  const validation = await validateSchema(schemaName, value);
  if (!validation.valid) {
    throw new Error(
      `${relativePath} violates the v1 contract: ${validation.errors.join("; ")}`,
    );
  }
  return value;
}

export async function repairWorkspace(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const manifest = await loadValidatedYaml(
    root,
    "design/manifest.yaml",
    "manifest.schema.json",
  );
  const lock = await loadValidatedYaml(
    root,
    ".design-framework/lock.yaml",
    "lock.schema.json",
  );
  const skillIds = lock.packages
    .filter(({ type }) => type === "skill")
    .map(({ id }) => id);
  const generated = new Map([
    ["design/INDEX.md", renderIndex(manifest, skillIds)],
    ["AGENTS.md", renderAgentPointer(skillIds)],
  ]);
  const repaired = [];
  const unchanged = [];

  for (const [relativePath, content] of generated) {
    const absolute = path.join(root, relativePath);
    if ((await exists(absolute)) && (await readUtf8(absolute)) === content) {
      unchanged.push(relativePath);
    } else {
      await writeUtf8(absolute, content);
      repaired.push(relativePath);
    }
    const managed = lock.managed_files.find(
      ({ path: managedPath }) => managedPath === relativePath,
    );
    if (managed) {
      managed.base_integrity = integrity(content);
    } else {
      lock.managed_files.push({
        path: relativePath,
        owner:
          relativePath === "design/INDEX.md"
            ? "framework-indexer"
            : "framework-agent-pointer",
        ownership: "generated",
        base_integrity: integrity(content),
      });
    }
  }

  const lockPath = path.join(root, ".design-framework", "lock.yaml");
  const nextLock = stringify(lock);
  if ((await readUtf8(lockPath)) !== nextLock) {
    await writeUtf8(lockPath, nextLock);
    repaired.push(".design-framework/lock.yaml");
  } else {
    unchanged.push(".design-framework/lock.yaml");
  }

  const diagnosis = await doctorWorkspace({ root });
  return {
    ok: diagnosis.ok,
    root,
    repaired,
    unchanged,
    diagnostics: diagnosis.diagnostics,
  };
}
