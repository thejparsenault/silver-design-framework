import path from "node:path";

import { parse } from "yaml";

import {
  loadDesignContexts,
  resolveDesignContext,
} from "./context.mjs";
import { inspectGuidanceSources } from "./guidance.mjs";
import { inspectLinkedSources } from "./sources.mjs";
import { discoverProviders } from "../framework/runtime/providers.mjs";
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
  treeIntegrity,
} from "./lib/files.mjs";
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
    if (value.schema !== registry.schema || !Array.isArray(value.sources)) {
      diagnostics.push(
        diagnostic(
          "error",
          "schema-invalid",
          `${registry.label} does not declare the v1 schema.`,
          mapping.path,
        ),
      );
      return;
    }
    for (const source of value.sources) {
      await applySchema(
        `v2/${registry.entrySchema}`,
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
        if (
          installedPackage.ownership === "framework-managed" &&
          installedPackage.integrity &&
          (await treeIntegrity(absolute)) !== installedPackage.integrity
        ) {
          diagnostics.push(
            diagnostic(
              "error",
              "managed-package-stale",
              "Framework-managed package differs from the integrity recorded in the lock.",
              packagePath,
            ),
          );
        }
      }

      for (const managed of lock.managed_files) {
        let managedPath;
        try {
          managedPath = resolveInside(root, managed.path);
        } catch (error) {
          diagnostics.push(
            diagnostic("error", "unsafe-path", error.message, managed.path),
          );
          continue;
        }
        if (!(await exists(managedPath))) {
          diagnostics.push(
            diagnostic(
              "error",
              "missing-managed-file",
              "Managed file does not exist.",
              managed.path,
            ),
          );
          continue;
        }
        if (managed.base_integrity) {
          const observed = integrity(await readUtf8(managedPath));
          if (observed !== managed.base_integrity) {
            diagnostics.push(
              diagnostic(
                "error",
                "managed-file-stale",
                "Managed file differs from the integrity recorded in the lock.",
                managed.path,
              ),
            );
          }
        }
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

  // A preference naming a transport nobody installed silently does nothing.
  for (const [activityId, binding] of Object.entries(
    manifest.tool_preferences?.activities ?? {},
  )) {
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
