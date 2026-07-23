import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import {
  exists,
  integrity,
  listTopLevel,
  readUtf8,
  resolveInside,
  writeNewFile,
} from "./lib/files.mjs";
import { renderIndex } from "./lib/index.mjs";
import { validateSchema } from "./lib/schemas.mjs";
import {
  FRAMEWORK_VERSION,
  LOCAL_SOURCE_REFERENCE,
} from "./version.mjs";

const installerRoot = path.dirname(fileURLToPath(import.meta.url));
const templateRoot = path.join(installerRoot, "templates", "blank-workspace");
const allowedBlankEntries = new Set([
  ".DS_Store",
  ".git",
  ".gitignore",
  "LICENSE",
  "LICENSE.md",
  "README.md",
]);
const seededTemplates = [
  "design/brand.md",
  "design/product.md",
  "design/voice.md",
  "design/design-principles.md",
  "design/system/README.md",
  "design/decisions/README.md",
  "design/permissions.yaml",
  "prototypes/README.md",
];
const workspaceIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function displayNameFromPath(root) {
  return path
    .basename(root)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "");
}

function renderTemplate(content, variables) {
  return content.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (!(key in variables)) {
      throw new Error(`Unknown template variable: ${key}`);
    }
    return variables[key];
  });
}

async function readTemplate(relativePath, variables) {
  const content = await readFile(path.join(templateRoot, relativePath), "utf8");
  return renderTemplate(content, variables);
}

function renderLock({ version, sourceReference, indexContent }) {
  return stringify({
    schema: "design-practice/lock/v1",
    framework: {
      version,
      source: {
        type: "local",
        reference: sourceReference,
      },
    },
    packages: [],
    managed_files: [
      {
        path: "design/INDEX.md",
        owner: "framework-indexer",
        ownership: "generated",
        base_integrity: integrity(indexContent),
      },
    ],
  });
}

async function assertSetupTarget(root) {
  const manifestPath = path.join(root, "design", "manifest.yaml");
  if (await exists(manifestPath)) {
    return "existing";
  }

  const unexpected = (await listTopLevel(root)).filter(
    (entry) => !allowedBlankEntries.has(entry),
  );
  if (unexpected.length > 0) {
    throw new Error(
      "This folder is not blank and does not contain design/manifest.yaml. " +
        "Existing-codebase adoption is not implemented yet. " +
        `Unexpected entries: ${unexpected.sort().join(", ")}`,
    );
  }
  return "new";
}

export async function setupWorkspace(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  await mkdir(root, { recursive: true });
  const mode = await assertSetupTarget(root);
  const date = options.date ?? todayUtc();
  const version = options.version ?? FRAMEWORK_VERSION;
  const sourceReference =
    options.sourceReference ?? LOCAL_SOURCE_REFERENCE;

  let workspaceName;
  let workspaceId;
  let manifest;
  const manifestPath = path.join(root, "design", "manifest.yaml");

  if (mode === "existing") {
    try {
      manifest = parse(await readUtf8(manifestPath));
      workspaceName = manifest?.workspace?.name;
      workspaceId = manifest?.workspace?.id;
    } catch (error) {
      throw new Error(
        `Cannot resume setup because design/manifest.yaml is invalid: ${error.message}`,
      );
    }
    if (!workspaceName || !workspaceId) {
      throw new Error(
        "Cannot resume setup because design/manifest.yaml has no workspace name or id. Run doctor for details.",
      );
    }
    const validation = await validateSchema("manifest.schema.json", manifest);
    if (!validation.valid) {
      throw new Error(
        "Cannot resume setup because design/manifest.yaml violates the v1 contract. " +
          "Run doctor for details.",
      );
    }
  } else {
    workspaceName =
      options.name?.trim() || displayNameFromPath(root) || "Untitled Product";
    workspaceId = options.id?.trim() || slugify(workspaceName);
    if (!workspaceIdPattern.test(workspaceId)) {
      throw new Error(
        `Workspace id "${workspaceId}" must be lowercase kebab-case and begin with a letter.`,
      );
    }
  }

  const variables = {
    DATE: date,
    WORKSPACE_ID: workspaceId,
    WORKSPACE_NAME: workspaceName,
  };
  const created = [];
  const preserved = [];

  if (mode === "new") {
    const manifestContent = await readTemplate(
      "design/manifest.yaml",
      variables,
    );
    await writeNewFile(manifestPath, manifestContent);
    created.push("design/manifest.yaml");
    manifest = parse(manifestContent);
  } else {
    preserved.push("design/manifest.yaml");
  }

  for (const relativePath of seededTemplates) {
    const destination = resolveInside(root, relativePath);
    if (await exists(destination)) {
      preserved.push(relativePath);
      continue;
    }
    const content = await readTemplate(relativePath, variables);
    await writeNewFile(destination, content);
    created.push(relativePath);
  }

  const indexPath = path.join(root, "design", "INDEX.md");
  let indexContent;
  if (await exists(indexPath)) {
    indexContent = await readUtf8(indexPath);
    preserved.push("design/INDEX.md");
  } else {
    indexContent = renderIndex(manifest);
    await writeNewFile(indexPath, indexContent);
    created.push("design/INDEX.md");
  }

  const lockPath = path.join(root, ".design-framework", "lock.yaml");
  if (await exists(lockPath)) {
    preserved.push(".design-framework/lock.yaml");
  } else {
    const lockContent = renderLock({
      version,
      sourceReference,
      indexContent,
    });
    await writeNewFile(lockPath, lockContent);
    created.push(".design-framework/lock.yaml");
  }

  return {
    root,
    mode,
    workspace: { id: workspaceId, name: workspaceName },
    created,
    preserved,
    recommendedNextActions: [
      "Review design/product.md and design/brand.md.",
      "Run design-practice doctor to verify the workspace.",
    ],
  };
}
