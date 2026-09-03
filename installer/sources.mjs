import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { parse, stringify } from "yaml";

import { assertV2 } from "../framework/runtime/contracts.mjs";
import { runGit } from "../framework/runtime/git.mjs";
import { createCheckpoint } from "./checkpoint.mjs";
import { resolveDesignContext } from "./context.mjs";
import { findPinnedDependents } from "./lib/dependents.mjs";
import {
  exists,
  readUtf8,
  resolveInside,
  snapshotFiles,
  writeUtf8,
} from "./lib/files.mjs";
import {
  createWorkspaceMutator,
  workspaceContentIntegrity,
} from "../framework/runtime/workspace-mutations.mjs";

async function gitToplevel(root) {
  try {
    const result = await runGit(root, ["rev-parse", "--show-toplevel"]);
    return result.stdout.trim();
  } catch {
    return null;
  }
}

// For a `type: "git"` source whose reference lives inside the same
// repository as the workspace (e.g. a snapshot directory checked into the
// workspace's own repo), `git rev-parse HEAD` is the wrong revision to
// compare against: it advances on every commit anywhere in that repository,
// not just ones touching the linked paths, so an unrelated workspace commit
// would falsely flag the source as changed upstream even though its content
// integrity hash never moved. Scope the observed revision to the linked
// paths' own history whenever source and workspace share a git toplevel. A
// genuinely external repository keeps the whole-repo HEAD, since "has the
// external repository moved at all" is the meaningful question there.
async function gitHead(root, { workspaceRoot, paths } = {}) {
  try {
    if (workspaceRoot && paths?.length) {
      const [sourceToplevel, workspaceToplevel] = await Promise.all([
        gitToplevel(root),
        gitToplevel(workspaceRoot),
      ]);
      if (sourceToplevel && sourceToplevel === workspaceToplevel) {
        const result = await runGit(root, ["log", "-1", "--format=%H", "--", ...paths]);
        return result.stdout.trim() || null;
      }
    }
    const result = await runGit(root, ["rev-parse", "HEAD"]);
    return result.stdout.trim();
  } catch {
    return null;
  }
}

// A registered reference is stored relative to the workspace so a clone
// keeps working from wherever it lands; resolving it against process.cwd()
// instead of the workspace root would silently work only when Silver
// happens to be invoked from the workspace directory itself.
function resolveSourceReference(root, reference) {
  return path.isAbsolute(reference)
    ? reference
    : path.resolve(path.resolve(root), reference);
}

export async function linkedSourceIntegrity(root, selectedPaths) {
  const base = path.resolve(root);
  const hash = createHash("sha256");
  for (const selected of [...selectedPaths].sort()) {
    const absolute = resolveInside(base, selected);
    if (!(await exists(absolute))) {
      throw new Error(`Linked source path does not exist: ${selected}`);
    }
    const metadata = await stat(absolute);
    if (metadata.isDirectory()) {
      const files = [...(await snapshotFiles(absolute)).entries()].sort(
        ([left], [right]) => left.localeCompare(right),
      );
      for (const [relative, content] of files) {
        hash.update(`${selected}/${relative}`.split(path.sep).join("/"));
        hash.update("\0");
        hash.update(content);
        hash.update("\0");
      }
    } else {
      hash.update(selected.split(path.sep).join("/"));
      hash.update("\0");
      hash.update(await readFile(absolute));
      hash.update("\0");
    }
  }
  return `sha256:${hash.digest("hex")}`;
}

async function verifyLinkedSource(root, source) {
  await assertV2(
    source.schema === "silver/linked-source/v2"
      ? "linked-source-v2.schema.json"
      : "linked-source.schema.json",
    source,
  );
  const reference = resolveSourceReference(root, source.source.reference);
  const observedIntegrity = await linkedSourceIntegrity(
    reference,
    source.source.paths,
  );
  if (observedIntegrity !== source.source.integrity) {
    throw new Error(
      `Linked ${source.kind} source ${source.id} changed since review; inspect and re-pin it.`,
    );
  }
  if (source.source.type === "git") {
    const revision = await gitHead(reference, { workspaceRoot: root, paths: source.source.paths });
    if (revision !== source.source.revision) {
      throw new Error(
        `Linked ${source.kind} source ${source.id} is not at reviewed commit ${source.source.revision}.`,
      );
    }
  }
}

export async function writeSourceRegistry(root, sources) {
  for (const source of sources) await verifyLinkedSource(root, source);
  const file = path.join(
    path.resolve(root),
    "design",
    "sources",
    "sources.yaml",
  );
  const schema = sources.some(({ schema }) => schema === "silver/linked-source/v2")
    ? "silver/source-registry/v2"
    : "silver/source-registry/v1";
  const registry = { schema, sources };
  if (schema === "silver/source-registry/v2") {
    await assertV2("source-registry-v2.schema.json", registry);
  }
  const mutator = await createWorkspaceMutator(root);
  await mutator.write("design/sources/sources.yaml", stringify(registry));
  return file;
}

export async function inspectLinkedSources(root) {
  const file = path.join(
    path.resolve(root),
    "design",
    "sources",
    "sources.yaml",
  );
  if (!(await exists(file))) return [];
  const registry = parse(await readUtf8(file));
  if (registry?.schema === "silver/source-registry/v2") {
    await assertV2("source-registry-v2.schema.json", registry);
  } else if (registry?.schema !== "silver/source-registry/v1" || !Array.isArray(registry.sources)) {
    throw new Error("Linked source registry does not declare a supported contract.");
  }
  const results = [];
  for (const source of registry.sources) {
    await assertV2(
      source.schema === "silver/linked-source/v2"
        ? "linked-source-v2.schema.json"
        : "linked-source.schema.json",
      source,
    );
    const reference = resolveSourceReference(root, source.source.reference);
    if (!(await exists(reference))) {
      results.push({
        id: source.id,
        kind: source.kind,
        authority: source.authority,
        state: "unavailable",
        recorded_revision: source.source.revision,
        reference: source.source.reference,
        ...(source.source.reference_hint
          ? { reference_hint: source.source.reference_hint }
          : {}),
      });
      continue;
    }
    let observedIntegrity;
    try {
      observedIntegrity = await linkedSourceIntegrity(
        reference,
        source.source.paths,
      );
    } catch {
      results.push({
        id: source.id,
        kind: source.kind,
        authority: source.authority,
        state: "unavailable",
        recorded_revision: source.source.revision,
        reference: source.source.reference,
        ...(source.source.reference_hint
          ? { reference_hint: source.source.reference_hint }
          : {}),
      });
      continue;
    }
    const observedRevision =
      source.source.type === "git"
        ? await gitHead(reference, { workspaceRoot: root, paths: source.source.paths })
        : `snapshot-${observedIntegrity.slice(7, 19)}`;
    const current =
      observedIntegrity === source.source.integrity &&
      (source.source.type !== "git" ||
        observedRevision === source.source.revision);
    const staleDependents = current
      ? []
      : await findPinnedDependents({
          root,
          field: "linked_sources",
          id: source.id,
          revision: source.source.revision,
          integrity: source.source.integrity,
        });
    results.push({
      id: source.id,
      kind: source.kind,
      authority: source.authority,
      state: current ? "current" : "external-changed",
      recorded_revision: source.source.revision,
      observed_revision: observedRevision ?? "unverified",
      observed_integrity: observedIntegrity,
      ...(current
        ? {}
        : {
            repin_proposal: {
              ...source,
              source: {
                ...source.source,
                revision: observedRevision ?? source.source.revision,
                integrity: observedIntegrity,
              },
            },
            stale_dependents: staleDependents,
          }),
    });
  }
  return results;
}

function formatForPath(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".tokens.json")) return "dtcg-json";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown-frontmatter";
  if (/\.(css|js|mjs|cjs|ts|tsx|jsx|txt|html|svg)$/.test(lower)) return "text";
  return "binary";
}

function defaultLocalPath(kind, externalPath) {
  const name = path.basename(externalPath);
  if (kind === "design-system") return `design/system/${name}`;
  if (kind === "component-catalog") return `design/system/${name}`;
  return `design/imports/codebase/${name}`;
}

export function migrateLinkedSourceV1(source) {
  if (source.schema === "silver/linked-source/v2") return source;
  return {
    ...source,
    schema: "silver/linked-source/v2",
    sync_policy: "notify",
    mappings: [],
  };
}

export async function inspectSourceLink({
  root,
  targetPath,
  kind,
  as,
  answers = {},
  linkedBy = "silver-link",
  now = new Date().toISOString(),
}) {
  const workspace = path.resolve(root);
  const absoluteTarget = path.resolve(process.cwd(), targetPath);
  if (!(await exists(absoluteTarget))) throw new Error(`No such path to link: ${targetPath}`);
  if (!new Set(["design-system", "component-catalog", "codebase"]).has(kind)) {
    throw new Error(`Unsupported linked-source kind: ${kind}`);
  }
  const id = as ?? slugify(path.basename(absoluteTarget));
  const registryPath = path.join(workspace, "design/sources/sources.yaml");
  const registryContent = (await exists(registryPath)) ? await readUtf8(registryPath) : null;
  const mappings = (answers.mappings ?? []).map((mapping, index) => ({
    id: mapping.id ?? `mapping-${index + 1}`,
    external_path: mapping.external_path,
    local_path: mapping.local_path ?? defaultLocalPath(kind, mapping.external_path),
    format: mapping.format ?? formatForPath(mapping.external_path),
    artifact_kind:
      mapping.artifact_kind ??
      (kind === "design-system" ? "design-system" : kind === "component-catalog" ? "component-catalog" : "implementation"),
  }));
  const selectedPaths = answers.paths ?? [...new Set(mappings.map(({ external_path }) => external_path))];
  if (selectedPaths.length === 0) selectedPaths.push(".");
  const sourceIntegrity = await linkedSourceIntegrity(absoluteTarget, selectedPaths);
  const revision = await gitHead(absoluteTarget);
  let manifest = null;
  try {
    manifest = parse(await readUtf8(path.join(workspace, "design/manifest.yaml")));
  } catch {}
  const workspaceId = manifest?.workspace?.id ?? "workspace";
  const checks = (answers.checks ?? []).map((check) => ({
    id: check.id,
    argv: check.argv,
    cwd: check.cwd ?? ".",
    required: check.required ?? true,
    timeout_seconds: check.timeout_seconds ?? 120,
  }));
  const source = {
    schema: "silver/linked-source/v2",
    id,
    title: answers.title ?? path.basename(absoluteTarget),
    kind,
    source: {
      type: revision ? "git" : "local",
      reference: path.relative(workspace, absoluteTarget) || ".",
      reference_hint: absoluteTarget,
      revision: revision ?? `snapshot-${sourceIntegrity.slice(7, 19)}`,
      integrity: sourceIntegrity,
      paths: selectedPaths,
    },
    authority: answers.authority ?? "external-authoritative",
    sync_policy: answers.sync_policy ?? "notify",
    mappings,
    writeback: {
      branch: answers.branch ?? `silver/sync-${workspaceId}-${id}`,
      checks,
    },
    scope: answers.scope ?? {},
    linked_at: now,
    linked_by: linkedBy,
  };
  const bindings = mappings.map((mapping) => ({
    schema: "silver/representation-binding/v2",
    id: `${id}-${mapping.id}`,
    artifact: {
      id: `${id}-${mapping.id}`,
      kind: mapping.artifact_kind,
      revision: "r1",
      path: mapping.local_path,
    },
    counterpart: {
      type: "linked-source",
      source_id: id,
      path: mapping.external_path,
      format: mapping.format,
    },
    adapter: { id: "silver-repository", version: "0.9.2" },
    authority: source.authority,
    round_trip: mapping.format === "binary" ? "read-only" : "lossless",
    sync_policy: source.sync_policy,
    base: { state: "uninitialized" },
  }));
  const unresolved = [];
  if (mappings.length === 0) {
    unresolved.push({
      path: selectedPaths.join(", "),
      reason: "No external-to-local mappings were declared; the source can be registered read-only but cannot synchronize yet.",
    });
  }
  for (const mapping of mappings) {
    if (mapping.format === "binary") {
      unresolved.push({ path: mapping.external_path, reason: "Binary data has no synchronization adapter." });
    }
  }
  const plan = {
    schema: "silver/link-plan/v1",
    id: `link-${id}`,
    workspace: {
      root: workspace,
      registry_integrity: registryContent === null ? null : workspaceContentIntegrity(registryContent),
    },
    source,
    bindings,
    unresolved,
    expected_effects: [
      { action: registryContent === null ? "create" : "update", path: "design/sources/sources.yaml" },
      ...bindings.map(({ id: bindingId }) => ({ action: "create", path: `design/integrations/${bindingId}.yaml` })),
    ],
    inspected_at: now,
  };
  await assertV2("link-plan.schema.json", plan);
  return plan;
}

export async function applySourceLinkPlan({ plan, allowUnresolved = false }) {
  await assertV2("link-plan.schema.json", plan);
  if (plan.unresolved.length && !allowUnresolved) {
    throw new Error("Link plan has unresolved mappings; review them or pass --allow-unresolved.");
  }
  const workspace = path.resolve(plan.workspace.root);
  const registryPath = "design/sources/sources.yaml";
  const mutator = await createWorkspaceMutator(workspace);
  const existingContent = (await exists(mutator.absolute(registryPath)))
    ? await readUtf8(mutator.absolute(registryPath))
    : null;
  const observed = existingContent === null ? null : workspaceContentIntegrity(existingContent);
  if (observed !== plan.workspace.registry_integrity) {
    throw new Error("Source registry changed after link inspection.");
  }
  await verifyLinkedSource(workspace, plan.source);
  const existingRegistry = existingContent
    ? parse(existingContent)
    : { schema: "silver/source-registry/v2", sources: [] };
  const sources = (existingRegistry.sources ?? []).map(migrateLinkedSourceV1);
  if (sources.some(({ id }) => id === plan.source.id)) {
    throw new Error(`A source named ${plan.source.id} is already linked.`);
  }
  const registry = {
    schema: "silver/source-registry/v2",
    sources: [...sources, plan.source],
  };
  await assertV2("source-registry-v2.schema.json", registry);
  await mutator.write(registryPath, stringify(registry));
  for (const binding of plan.bindings) {
    await mutator.create(`design/integrations/${binding.id}.yaml`, stringify(binding));
  }
  return {
    plan: plan.id,
    root: workspace,
    source: plan.source,
    bindings: plan.bindings.map(({ id }) => id),
    unresolved: plan.unresolved,
  };
}

export async function applySourceRepin({
  root,
  proposal,
  now = new Date().toISOString(),
}) {
  const workspace = path.resolve(root);
  await verifyLinkedSource(workspace, proposal);
  const file = path.join(workspace, "design", "sources", "sources.yaml");
  const registry = parse(await readUtf8(file));
  const index = (registry.sources ?? []).findIndex(
    ({ id }) => id === proposal.id,
  );
  if (index < 0) throw new Error(`Linked source ${proposal.id} is not registered.`);
  const previous = registry.sources[index];
  const staleDependents = await findPinnedDependents({
    root: workspace,
    field: "linked_sources",
    id: previous.id,
    revision: previous.source.revision,
    integrity: previous.source.integrity,
  });
  registry.sources[index] = proposal;
  const mutator = await createWorkspaceMutator(workspace);
  await mutator.write("design/sources/sources.yaml", stringify(registry));
  const checkpoint = await createCheckpoint({
    root: workspace,
    id: `source-${proposal.id}-${proposal.source.revision}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+$/g, ""),
    reason: "workspace-configuration",
    paths: ["design/sources/sources.yaml"],
    now,
  });
  return { source: proposal, checkpoint, stale_dependents: staleDependents };
}

function slugify(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[a-z]/.test(slug) ? slug : `codebase-${slug}`;
}

function nextRevision(revision) {
  const value = Number(revision.slice(1));
  if (!Number.isInteger(value)) throw new Error(`Unsupported revision: ${revision}`);
  return `r${value + 1}`;
}

// `silver link` registers an external codebase as a pinned linked-source and,
// where exactly one active design context exists, records the link on its
// `codebase` field. It never moves, renames, or reads into the target beyond
// what integrity hashing requires — the codebase stays exactly what it was.
export async function linkCodebase({
  root,
  targetPath,
  as,
  linkedBy = "silver-link",
  now = new Date().toISOString(),
}) {
  const workspace = path.resolve(root);
  const absoluteTarget = path.resolve(process.cwd(), targetPath);
  if (!(await exists(absoluteTarget))) {
    throw new Error(`No such path to link: ${targetPath}`);
  }
  const id = as ?? slugify(path.basename(absoluteTarget));

  const file = path.join(workspace, "design", "sources", "sources.yaml");
  const registry = (await exists(file))
    ? parse(await readUtf8(file))
    : { schema: "silver/source-registry/v1", sources: [] };
  if ((registry.sources ?? []).some((source) => source.id === id)) {
    throw new Error(
      `A source named ${id} is already linked; choose a different --as id.`,
    );
  }

  const paths = ["."];
  const revision = await gitHead(absoluteTarget, { workspaceRoot: workspace, paths });
  const linked = {
    schema: "silver/linked-source/v1",
    id,
    title: path.basename(absoluteTarget),
    kind: "codebase",
    source: {
      type: revision ? "git" : "local",
      reference: path.relative(workspace, absoluteTarget) || ".",
      reference_hint: absoluteTarget,
      revision: revision ?? "local",
      integrity: await linkedSourceIntegrity(absoluteTarget, paths),
      paths,
    },
    authority: "external-authoritative",
    scope: {},
    linked_at: now,
    linked_by: linkedBy,
  };

  registry.sources = [...(registry.sources ?? []), linked];
  await writeSourceRegistry(workspace, registry.sources);
  const checkpointPaths = ["design/sources/sources.yaml"];

  let updatedContext = null;
  const resolved = await resolveDesignContext({ root: workspace });
  if (resolved.status === "resolved") {
    const contextPath = path.join(workspace, resolved.context.path);
    const context = parse(await readUtf8(contextPath));
    context.codebase = { ...context.codebase, linked_source: id };
    context.revision = nextRevision(context.revision);
    await assertV2("design-context.schema.json", context);
    const mutator = await createWorkspaceMutator(workspace);
    await mutator.write(mutator.relative(contextPath), stringify(context));
    checkpointPaths.push(resolved.context.path);
    updatedContext = { id: context.id, revision: context.revision, path: resolved.context.path };
  }

  const checkpoint = await createCheckpoint({
    root: workspace,
    id: `link-${id}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+$/g, ""),
    reason: "workspace-configuration",
    paths: checkpointPaths,
    now,
  });

  return { source: linked, design_context: updatedContext, checkpoint };
}
