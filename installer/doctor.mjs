import path from "node:path";

import { parse } from "yaml";

import {
  loadDesignContexts,
  resolveDesignContext,
} from "./context.mjs";
import { inspectGuidanceSources } from "./guidance.mjs";
import { inspectLinkedSources } from "./sources.mjs";
import { findFiles, workspacePath } from "../framework/skills/design-check/scripts/check-lib.mjs";
import { loadActivityCatalog } from "../framework/runtime/activities.mjs";
import { assertV2 } from "../framework/runtime/contracts.mjs";
import { inspectManagedIntegrity } from "../framework/runtime/managed-integrity.mjs";
import { discoverProviders } from "../framework/runtime/providers.mjs";
import { defaultPracticeRoot } from "./practice.mjs";
import {
  CLAUDE_BLOCK_BEGIN,
  CLAUDE_MEMORY_PATH,
  CLAUDE_SKILLS_DIRECTORY,
  LAUNCHER_PATH,
  claudeSkillLinkState,
  launcherResolution,
} from "./agent-adapters.mjs";
import {
  exists,
  integrity,
  readUtf8,
  resolveInside,
} from "./lib/files.mjs";
import { inspectWorkspacePath } from "../framework/runtime/workspace-mutations.mjs";
import { listWorkspaceTransactions } from "../framework/runtime/workspace-transactions.mjs";
import { renderIndex } from "./lib/index.mjs";
import { validateSchema } from "./lib/schemas.mjs";
import {
  isDirectoryKind,
  isInactiveKind,
  registryContractFor,
  structuredSchemaFor,
} from "../framework/skills/design-check/scripts/artifact-kinds.mjs";
import {
  WORKSPACE_PRACTICE_OVERLAY_PATH,
  loadMethodOverlays,
  resolveStudioVoice,
} from "./practice-overlay.mjs";

function diagnostic(level, code, message, relativePath) {
  return {
    level,
    code,
    message,
    ...(relativePath ? { path: relativePath } : {}),
  };
}

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (!match) {
    throw new Error("YAML frontmatter is missing");
  }
  const value = parse(match[1]);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("YAML frontmatter must be an object");
  }
  return value;
}

// YAML is a JSON superset, so this reads both the .yaml registries and the
// .json structured artifacts.
async function loadStructured(root, relativePath, diagnostics) {
  let absolute;
  try {
    absolute = resolveInside(root, relativePath);
  } catch (error) {
    diagnostics.push(
      diagnostic("error", "unsafe-path", error.message, relativePath),
    );
    return undefined;
  }
  if (!(await exists(absolute))) {
    diagnostics.push(
      diagnostic(
        "error",
        "missing-file",
        "Required file does not exist.",
        relativePath,
      ),
    );
    return undefined;
  }
  try {
    return parse(await readUtf8(absolute));
  } catch (error) {
    diagnostics.push(
      diagnostic("error", "invalid-yaml", error.message, relativePath),
    );
    return undefined;
  }
}

async function applySchema(schemaName, value, relativePath, diagnostics) {
  const result = await validateSchema(schemaName, value);
  for (const error of result.errors) {
    diagnostics.push(
      diagnostic("error", "schema-invalid", error, relativePath),
    );
  }
  return result.valid;
}

async function inspectArtifact(root, mapping, diagnostics) {
  let absolute;
  try {
    absolute = resolveInside(root, mapping.path);
  } catch (error) {
    diagnostics.push(
      diagnostic("error", "unsafe-path", error.message, mapping.path),
    );
    return;
  }
  if (!(await exists(absolute))) {
    diagnostics.push(
      diagnostic(
        "error",
        "missing-artifact",
        "Mapped artifact does not exist.",
        mapping.path,
      ),
    );
    return;
  }
  // An adopted artifact is registered, not owned. It was written by the product
  // team before Silver arrived, in whatever shape suited them, and adoption
  // promised not to rewrite it — so demanding Silver frontmatter here would make
  // the only way to clear this diagnostic the one thing adoption said it would
  // never do. Existence and reachability are checked; format is the project's.
  if (mapping.origin === "adopted") {
    return;
  }
  // How a kind is stored decides how it is inspected. See
  // framework/skills/design-check/scripts/artifact-kinds.mjs.
  if (isInactiveKind(mapping.kind) || isDirectoryKind(mapping.kind)) {
    return;
  }
  const structuredSchema = structuredSchemaFor(mapping.kind);
  if (structuredSchema) {
    const value = await loadStructured(root, mapping.path, diagnostics);
    if (!value) return;
    const valid = await applySchema(
      `v2/${structuredSchema}`,
      value,
      mapping.path,
      diagnostics,
    );
    // token-source is a resolved DTCG tree, not a Silver artifact document — it
    // has no id of its own to compare against the manifest mapping.
    if (valid && value.id !== undefined && value.id !== mapping.id) {
      diagnostics.push(
        diagnostic(
          "error",
          "artifact-mismatch",
          `Artifact id "${value.id}" disagrees with manifest value "${mapping.id}".`,
          mapping.path,
        ),
      );
    }
    return;
  }
  const registry = registryContractFor(mapping.kind);
  if (registry) {
    const value = await loadStructured(root, mapping.path, diagnostics);
    if (!value) return;
    const variant = (registry.variants ?? [registry]).find(
      ({ schema }) => schema === value.schema,
    );
    if (!variant || !Array.isArray(value.sources)) {
      diagnostics.push(
        diagnostic(
          "error",
          "schema-invalid",
          `${registry.label} does not declare a supported schema.`,
          mapping.path,
        ),
      );
      return;
    }
    for (const source of value.sources) {
      await applySchema(
        `v2/${variant.entrySchema}`,
        source,
        mapping.path,
        diagnostics,
      );
    }
    return;
  }
  if (!mapping.path.endsWith(".md")) {
    diagnostics.push(
      diagnostic(
        "error",
        "narrative-artifact-not-markdown",
        `A ${mapping.kind} artifact records intent in Markdown with frontmatter, but this path is not a .md file.`,
        mapping.path,
      ),
    );
    return;
  }

  let metadata;
  try {
    metadata = parseFrontmatter(await readUtf8(absolute));
  } catch (error) {
    diagnostics.push(
      diagnostic("error", "invalid-frontmatter", error.message, mapping.path),
    );
    return;
  }
  const valid = await applySchema(
    "artifact.schema.json",
    metadata,
    mapping.path,
    diagnostics,
  );
  if (!valid) {
    return;
  }
  for (const field of ["id", "kind", "scope", "status"]) {
    if (metadata[field] !== mapping[field]) {
      diagnostics.push(
        diagnostic(
          "error",
          "artifact-mismatch",
          `Frontmatter ${field} "${metadata[field]}" disagrees with manifest value "${mapping[field]}".`,
          mapping.path,
        ),
      );
    }
  }
}

export async function doctorWorkspace(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const diagnostics = [];
  for (const managedPath of [".silver", ".skills", "design", "design/system", ".claude", ".claude/skills"]) {
    const inspection = await inspectWorkspacePath(root, managedPath);
    if (!inspection.safe) {
      diagnostics.push(
        diagnostic(
          "error",
          "unsafe-managed-path",
          `Managed writes are blocked because ${inspection.unsafe_at} is a ${inspection.reason}. Replace it with a real workspace path or use a reviewed linked-source import.`,
          managedPath,
        ),
      );
    }
  }
  const manifest = await loadStructured(
    root,
    "design/manifest.yaml",
    diagnostics,
  );
  if (!manifest) {
    return { ok: false, root, diagnostics };
  }
  const manifestValid = await applySchema(
    "manifest.schema.json",
    manifest,
    "design/manifest.yaml",
    diagnostics,
  );
  if (!manifestValid) {
    return { ok: false, root, diagnostics };
  }

  const artifactIds = new Set();
  for (const mapping of manifest.artifacts) {
    const pathInspection = await inspectWorkspacePath(root, mapping.path);
    if (!pathInspection.safe) {
      diagnostics.push(
        diagnostic(
          "error",
          "unsafe-managed-path",
          `Artifact destination crosses ${pathInspection.reason} at ${pathInspection.unsafe_at}; Silver will not read or write through it.`,
          mapping.path,
        ),
      );
      continue;
    }
    if (artifactIds.has(mapping.id)) {
      diagnostics.push(
        diagnostic(
          "error",
          "duplicate-artifact-id",
          `Artifact id "${mapping.id}" is mapped more than once.`,
          "design/manifest.yaml",
        ),
      );
    }
    artifactIds.add(mapping.id);
    await inspectArtifact(root, mapping, diagnostics);
  }

  const indexPath = path.join(root, "design", "INDEX.md");
  if (manifest.permission_policy) {
    const permissionPolicy = await loadStructured(
      root,
      manifest.permission_policy,
      diagnostics,
    );
    if (permissionPolicy) {
      await applySchema(
        "permission-policy.schema.json",
        permissionPolicy,
        manifest.permission_policy,
        diagnostics,
      );
    }
  }

  const lock = await loadStructured(
    root,
    ".silver/lock.yaml",
    diagnostics,
  );
  if (lock) {
    const lockSchema =
      lock.schema === "silver/lock/v2"
        ? "v2/lock.schema.json"
        : "lock.schema.json";
    const lockValid = await applySchema(
      lockSchema,
      lock,
      ".silver/lock.yaml",
      diagnostics,
    );
    if (lockValid) {
      for (const managedPath of [
        ...(lock.packages ?? []).map(({ path: packagePath, type, id }) =>
          packagePath ?? (type === "skill" ? `.skills/${id}` : null),
        ),
        ...(lock.managed_files ?? []).map(({ path: managedFile }) => managedFile),
        ".silver/results",
      ].filter(Boolean)) {
        const inspection = await inspectWorkspacePath(root, managedPath);
        if (!inspection.safe) {
          diagnostics.push(
            diagnostic(
              "error",
              "unsafe-managed-path",
              `Managed destination crosses ${inspection.reason} at ${inspection.unsafe_at}; Silver will not mutate it.`,
              managedPath,
            ),
          );
        }
      }
    }
    if (lockValid) {
      const skillIds = lock.packages
        .filter(({ type }) => type === "skill")
        .map(({ id }) => id);
      const expectedIndex = renderIndex(manifest, skillIds);
      if (
        (await exists(indexPath)) &&
        (await readUtf8(indexPath)) !== expectedIndex
      ) {
        diagnostics.push(
          diagnostic(
            "error",
            "generated-index-stale",
            "Generated index does not match the manifest and installed package lock.",
            "design/INDEX.md",
          ),
        );
      }

      for (const installedPackage of lock.packages) {
        const packagePath =
          installedPackage.path ??
          (installedPackage.type === "skill" ? `.skills/${installedPackage.id}` : undefined);
        if (!packagePath) {
          continue;
        }
        const absolute = resolveInside(root, packagePath);
        if (!(await exists(absolute))) {
          diagnostics.push(
            diagnostic(
              "error",
              "missing-package",
              `Installed ${installedPackage.type} package does not exist.`,
              packagePath,
            ),
          );
          continue;
        }
      }

      for (const issue of await inspectManagedIntegrity(root, lock)) {
        diagnostics.push(
          diagnostic("error", issue.code, issue.message, issue.path),
        );
      }
    }
  }

  try {
    for (const context of await loadDesignContexts(root)) {
      const resolved = await resolveDesignContext({
        root,
        contextId: context.id,
      });
      if (resolved.stale_dependents?.length > 0) {
        diagnostics.push(
          diagnostic(
            "warning",
            "design-context-stale-dependent",
            `${resolved.stale_dependents.length} durable artifact(s) pin an older ${context.id} revision.`,
            "design/contexts",
          ),
        );
      }
    }
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "error",
        "design-context-invalid",
        error.message,
        "design/contexts",
      ),
    );
  }

  try {
    for (const source of await inspectGuidanceSources(root)) {
      if (source.state === "current") continue;
      diagnostics.push(
        diagnostic(
          source.influence === "required" && source.state === "unavailable"
            ? "error"
            : "warning",
          `guidance-${source.state}`,
          source.state === "external-changed"
            ? "Linked guidance changed upstream; review the re-pin proposal before updating."
            : "Linked guidance is unavailable; no automatic replacement was attempted.",
          "design/guidance/sources.yaml",
        ),
      );
    }
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "error",
        "guidance-inspection-failed",
        error.message,
        "design/guidance/sources.yaml",
      ),
    );
  }

  try {
    for (const source of await inspectLinkedSources(root)) {
      if (source.state === "current") continue;
      diagnostics.push(
        diagnostic(
          "warning",
          `linked-source-${source.state}`,
          source.state === "external-changed"
            ? `Linked ${source.kind} changed upstream; review the re-pin proposal before updating.`
            : `Linked ${source.kind} is unavailable; no automatic replacement was attempted.`,
          "design/sources/sources.yaml",
        ),
      );
    }
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "error",
        "linked-source-inspection-failed",
        error.message,
        "design/sources/sources.yaml",
      ),
    );
  }

  // `sketch` is deprecated in favor of `visualize` (0.9). The artifact is
  // still valid and migration never rewrites it, but a designer re-running
  // the work gets a styled, current renderer — so this is informational,
  // never an error.
  try {
    const jsonFiles = await findFiles(path.join(root, "design"), (file) => file.endsWith(".json"));
    const deprecated = [];
    for (const absolute of jsonFiles) {
      let value;
      try {
        value = JSON.parse(await readUtf8(absolute));
      } catch {
        continue;
      }
      if (value?.schema === "silver/working-artifact/v2" && value.kind === "sketch") {
        deprecated.push(workspacePath(root, absolute));
      }
    }
    if (deprecated.length > 0) {
      diagnostics.push(
        diagnostic(
          "info",
          "deprecated-artifact-kind",
          `${deprecated.length} artifact(s) use the deprecated kind "sketch"; re-run visualize, or update kind to "visualization".`,
          deprecated[0],
        ),
      );
    }
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "error",
        "deprecated-artifact-scan-failed",
        error.message,
        "design",
      ),
    );
  }

  // Agent-host adapters. These are generated and repairable, so a problem here
  // is a warning: canonical design work is unaffected.
  try {
    const skillIds = (lock?.packages ?? [])
      .filter(({ type }) => type === "skill")
      .map(({ id }) => id);
    if (skillIds.length > 0) {
      const { missing, broken } = await claudeSkillLinkState(root, skillIds);
      if (missing.length > 0) {
        diagnostics.push(
          diagnostic(
            "warning",
            "claude-skill-links-missing",
            `Claude Code cannot discover ${missing.length} skill(s) without .claude/skills entries; run \`silver repair\`.`,
            ".claude/skills",
          ),
        );
      }
      if (broken.length > 0) {
        diagnostics.push(
          diagnostic(
            "warning",
            "claude-skill-links-broken",
            `${broken.length} .claude/skills entr(ies) do not resolve to a SKILL.md; run \`silver repair\`.`,
            ".claude/skills",
          ),
        );
      }
      // Generic ids like `system` and `map` used to be advertised unprefixed,
      // where a personal or bundled skill of the same name could shadow them.
      // Every adapter entry is namespaced since 0.7, so a leftover unprefixed
      // link is the only remaining collision risk.
      const unprefixed = [];
      for (const id of skillIds) {
        if (await exists(path.join(root, CLAUDE_SKILLS_DIRECTORY, id))) {
          unprefixed.push(id);
        }
      }
      if (unprefixed.length > 0) {
        diagnostics.push(
          diagnostic(
            "warning",
            "claude-skill-name-collision-risk",
            `${unprefixed.length} .claude/skills entr(ies) are still advertised without the silver- prefix, so a personal or bundled skill of the same name can shadow them; run \`silver repair\`.`,
            ".claude/skills",
          ),
        );
      }
    }

    // Whether your practice is applied here is not a health problem, but it is
    // the kind of thing a designer should be able to see without reading files.
    const activeVoice = await resolveStudioVoice();
    const { overlays, invalid } = await loadMethodOverlays();
    const hasPersonal =
      activeVoice?.source === "practice" || overlays.length > 0;
    const materialized = await exists(
      path.join(root, WORKSPACE_PRACTICE_OVERLAY_PATH),
    );
    if (hasPersonal && !materialized) {
      diagnostics.push(
        diagnostic(
          "warning",
          "practice-not-applied",
          "Your personal practice is not applied in this workspace; run `silver repair`.",
          WORKSPACE_PRACTICE_OVERLAY_PATH,
        ),
      );
    } else if (!hasPersonal && materialized) {
      diagnostics.push(
        diagnostic(
          "warning",
          "practice-overlay-stale",
          "A personal practice is applied here but no longer exists in My Practice; run `silver repair`.",
          WORKSPACE_PRACTICE_OVERLAY_PATH,
        ),
      );
    }
    // A malformed personal file is never fatal, but silently ignoring it would
    // leave a designer wondering why their preference had no effect.
    for (const entry of invalid) {
      diagnostics.push(
        diagnostic(
          "warning",
          "method-overlay-invalid",
          `Method overlay ${entry.path} in My Practice is not applied because it is invalid: ${entry.reason}`,
          WORKSPACE_PRACTICE_OVERLAY_PATH,
        ),
      );
    }

    const claudeMemory = (await exists(path.join(root, CLAUDE_MEMORY_PATH)))
      ? await readUtf8(path.join(root, CLAUDE_MEMORY_PATH))
      : null;
    if (claudeMemory === null) {
      diagnostics.push(
        diagnostic(
          "warning",
          "claude-memory-missing",
          "Claude Code reads CLAUDE.md rather than AGENTS.md; run `silver repair` to generate it.",
          CLAUDE_MEMORY_PATH,
        ),
      );
    } else if (!claudeMemory.includes(CLAUDE_BLOCK_BEGIN)) {
      diagnostics.push(
        diagnostic(
          "warning",
          "claude-memory-block-missing",
          "CLAUDE.md no longer contains the Silver block, so AGENTS.md is not imported; run `silver repair`.",
          CLAUDE_MEMORY_PATH,
        ),
      );
    }

    // A portable launcher probes the workspace at run time and an npx launcher
    // resolves by version, so neither has a path that can rot. Only a pre-0.7
    // hard-coded launcher does.
    const launcher = await launcherResolution(root);
    if (launcher === null) {
      diagnostics.push(
        diagnostic(
          "warning",
          "launcher-missing",
          "Installed skills cannot resolve the guarded runtime without .silver/bin/silver; run `silver repair`.",
          LAUNCHER_PATH,
        ),
      );
    } else if (launcher.mode === "hard-coded-path") {
      diagnostics.push(
        diagnostic(
          "warning",
          "launcher-not-portable",
          `.silver/bin/silver hard-codes ${launcher.entryPoint}, so it breaks when this workspace is moved, cloned, or checked out on another machine; run \`silver repair\` to replace it with a portable launcher.`,
          LAUNCHER_PATH,
        ),
      );
    }
  } catch (error) {
    diagnostics.push(
      diagnostic("error", "agent-adapter-inspection-failed", error.message),
    );
  }

  await inspectTransports(root, manifest, diagnostics, options);

  for (const transaction of await listWorkspaceTransactions(root)) {
    if (transaction.id === options.ignoreTransactionId) continue;
    if (transaction.recoverable) {
      diagnostics.push(
        diagnostic(
          "error",
          "workspace-transaction-incomplete",
          `Transaction ${transaction.id} (${transaction.command}) stopped in ${transaction.phase}; run \`silver recover resume ${transaction.id}\` or \`silver recover rollback ${transaction.id}\`.`,
          `.silver/transactions/${transaction.id}/journal.json`,
        ),
      );
    } else if (transaction.phase === "invalid") {
      diagnostics.push(
        diagnostic(
          "error",
          "workspace-transaction-invalid",
          `Transaction journal ${transaction.id} is invalid and cannot be trusted.`,
          `.silver/transactions/${transaction.id}/journal.json`,
        ),
      );
    }
  }

  return {
    ok: diagnostics.every(({ level }) => level !== "error"),
    root,
    diagnostics,
  };
}

// Tools, in the command a stuck designer actually reaches for.
//
// Before 0.9 `doctor` had no idea transports existed: a workspace whose
// preferred tool was gone, or whose declared transport pointed at a server that
// had since been removed from the host, reported itself perfectly healthy. The
// answer lived in a different command you had to already suspect.
//
// Everything here is a warning. A missing external tool is not a broken
// workspace — the portable baseline still does the work — and process guidance
// is recommended rather than enforced.
async function inspectTransports(root, manifest, diagnostics, options = {}) {
  let providers;
  try {
    providers = await discoverProviders({ root, home: options.home });
  } catch (error) {
    diagnostics.push(
      diagnostic("warning", "transport-inspection-failed", error.message),
    );
    return;
  }
  const byId = new Map(providers.map((provider) => [provider.id, provider]));

  let catalog = null;
  try {
    catalog = await loadActivityCatalog({ root });
  } catch (error) {
    diagnostics.push(
      diagnostic("warning", "activity-catalog-invalid", error.message),
    );
  }
  const knownActivityIds = new Set((catalog?.activities ?? []).map(({ id }) => id));

  // A preference naming a transport nobody installed silently does nothing.
  for (const [activityId, binding] of Object.entries(
    manifest.tool_preferences?.activities ?? {},
  )) {
    if (catalog && !knownActivityIds.has(activityId)) {
      diagnostics.push(
        diagnostic(
          "warning",
          "preferred-activity-unknown",
          `design/manifest.yaml prefers a transport for ${activityId}, but no activity with that id exists in the catalog. If this project predates a rename, update the key.`,
          "design/manifest.yaml",
        ),
      );
    }
    for (const id of binding.use ?? []) {
      if (!byId.has(id)) {
        diagnostics.push(
          diagnostic(
            "warning",
            "preferred-transport-missing",
            `design/manifest.yaml prefers ${id} for ${activityId}, but no transport with that id is installed. The preference has no effect.`,
            "design/manifest.yaml",
          ),
        );
      }
    }
  }

  // My Practice's tools.yaml lives outside every workspace, so `silver migrate`
  // never sees it and a schema mismatch (e.g. from an activity-id rename) would
  // otherwise silently drop the whole file with no message anywhere — see
  // `personalPreferences()` in installer/tools.mjs, which treats a parse or
  // validation failure as "no preferences" rather than an error. This is the
  // one place that failure becomes visible.
  const practiceRoot = path.resolve(options.practiceRoot ?? defaultPracticeRoot());
  const personalToolsPath = path.join(practiceRoot, "tools.yaml");
  if (await exists(personalToolsPath)) {
    try {
      const personal = parse(await readUtf8(personalToolsPath));
      await assertV2("tool-preferences.schema.json", personal);
      if (catalog) {
        for (const activityId of Object.keys(personal.activities ?? {})) {
          if (!knownActivityIds.has(activityId)) {
            diagnostics.push(
              diagnostic(
                "warning",
                "personal-preferred-activity-unknown",
                `My Practice's tools.yaml prefers a transport for ${activityId}, but no activity with that id exists in the catalog. If this predates a rename, update the key with \`silver tools --bind\`.`,
                personalToolsPath,
              ),
            );
          }
        }
      }
    } catch (error) {
      diagnostics.push(
        diagnostic(
          "warning",
          "personal-tools-invalid",
          `My Practice's tools.yaml does not match its schema, so every personal transport preference in it is silently ignored: ${error.message}`,
          personalToolsPath,
        ),
      );
    }
  }

  for (const provider of providers) {
    // A declaration whose server has vanished from the host is the one failure
    // mode a designer cannot guess at: the file is still here and still valid.
    if (
      provider.origin === "project-declared" &&
      provider.availability_level === "absent"
    ) {
      diagnostics.push(
        diagnostic(
          "warning",
          "declared-transport-absent",
          `${provider.id} is declared here, but no MCP server named ${provider.connection?.server} is configured in this agent host any more.`,
          `design/tools/transports/${provider.id}.yaml`,
        ),
      );
    }
    if (provider.probe_state === "stale") {
      diagnostics.push(
        diagnostic(
          "warning",
          "transport-probe-stale",
          `${provider.id} last confirmed responding outside its freshness window. Run \`silver tools --probe ${provider.id}\` to check it again.`,
        ),
      );
    }
    if (provider.probe_state === "failed" || provider.probe_state === "refused") {
      diagnostics.push(
        diagnostic(
          "warning",
          "transport-unresponsive",
          `${provider.id} is configured but did not respond when last called. Run \`silver tools --diagnose ${provider.id}\`.`,
        ),
      );
    }
  }

  // Unmapped host servers are deliberately *not* reported here. They are a fact
  // about the machine, not this workspace, and 0.7 established that a fresh
  // workspace produces zero diagnostics — a property that would become
  // machine-dependent the moment someone's personal MCP configuration could
  // change it. `silver tools` reports them, which is where a question about
  // tools belongs.
}
