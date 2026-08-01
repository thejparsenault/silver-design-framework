import { createHash } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import {
  copyNewTree,
  exists,
  integrity,
  readUtf8,
  replaceTree,
  snapshotFiles,
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
import {
  CLAUDE_MEMORY_PATH,
  CLAUDE_SKILLS_DIRECTORY,
  LAUNCHER_PATH,
  mergeClaudeMemory,
  renderClaudeBlock,
  writeClaudeSkillLinks,
  writeLauncher,
} from "./agent-adapters.mjs";
import { planManifestStatusSync } from "../framework/runtime/manifest-sync.mjs";
import {
  ensureGitignoreEntries,
  resolveSharedStudioVoice,
  writeWorkspacePracticeOverlay,
} from "./practice-overlay.mjs";

const installerRoot = path.dirname(fileURLToPath(import.meta.url));
const templateRoot = path.join(installerRoot, "templates", "blank-workspace");
const newProjectFiles = [
  "design/TRACE.md",
  "design/contexts/README.md",
  "design/contexts/default-expression.yaml",
  "design/contexts/default.yaml",
  "design/guidance/README.md",
  "design/guidance/sources.yaml",
  "design/sources/README.md",
  "design/sources/sources.yaml",
  "design/integrations/README.md",
  "design/maps/README.md",
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
  "map-structure",
  "semantic-styles",
  "prototype-policy",
  "evidence-provenance",
  "presentation-integrity",
  "production-readiness",
  "asset-integrity",
  "accessibility",
  "responsive-behavior",
  "critical-interactions",
  "binding-integrity",
  "provider-revision-pins",
  "view-provenance",
  "synchronization-status",
  "semantic-mapping",
  "stale-proposals",
  "authority",
  "secret-free-configuration",
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
  next.artifacts = next.artifacts.filter(
    ({ kind }) => kind !== "permission-policy",
  );
  delete next.permission_policy;
  const mappings = new Map(next.artifacts.map((artifact) => [artifact.id, artifact]));
  function ensureArtifact(artifact) {
    if (mappings.has(artifact.id)) return;
    next.artifacts.push(artifact);
    mappings.set(artifact.id, artifact);
  }
  ensureArtifact({
    id: "component-catalog",
    kind: "component-catalog",
    path: "reference-system/html-contracts",
    scope: "product",
    role: "canonical",
    status: "active",
    authority: { type: "local" },
  });
  ensureArtifact({
    id: "default-component-expression",
    kind: "x-component-expression",
    path: "design/contexts/default-expression.yaml",
    scope: "product",
    role: "canonical",
    status: "active",
    authority: { type: "local" },
  });
  ensureArtifact({
    id: "default-design-context",
    kind: "x-design-context",
    path: "design/contexts/default.yaml",
    scope: "product",
    role: "canonical",
    status: "active",
    authority: { type: "local" },
  });
  ensureArtifact({
    id: "guidance-sources",
    kind: "x-guidance-source",
    path: "design/guidance/sources.yaml",
    scope: "product",
    role: "supporting",
    status: "active",
    authority: { type: "local" },
  });
  ensureArtifact({
    id: "linked-sources",
    kind: "x-linked-source",
    path: "design/sources/sources.yaml",
    scope: "product",
    role: "supporting",
    status: "active",
    authority: { type: "local" },
  });
  if (!mappings.has("project-assets")) {
    ensureArtifact({
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
    ensureArtifact({
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

// Derive a stable, schema-valid id for a legacy file with no recorded identity.
//
// Truncating to a fixed width could cut mid-token and leave a trailing or
// doubled hyphen, producing an id the contract pattern rejects — which failed a
// whole migration because of one awkward filename. Normalize after slicing, and
// verify the result rather than assuming it.
function bootstrapId(relativePath) {
  const digest = createHash("sha256")
    .update(relativePath)
    .digest("hex")
    .slice(0, 8);
  const stem =
    relativePath
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^[^a-z]+/, "")
      .slice(0, 48)
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "legacy-artifact";
  const id = `${stem}-${digest}`;
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)
    ? id
    : `legacy-artifact-${digest}`;
}

async function exactIntegrity(absolute) {
  return (await stat(absolute)).isDirectory()
    ? treeIntegrity(absolute)
    : integrity(await readFile(absolute));
}

async function provenanceBootstrap(root, manifest, createdAt) {
  const byPath = new Map();
  for (const artifact of manifest.artifacts) {
    if (artifact.kind === "permission-policy") continue;
    const absolute = path.join(root, artifact.path);
    if (!(await exists(absolute))) continue;
    byPath.set(artifact.path, {
      id: artifact.id,
      kind: artifact.kind,
      path: artifact.path,
      integrity: await exactIntegrity(absolute),
      origin: "legacy",
      source_revision: null,
      source_origin: null,
    });
  }
  for (const relativeRoot of [
    "design/work",
    "design/flows",
    "design/maps",
    "design/pitches",
    "design/evidence",
    "prototypes",
    "presentations",
    "production",
  ]) {
    const absoluteRoot = path.join(root, relativeRoot);
    if (!(await exists(absoluteRoot))) continue;
    for (const [relativeFile, content] of await snapshotFiles(absoluteRoot)) {
      const relativePath = path.join(relativeRoot, relativeFile).split(path.sep).join("/");
      if (byPath.has(relativePath)) continue;
      byPath.set(relativePath, {
        id: bootstrapId(relativePath),
        kind: "x-legacy-artifact",
        path: relativePath,
        integrity: integrity(content),
        origin: "legacy",
        source_revision: null,
        source_origin: null,
      });
    }
  }
  return {
    schema: "silver/provenance-bootstrap/v1",
    created_at: `${createdAt}T00:00:00Z`,
    artifacts: [...byPath.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
  };
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
    return {
      manifest,
      manifestPath,
      lock,
      lockPath,
      current: lock.framework.version === FRAMEWORK_VERSION,
    };
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
  const inactiveArtifacts = manifest.artifacts
    .filter(({ kind }) => kind === "permission-policy")
    .map(({ id, path: artifactPath }) => ({
      id,
      path: artifactPath,
      reason: "Legacy Silver permission policy is preserved but inactive in 0.5.",
    }));

  const retiredIds = new Set(RETIRED_PACKAGES.map(({ id }) => id));
  for (const installed of lock.packages) {
    if (installed.ownership !== "framework-managed") continue;
    // A package this release deliberately removes is not an orphan. Without
    // this, retiring one blocks the whole migration on a conflict describing
    // the very thing the migration is there to do.
    if (retiredIds.has(installed.id)) continue;
    if (!targetById.has(installed.id)) {
      conflicts.push({
        package: installed.id,
        path: legacyPath(installed),
        reason: "Installed framework-managed package has no migration target.",
      });
      continue;
    }
    const relative = legacyPath(installed);
    if (!relative || !(await exists(path.join(root, relative)))) {
      conflicts.push({
        package: installed.id,
        path: relative,
        reason: "Recorded framework-managed package is missing.",
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
        reason: "Local edits differ from the installed base.",
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
      preserved.push({ package: target.id, path: target.path, reason: "Already matches the target release." });
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

  for (const retired of RETIRED_PACKAGES) {
    if (!(await exists(path.join(root, retired.path)))) continue;
    changes.push({
      action: "retire",
      package: retired.id,
      path: retired.path,
      detail: retired.reason,
    });
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
  if (await exists(path.join(root, ".silver", "provenance", "legacy-artifacts.json"))) {
    preserved.push({
      path: ".silver/provenance/legacy-artifacts.json",
      reason: "Existing provenance bootstrap index is preserved.",
    });
  } else {
    changes.push({
      action: "bootstrap-provenance",
      path: ".silver/provenance/legacy-artifacts.json",
    });
  }
  preserved.push(...inactiveArtifacts.map((artifact) => ({
    path: artifact.path,
    reason: artifact.reason,
  })));
  changes.push({ action: "upgrade-lock", path: ".silver/lock.yaml" });
  changes.push({ action: "regenerate", path: "design/INDEX.md" });
  changes.push({ action: "regenerate", path: "AGENTS.md" });
  // Agent-host adapters added in 0.6. CLAUDE.md merges rather than overwrites,
  // so a project-owned file keeps its content.
  changes.push({ action: "regenerate", path: CLAUDE_MEMORY_PATH });
  changes.push({ action: "link-skills", path: CLAUDE_SKILLS_DIRECTORY });
  changes.push({ action: "regenerate", path: LAUNCHER_PATH });
  // 0.7: the launcher stops hard-coding an absolute path, adapter links gain the
  // silver- prefix so generic ids cannot be shadowed, the personal studio voice
  // is ignored, and manifest status is reconciled with the artifacts themselves.
  changes.push({ action: "regenerate", path: ".gitignore" });
  for (const change of await planManifestStatusSync({ root, manifest: nextManifest })) {
    changes.push({
      action: "reconcile-status",
      path: "design/manifest.yaml",
      detail: `${change.id}: ${change.from} → ${change.to} (from ${change.path})`,
    });
  }

  return {
    packages,
    changes,
    preserved,
    conflicts,
    inactiveArtifacts,
    nextManifest,
  };
}

// Packages a release removes rather than replaces. Leaving a superseded provider
// installed is not harmless: `discoverProviders` reads whatever is on disk, so a
// retired package keeps competing for the activities it used to serve.
const RETIRED_PACKAGES = [
  {
    id: "figma",
    path: ".silver/providers/figma",
    reason:
      "0.8 split Figma into transports; figma-console-mcp and figma-official-mcp replace it.",
  },
];

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
      inactiveArtifacts: [],
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
    inactiveArtifacts: plan.inactiveArtifacts,
  };
  if (!options.apply || plan.conflicts.length) return base;

  const variables = {
    DATE: options.date ?? new Date().toISOString().slice(0, 10),
    WORKSPACE_ID: workspace.manifest.workspace.id,
    WORKSPACE_NAME: workspace.manifest.workspace.name,
  };
  const bootstrap = await provenanceBootstrap(
    root,
    workspace.manifest,
    variables.DATE,
  );
  const bootstrapPath = path.join(
    root,
    ".silver",
    "provenance",
    "legacy-artifacts.json",
  );
  if (!(await exists(bootstrapPath))) {
    const validation = await validateSchema(
      "v2/provenance-bootstrap.schema.json",
      bootstrap,
    );
    if (!validation.valid) {
      throw new Error(
        `Generated provenance bootstrap is invalid: ${validation.errors.join("; ")}`,
      );
    }
    await writeNewFile(bootstrapPath, `${JSON.stringify(bootstrap, null, 2)}\n`);
  }
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

  // Remove superseded packages before installing the new ones, so a retired
  // provider never coexists with its replacements even for one step.
  for (const retired of RETIRED_PACKAGES) {
    await rm(path.join(root, retired.path), { recursive: true, force: true });
  }

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

  // The seeded presentation kit shipped with an id that disagreed with its own
  // manifest entry, and a hard-coded exception in the checker hid it. Now that
  // structured artifacts are all validated the same way, the disagreement is
  // visible, so align the scaffold's identity with the manifest that maps it.
  const kitEntry = plan.nextManifest.artifacts.find(
    ({ kind }) => kind === "presentation-kit",
  );
  if (kitEntry) {
    const kitPath = path.join(root, kitEntry.path);
    if (await exists(kitPath)) {
      const kit = JSON.parse(await readFile(kitPath, "utf8"));
      if (kit.id !== kitEntry.id) {
        await writeUtf8(
          kitPath,
          `${JSON.stringify({ ...kit, id: kitEntry.id }, null, 2)}\n`,
        );
      }
    }
  }

  // Reconcile manifest status against what each artifact says about itself.
  //
  // A workspace that ran 0.6 can have accepted artifacts marked `active` in
  // their own frontmatter while the manifest still calls them `draft` — the
  // disagreement that made fast validation fail and forced a hand-edit followed
  // by `silver repair`. Migration heals that in place rather than expecting the
  // user to know which files disagree.
  const statusChanges = await planManifestStatusSync({
    root,
    manifest: plan.nextManifest,
  });
  for (const change of statusChanges) {
    const entry = plan.nextManifest.artifacts.find(({ id }) => id === change.id);
    if (entry) entry.status = change.to;
  }
  if (statusChanges.length > 0) {
    await writeUtf8(workspace.manifestPath, stringify(plan.nextManifest));
  }

  const indexContent = renderIndex(plan.nextManifest, INITIAL_SKILL_IDS);
  const agentContent = renderAgentPointer(
    INITIAL_SKILL_IDS,
    await resolveSharedStudioVoice(),
  );
  await writeUtf8(path.join(root, "design", "INDEX.md"), indexContent);
  await writeUtf8(path.join(root, "AGENTS.md"), agentContent);

  // Ignore the personal studio voice before it can be committed, then apply it.
  await ensureGitignoreEntries(root);
  await writeWorkspacePracticeOverlay(root);

  const claudeMemoryPath = path.join(root, CLAUDE_MEMORY_PATH);
  const claudeMemoryContent = mergeClaudeMemory(
    (await exists(claudeMemoryPath)) ? await readUtf8(claudeMemoryPath) : undefined,
    renderClaudeBlock(INITIAL_SKILL_IDS),
  );
  await writeUtf8(claudeMemoryPath, claudeMemoryContent);
  await writeClaudeSkillLinks(root, INITIAL_SKILL_IDS);
  await writeLauncher(root);
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
      {
        path: CLAUDE_MEMORY_PATH,
        owner: "framework-agent-adapter",
        ownership: "generated",
        base_integrity: integrity(claudeMemoryContent),
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
