import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import {
  copyNewTree,
  exists,
  integrity,
  readUtf8,
  replaceTree,
  treeIntegrity,
  writeNewFile,
  writeUtf8,
} from "./lib/files.mjs";
import { renderIndex } from "./lib/index.mjs";
import { validateSchema } from "./lib/schemas.mjs";
import {
  INITIAL_SKILL_IDS,
  renderAgentPointer,
  sourcePackages,
} from "./setup.mjs";
import {
  FRAMEWORK_VERSION,
  LOCAL_SOURCE_REFERENCE,
} from "./version.mjs";

const installerRoot = path.dirname(fileURLToPath(import.meta.url));
const templateRoot = path.join(installerRoot, "templates", "blank-workspace");
const newProjectFiles = [
  "design/assets/catalog.json",
  "design/assets/README.md",
  "design/presentation-kit/kit.json",
  "design/presentation-kit/templates/opportunity.json",
  "design/presentation-kit/templates/proposal.json",
  "design/presentation-kit/templates/outcome.json",
  "design/presentation-kit/README.md",
  "design/work/README.md",
  "presentations/README.md",
  "production/README.md",
];
const independentChecks = [
  "contract-integrity",
  "flow-structure",
  "semantic-styles",
  "prototype-policy",
  "evidence-provenance",
  "presentation-integrity",
  "production-readiness",
  "asset-integrity",
  "accessibility",
  "responsive-behavior",
  "critical-interactions",
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function renderTemplate(content, variables) {
  return content.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!(key in variables)) throw new Error(`Unknown template variable: ${key}`);
    return variables[key];
  });
}

function migrateManifest(manifest) {
  const next = clone(manifest);
  const mappings = new Map(next.artifacts.map((artifact) => [artifact.id, artifact]));
  if (!mappings.has("project-assets")) {
    next.artifacts.push({
      id: "project-assets",
      kind: "asset-catalog",
      path: "design/assets/catalog.json",
      scope: "product",
      role: "canonical",
      status: "active",
      authority: { type: "local" },
    });
  }
  if (!mappings.has("presentation-kit")) {
    next.artifacts.push({
      id: "presentation-kit",
      kind: "presentation-kit",
      path: "design/presentation-kit/kit.json",
      scope: "product",
      role: "canonical",
      status: "active",
      authority: { type: "local" },
    });
  }
  next.checks.enabled = [...independentChecks];
  next.checks.suites = {
    fast: [...independentChecks],
    browser: ["accessibility", "responsive-behavior", "critical-interactions"],
    full: [...independentChecks],
  };
  return next;
}

function legacyPath(installed) {
  if (installed.path) return installed.path;
  if (installed.type === "skill") return `.skills/${installed.id}`;
  if (installed.type === "reference-system") return "reference-system";
  return null;
}

async function loadWorkspace(root) {
  const manifestPath = path.join(root, "design", "manifest.yaml");
  const lockPath = path.join(root, ".silver", "lock.yaml");
  if (!(await exists(manifestPath)) || !(await exists(lockPath))) {
    throw new Error("Migration requires design/manifest.yaml and .silver/lock.yaml.");
  }
  const manifest = parse(await readUtf8(manifestPath));
  const manifestValidation = await validateSchema("manifest.schema.json", manifest);
  if (!manifestValidation.valid) {
    throw new Error(`Manifest is invalid: ${manifestValidation.errors.join("; ")}`);
  }
  const lock = parse(await readUtf8(lockPath));
  if (lock.schema === "silver/lock/v2") {
    const validation = await validateSchema("v2/lock.schema.json", lock);
    if (!validation.valid) throw new Error(`Current lock is invalid: ${validation.errors.join("; ")}`);
    return { manifest, manifestPath, lock, lockPath, current: true };
  }
  const validation = await validateSchema("lock.schema.json", lock);
  if (!validation.valid) throw new Error(`Legacy lock is invalid: ${validation.errors.join("; ")}`);
  return { manifest, manifestPath, lock, lockPath, current: false };
}

async function buildPlan({ root, manifest, lock, payloadRoot, version }) {
  const packages = await sourcePackages({ version, payloadRoot });
  const targetById = new Map(packages.map((item) => [item.id, item]));
  const installedById = new Map(lock.packages.map((item) => [item.id, item]));
  const changes = [];
  const preserved = [];
  const conflicts = [];

  for (const installed of lock.packages) {
    if (installed.ownership !== "framework-managed") continue;
    if (!targetById.has(installed.id)) {
      conflicts.push({
        package: installed.id,
        path: legacyPath(installed),
        reason: "Legacy framework-managed package has no 0.2 migration target.",
      });
      continue;
    }
    const relative = legacyPath(installed);
    if (!relative || !(await exists(path.join(root, relative)))) {
      conflicts.push({
        package: installed.id,
        path: relative,
        reason: "Recorded legacy framework-managed package is missing.",
      });
      continue;
    }
    if (
      installed.integrity &&
      (await treeIntegrity(path.join(root, relative))) !== installed.integrity
    ) {
      conflicts.push({
        package: installed.id,
        path: relative,
        reason: "Local edits differ from the legacy installed base.",
      });
    }
  }

  for (const managed of lock.managed_files ?? []) {
    if (!["generated", "framework-managed"].includes(managed.ownership)) continue;
    const absolute = path.join(root, managed.path);
    if (
      (await exists(absolute)) &&
      managed.base_integrity &&
      integrity(await readUtf8(absolute)) !== managed.base_integrity
    ) {
      conflicts.push({
        package: managed.owner,
        path: managed.path,
        reason: "Locally edited managed file is ambiguous.",
      });
    }
  }

  for (const target of packages) {
    const absolute = path.join(root, target.path);
    const present = await exists(absolute);
    if (!present) {
      changes.push({ action: "install", package: target.id, path: target.path });
      continue;
    }
    const observed = await treeIntegrity(absolute);
    if (target.ownership === "copied-and-owned") {
      preserved.push({ package: target.id, path: target.path, reason: "Project-owned copy is preserved." });
      continue;
    }
    if (observed === target.integrity) {
      preserved.push({ package: target.id, path: target.path, reason: "Already matches 0.2." });
      continue;
    }
    const installed = installedById.get(target.id);
    if (!installed) {
      conflicts.push({
        package: target.id,
        path: target.path,
        reason: "Untracked files occupy a framework-managed migration target.",
      });
      continue;
    }
    changes.push({ action: "replace-clean-managed", package: target.id, path: target.path });
  }

  const nextManifest = migrateManifest(manifest);
  if (stringify(nextManifest) !== stringify(manifest)) {
    changes.push({ action: "upgrade-manifest", path: "design/manifest.yaml" });
  }
  for (const relative of newProjectFiles) {
    if (await exists(path.join(root, relative))) {
      preserved.push({ path: relative, reason: "Existing project-owned file is preserved." });
    } else {
      changes.push({ action: "seed-project-file", path: relative });
    }
  }
  changes.push({ action: "upgrade-lock", path: ".silver/lock.yaml" });
  changes.push({ action: "regenerate", path: "design/INDEX.md" });
  changes.push({ action: "regenerate", path: "AGENTS.md" });

  return { packages, changes, preserved, conflicts, nextManifest };
}

export async function migrateWorkspace(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const version = options.version ?? FRAMEWORK_VERSION;
  const sourceReference = options.sourceReference ?? LOCAL_SOURCE_REFERENCE;
  const workspace = await loadWorkspace(root);
  if (workspace.current) {
    return {
      ok: true,
      root,
      fromVersion: workspace.lock.framework.version,
      toVersion: version,
      needed: false,
      applied: false,
      changes: [],
      preserved: [],
      conflicts: [],
    };
  }
  const plan = await buildPlan({
    root,
    manifest: workspace.manifest,
    lock: workspace.lock,
    payloadRoot: options.payloadRoot,
    version,
  });
  const base = {
    ok: plan.conflicts.length === 0,
    root,
    fromVersion: workspace.lock.framework.version,
    toVersion: version,
    needed: true,
    applied: false,
    changes: plan.changes,
    preserved: plan.preserved,
    conflicts: plan.conflicts,
  };
  if (!options.apply || plan.conflicts.length) return base;

  const variables = {
    DATE: options.date ?? new Date().toISOString().slice(0, 10),
    WORKSPACE_ID: workspace.manifest.workspace.id,
    WORKSPACE_NAME: workspace.manifest.workspace.name,
  };
  for (const relative of newProjectFiles) {
    const destination = path.join(root, relative);
    if (await exists(destination)) continue;
    const content = renderTemplate(
      await readFile(path.join(templateRoot, relative), "utf8"),
      variables,
    );
    await writeNewFile(destination, content);
  }
  await writeUtf8(workspace.manifestPath, stringify(plan.nextManifest));

  const records = [];
  for (const target of plan.packages) {
    const destination = path.join(root, target.path);
    if (!(await exists(destination))) {
      await copyNewTree(target.sourcePath, destination);
    } else if (
      target.ownership === "framework-managed" &&
      (await treeIntegrity(destination)) !== target.integrity
    ) {
      await replaceTree(target.sourcePath, destination);
    }
    const { sourcePath, ...record } = target;
    records.push(
      target.ownership === "copied-and-owned"
        ? { ...record, integrity: await treeIntegrity(destination) }
        : record,
    );
  }

  const indexContent = renderIndex(plan.nextManifest, INITIAL_SKILL_IDS);
  const agentContent = renderAgentPointer(INITIAL_SKILL_IDS);
  await writeUtf8(path.join(root, "design", "INDEX.md"), indexContent);
  await writeUtf8(path.join(root, "AGENTS.md"), agentContent);
  const nextLock = {
    schema: "silver/lock/v2",
    framework: {
      version,
      source: { type: "local", reference: sourceReference },
    },
    packages: records,
    managed_files: [
      {
        path: "design/INDEX.md",
        owner: "framework-indexer",
        ownership: "generated",
        base_integrity: integrity(indexContent),
      },
      {
        path: "AGENTS.md",
        owner: "framework-agent-pointer",
        ownership: "generated",
        base_integrity: integrity(agentContent),
      },
    ],
  };
  const validation = await validateSchema("v2/lock.schema.json", nextLock);
  if (!validation.valid) {
    throw new Error(`Generated v2 lock is invalid: ${validation.errors.join("; ")}`);
  }
  await writeUtf8(workspace.lockPath, stringify(nextLock));
  return { ...base, applied: true };
}
