import path from "node:path";

import { parse } from "yaml";

import {
  exists,
  integrity,
  readUtf8,
  resolveInside,
  treeIntegrity,
} from "./lib/files.mjs";
import { renderIndex } from "./lib/index.mjs";
import { validateSchema } from "./lib/schemas.mjs";

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

async function loadYaml(root, relativePath, diagnostics) {
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
  if (mapping.kind === "permission-policy") {
    return;
  }
  if (!mapping.path.endsWith(".md")) {
    diagnostics.push(
      diagnostic(
        "warning",
        "frontmatter-not-checked",
        "Narrative artifact is not Markdown, so frontmatter was not checked.",
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
  const manifest = await loadYaml(
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
    const permissionPolicy = await loadYaml(
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

  const lock = await loadYaml(
    root,
    ".silver/lock.yaml",
    diagnostics,
  );
  if (lock) {
    const lockValid = await applySchema(
      "lock.schema.json",
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
          installedPackage.type === "skill"
            ? `.skills/${installedPackage.id}`
            : installedPackage.type === "reference-system"
              ? "reference-system"
              : undefined;
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

  return {
    ok: diagnostics.every(({ level }) => level !== "error"),
    root,
    diagnostics,
  };
}
