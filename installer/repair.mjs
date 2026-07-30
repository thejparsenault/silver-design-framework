import path from "node:path";

import { parse, stringify } from "yaml";

import { doctorWorkspace } from "./doctor.mjs";
import { exists, integrity, readUtf8, writeUtf8 } from "./lib/files.mjs";
import { renderIndex } from "./lib/index.mjs";
import { validateSchema } from "./lib/schemas.mjs";
import { renderAgentPointer } from "./setup.mjs";
import {
  CLAUDE_MEMORY_PATH,
  mergeClaudeMemory,
  renderClaudeBlock,
  writeClaudeSkillLinks,
  writeLauncher,
} from "./agent-adapters.mjs";

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

function managedFileOwner(relativePath) {
  if (relativePath === "design/INDEX.md") return "framework-indexer";
  if (relativePath === CLAUDE_MEMORY_PATH) return "framework-agent-adapter";
  return "framework-agent-pointer";
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
    ".silver/lock.yaml",
    "v2/lock.schema.json",
  );
  const skillIds = lock.packages
    .filter(({ type }) => type === "skill")
    .map(({ id }) => id);
  const claudeMemoryPath = path.join(root, CLAUDE_MEMORY_PATH);
  const generated = new Map([
    ["design/INDEX.md", renderIndex(manifest, skillIds)],
    ["AGENTS.md", renderAgentPointer(skillIds)],
    // Refreshes Silver's block in place and leaves project-owned content alone.
    [
      CLAUDE_MEMORY_PATH,
      mergeClaudeMemory(
        (await exists(claudeMemoryPath))
          ? await readUtf8(claudeMemoryPath)
          : undefined,
        renderClaudeBlock(skillIds),
      ),
    ],
  ]);
  const repaired = [];
  const unchanged = [];

  // Links and the launcher are directories and executables rather than managed
  // file content, so they are reconciled separately from the map above.
  const { linked } = await writeClaudeSkillLinks(root, skillIds);
  repaired.push(...linked);
  repaired.push(...(await writeLauncher(root)));

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
        owner: managedFileOwner(relativePath),
        ownership: "generated",
        base_integrity: integrity(content),
      });
    }
  }

  const lockPath = path.join(root, ".silver", "lock.yaml");
  const nextLock = stringify(lock);
  if ((await readUtf8(lockPath)) !== nextLock) {
    await writeUtf8(lockPath, nextLock);
    repaired.push(".silver/lock.yaml");
  } else {
    unchanged.push(".silver/lock.yaml");
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
