import { spawn } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { parse, stringify } from "yaml";

import { assertV2 } from "../framework/runtime/contracts.mjs";
import { runGit } from "../framework/runtime/git.mjs";
import {
  createFigmaChangeSet,
  normalizeFigmaSnapshot,
  previewSemanticTokenWrite,
} from "../framework/providers/figma-console-mcp/adapter.mjs";
import { preparePortableReconciliation } from "../framework/runtime/reconciliation.mjs";
import { valueIntegrity } from "../framework/runtime/representations.mjs";
import { inspectRepositoryBinding } from "../framework/runtime/sync-adapters/repository.mjs";
import {
  createWorkspaceMutator,
  workspaceContentIntegrity,
} from "../framework/runtime/workspace-mutations.mjs";
import { runWorkspaceTransaction } from "../framework/runtime/workspace-transactions.mjs";
import { doctorWorkspace } from "./doctor.mjs";
import { exists, readUtf8 } from "./lib/files.mjs";
import { linkedSourceIntegrity } from "./sources.mjs";

const RESULT_ROOT = ".silver/results/reconciliation";
const SAGA_ROOT = `${RESULT_ROOT}/sagas`;

function sagaPath(id) {
  return `${SAGA_ROOT}/${id}.json`;
}

async function readSaga(root, id) {
  try {
    return JSON.parse(await readFile(path.join(root, sagaPath(id)), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function persistSaga(mutator, saga) {
  saga.updated_at = new Date().toISOString();
  await mutator.write(sagaPath(saga.id), `${JSON.stringify(saga, null, 2)}\n`);
  return saga;
}

export async function listSynchronizationSagas(root = process.cwd()) {
  const workspace = path.resolve(root);
  let names;
  try { names = await readdir(path.join(workspace, SAGA_ROOT)); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const sagas = [];
  for (const name of names.filter((value) => value.endsWith(".json")).sort()) {
    const saga = JSON.parse(await readFile(path.join(workspace, SAGA_ROOT, name), "utf8"));
    sagas.push({
      id: saga.id,
      command: `silver sync apply ${saga.proposal.id}`,
      phase: saga.state,
      updated_at: saga.updated_at,
      recoverable: !["completed", "rolled-back"].includes(saga.state),
      kind: "synchronization-saga",
    });
  }
  return sagas;
}

function bindingPath(id) {
  return `design/integrations/${id}.yaml`;
}

function sourceRoot(workspace, source) {
  return path.isAbsolute(source.source.reference)
    ? source.source.reference
    : path.resolve(workspace, source.source.reference);
}

async function gitHead(root) {
  try {
    return (await runGit(root, ["rev-parse", "HEAD"])).stdout.trim();
  } catch {
    return null;
  }
}

async function loadRegistry(root) {
  const relativePath = "design/sources/sources.yaml";
  const content = await readUtf8(path.join(root, relativePath));
  const registry = parse(content);
  if (registry.schema === "silver/source-registry/v2") {
    await assertV2("source-registry-v2.schema.json", registry);
  } else if (registry.schema !== "silver/source-registry/v1") {
    throw new Error("Unsupported linked-source registry contract.");
  }
  return { relativePath, content, registry };
}

export function migrateRepresentationBindingV1(binding) {
  if (binding.schema !== "silver/representation-binding/v1") return binding;
  return {
    schema: "silver/representation-binding/v2",
    id: binding.id,
    artifact: binding.artifact,
    counterpart: {
      type: "provider",
      provider: binding.provider.id,
      object_id: binding.provider.object_id,
      revision: binding.provider.revision,
    },
    adapter: binding.adapter,
    authority: binding.authority === "external" ? "external-authoritative" : "workspace-authoritative",
    round_trip: binding.round_trip,
    sync_policy: binding.sync_policy,
    base: {
      state: "initialized",
      local: {
        state: "present",
        revision: binding.last_reconciled.portable_revision,
        integrity: binding.last_reconciled.portable_integrity,
      },
      external: {
        state: "present",
        revision: binding.last_reconciled.external_revision,
        integrity: binding.last_reconciled.snapshot_integrity,
      },
      at: binding.last_reconciled.at,
    },
  };
}

async function loadBinding(root, id) {
  const relativePath = bindingPath(id);
  const content = await readUtf8(path.join(root, relativePath));
  const original = parse(content);
  if (original.schema === "silver/representation-binding/v1") {
    throw new Error(
      "Live synchronization no longer accepts v1 representation bindings. Run silver migrate, then run silver sync inspect again.",
    );
  }
  const binding = original;
  await assertV2("representation-binding-v2.schema.json", binding);
  return { relativePath, content, binding };
}

function directionPermitted(binding, direction) {
  return binding.authority === "shared-review" ||
    (binding.authority === "workspace-authoritative" && direction === "local-to-external") ||
    (binding.authority === "external-authoritative" && direction === "external-to-local");
}

async function localIdentity(root, binding) {
  try {
    const content = await readFile(path.join(root, binding.artifact.path));
    return {
      state: "present",
      revision: binding.artifact.revision,
      integrity: workspaceContentIntegrity(content),
    };
  } catch (error) {
    if (error.code === "ENOENT") return { state: "missing" };
    throw error;
  }
}

async function bindingIds(root) {
  const directory = path.join(root, "design/integrations");
  if (!(await exists(directory))) return [];
  return (await readdir(directory))
    .filter((name) => name.endsWith(".yaml") && name !== "README.yaml")
    .map((name) => name.slice(0, -5))
    .sort();
}

async function repositoryInspection(root, binding, registry, direction) {
  if (binding.counterpart.type !== "linked-source") {
    return {
      adapter: binding.adapter,
      state: "unverified",
      local: binding.base.state === "initialized" ? { state: "present", ...binding.base.local } : { state: "missing" },
      external: binding.base.state === "initialized" ? { state: "present", ...binding.base.external } : { state: "missing" },
      operations: [],
      requiredChecks: [],
      blockers: ["Provider bindings require a fresh --capture before inspection."],
    };
  }
  const source = registry.sources.find(({ id }) => id === binding.counterpart.source_id);
  if (!source) throw new Error(`Binding ${binding.id} names missing linked source ${binding.counterpart.source_id}.`);
  const externalRoot = sourceRoot(root, source);
  const observedRevision = source.source.type === "git"
    ? await gitHead(externalRoot)
    : `snapshot-${(await linkedSourceIntegrity(externalRoot, source.source.paths)).slice(7, 19)}`;
  const inspection = await inspectRepositoryBinding({
    root,
    binding,
    source,
    direction,
    externalRevision: observedRevision ?? "unverified",
  });
  return { ...inspection, source, observedRevision };
}

export async function syncStatus({ root = process.cwd(), bindingId, all = false }) {
  const workspace = path.resolve(root);
  const { registry } = await loadRegistry(workspace);
  const ids = all ? await bindingIds(workspace) : [bindingId];
  if (!all && !bindingId) throw new Error("sync status requires a binding id or --all.");
  const bindings = [];
  for (const id of ids) {
    const { binding } = await loadBinding(workspace, id);
    const direction = binding.authority === "workspace-authoritative"
      ? "local-to-external"
      : "external-to-local";
    const inspection = await repositoryInspection(workspace, binding, registry, direction);
    bindings.push({
      id,
      counterpart: binding.counterpart.type,
      authority: binding.authority,
      sync_policy: binding.sync_policy,
      state: inspection.state,
      local: inspection.local,
      external: inspection.external,
      blockers: inspection.blockers ?? [],
    });
  }
  return { root: workspace, bindings };
}

function proposalIntegrity(proposal) {
  return workspaceContentIntegrity(`${JSON.stringify(proposal, null, 2)}\n`);
}

async function persistExternalSnapshot(mutator, {
  id,
  binding,
  counterpart,
  identity,
  capturedAt,
  adapter,
  payload,
  completeness = "complete",
  unresolved = [],
}) {
  if (identity.state !== "present") return null;
  const snapshot = {
    schema: "silver/external-snapshot/v2",
    id,
    binding_id: binding.id,
    counterpart,
    revision: identity.revision,
    integrity: identity.integrity,
    captured_at: capturedAt,
    adapter,
    completeness,
    payload,
    unresolved,
  };
  await assertV2("external-snapshot-v2.schema.json", snapshot);
  const snapshotPath = `${RESULT_ROOT}/snapshots/${snapshot.id}.json`;
  await mutator.write(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return { snapshot, snapshotPath };
}

export async function inspectSynchronization({
  root = process.cwd(),
  bindingId,
  direction,
  capture,
  now = new Date().toISOString(),
}) {
  const workspace = path.resolve(root);
  const mutator = await createWorkspaceMutator(workspace);
  const { registry } = await loadRegistry(workspace);
  const { binding, content: bindingContent } = await loadBinding(workspace, bindingId);
  if (!new Set(["external-to-local", "local-to-external"]).has(direction)) {
    throw new Error("sync inspect requires --direction external-to-local or local-to-external.");
  }
  if (binding.counterpart.type === "provider") {
    if (!capture) throw new Error("Provider synchronization requires --capture.");
    if (binding.adapter.id !== "silver-figma") {
      throw new Error(`No synchronization adapter is available for provider binding ${binding.id}.`);
    }
    const payload = capture.payload ?? capture;
    const snapshot = await normalizeFigmaSnapshot({ binding, payload, capturedAt: now });
    const local = await localIdentity(workspace, binding);
    const external = {
      state: "present",
      revision: snapshot.revision,
      integrity: valueIntegrity(snapshot),
    };
    const persistedSnapshot = await persistExternalSnapshot(mutator, {
      id: `${binding.id}-snapshot-${Date.now().toString(36)}`,
      binding,
      counterpart: `${binding.counterpart.provider}:${binding.counterpart.object_id}`,
      identity: external,
      capturedAt: now,
      adapter: binding.adapter,
      payload: snapshot,
      completeness: snapshot.unresolved?.length ? "partial" : "complete",
      unresolved: (snapshot.unresolved ?? []).map((entry) => ({
        path: entry.provider_path ?? entry.path ?? entry.id ?? "provider",
        reason: entry.reason ?? "The provider adapter could not normalize this entry.",
      })),
    });
    let operations;
    let adapterPayload;
    let requiredChecks = [];
    if (direction === "external-to-local") {
      let baseSnapshot = capture.base_snapshot;
      if (!baseSnapshot || !capture.targets) {
        throw new Error("Figma import capture requires base_snapshot and targets.");
      }
      const figmaProposal = await createFigmaChangeSet({
        binding,
        baseSnapshot,
        currentSnapshot: snapshot,
        targets: capture.targets,
        bindingIntegrity: workspaceContentIntegrity(bindingContent),
        createdAt: now,
      });
      operations = figmaProposal.operations;
      requiredChecks = figmaProposal.required_checks;
      adapterPayload = {
        ...figmaProposal.adapter_payload,
        current_snapshot: snapshot,
        external_snapshot_path: persistedSnapshot.snapshotPath,
      };
    } else {
      if (!Array.isArray(capture.changes) || capture.changes.length === 0) {
        throw new Error("Figma export capture requires a non-empty changes array.");
      }
      const providerOperation = await previewSemanticTokenWrite({
        binding,
        changes: capture.changes,
        snapshot,
        permission: "ask",
        createdAt: now,
      });
      const externalAction = providerOperation;
      operations = [{
        id: providerOperation.id,
        type: "update",
        classification: "semantic-style",
        mapping_fidelity: "semantic",
        source_path: binding.artifact.path,
        target_path: `figma:${binding.counterpart.object_id}`,
        source_identity: local,
        target_identity: external,
        required_approval: true,
        unresolved: [],
      }];
      adapterPayload = {
        provider_operation: externalAction,
        snapshot,
        external_snapshot_path: persistedSnapshot.snapshotPath,
      };
    }
    const proposal = {
      schema: "silver/change-set/v2",
      id: `${binding.id}-${direction}-${Date.now().toString(36)}`,
      binding_id: binding.id,
      direction,
      binding_integrity: workspaceContentIntegrity(bindingContent),
      base: binding.base,
      local,
      external,
      adapter: binding.adapter,
      created_at: now,
      operations,
      required_checks: requiredChecks,
      adapter_payload: adapterPayload,
    };
    await assertV2("change-set-v2.schema.json", proposal);
    const proposalPath = `${RESULT_ROOT}/change-sets/${proposal.id}.json`;
    await mutator.write(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
    const result = {
      schema: "silver/reconciliation-result/v2",
      id: `${proposal.id}-result`,
      binding_id: binding.id,
      direction,
      status: "awaiting-acceptance",
      state: binding.base.state === "uninitialized"
        ? "uninitialized"
        : external.integrity === binding.base.external.integrity
          ? "current"
          : "external-changed",
      proposal_path: proposalPath,
      proposal_integrity: proposalIntegrity(proposal),
      selected_operations: [],
      applied_operations: [],
      checks: [],
      external_action: null,
      transaction: null,
      binding_advancement: null,
      blockers: operations.flatMap(({ unresolved }) => unresolved),
      created_at: now,
      updated_at: now,
    };
    await persistResult(mutator, result);
    return { proposal, result };
  }
  const inspection = await repositoryInspection(workspace, binding, registry, direction);
  const persistedSnapshot = await persistExternalSnapshot(mutator, {
    id: `${binding.id}-snapshot-${Date.now().toString(36)}`,
    binding,
    counterpart: `${inspection.source.id}:${binding.counterpart.path}`,
    identity: inspection.external,
    capturedAt: now,
    adapter: { id: inspection.adapter.id, version: inspection.adapter.version },
    payload: {
      path: binding.counterpart.path,
      format: binding.counterpart.format,
      identity: inspection.external,
    },
    completeness: inspection.blockers?.length ? "partial" : "complete",
    unresolved: (inspection.blockers ?? []).map((reason) => ({
      path: binding.counterpart.path,
      reason,
    })),
  });
  const proposal = {
    schema: "silver/change-set/v2",
    id: `${binding.id}-${direction}-${Date.now().toString(36)}`,
    binding_id: binding.id,
    direction,
    binding_integrity: workspaceContentIntegrity(bindingContent),
    base: binding.base,
    local: inspection.local,
    external: inspection.external,
    adapter: { id: inspection.adapter.id, version: inspection.adapter.version },
    created_at: now,
    operations: inspection.operations,
    required_checks: inspection.requiredChecks,
    ...(persistedSnapshot ? { adapter_payload: { external_snapshot_path: persistedSnapshot.snapshotPath } } : {}),
  };
  await assertV2("change-set-v2.schema.json", proposal);
  const proposalPath = `${RESULT_ROOT}/change-sets/${proposal.id}.json`;
  await mutator.write(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
  const blockers = [
    ...(inspection.blockers ?? []),
    ...inspection.operations.flatMap(({ unresolved }) => unresolved),
  ];
  if (!directionPermitted(binding, direction)) {
    blockers.push(`The ${binding.authority} binding permits review in this direction but not automatic selection.`);
  }
  const result = {
    schema: "silver/reconciliation-result/v2",
    id: `${proposal.id}-result`,
    binding_id: binding.id,
    direction,
    status: blockers.length ? "blocked" : "awaiting-acceptance",
    state: inspection.state,
    proposal_path: proposalPath,
    proposal_integrity: proposalIntegrity(proposal),
    selected_operations: [],
    applied_operations: [],
    checks: [],
    external_action: null,
    transaction: null,
    binding_advancement: null,
    blockers,
    created_at: now,
    updated_at: now,
  };
  await assertV2("reconciliation-result-v2.schema.json", result);
  await mutator.write(`${RESULT_ROOT}/results/${result.id}.json`, `${JSON.stringify(result, null, 2)}\n`);
  return { proposal, result };
}

function nextRevision(revision) {
  const match = /^r([1-9][0-9]*)$/.exec(revision);
  return match ? `r${Number(match[1]) + 1}` : revision;
}

async function contextAdvancementOperations(root, selectedPaths, revision) {
  const directory = path.join(root, "design/contexts");
  if (!(await exists(directory))) return [];
  const operations = [];
  const referenceFields = [
    "brand",
    "design_system",
    "token_source",
    "component_catalog",
    "component_expression",
    "asset_catalog",
    "presentation_kit",
  ];
  for (const name of (await readdir(directory)).filter((item) => item.endsWith(".yaml")).sort()) {
    const relativePath = `design/contexts/${name}`;
    const content = await readUtf8(path.join(root, relativePath));
    const context = parse(content);
    if (context.schema !== "silver/design-context/v1") continue;
    let changed = false;
    for (const field of referenceFields) {
      if (context[field] && selectedPaths.has(context[field].path)) {
        context[field].revision = revision;
        changed = true;
      }
    }
    if (!changed) continue;
    context.revision = nextRevision(context.revision);
    await assertV2("design-context.schema.json", context);
    operations.push({
      id: `advance-context-${context.id}`,
      type: "write",
      path: relativePath,
      content: stringify(context),
      expectedIntegrity: workspaceContentIntegrity(content),
    });
  }
  return operations;
}

function runCommand(argv, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let forceTimer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-8000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8000); });
    child.on("error", (error) => {
      finish({ status: "not-run", reason: error.message, duration_ms: Date.now() - started });
    });
    child.on("close", (code) => {
      finish({
        status: timedOut ? "timeout" : code === 0 ? "pass" : "fail",
        exit_code: code,
        stdout,
        stderr,
        duration_ms: Date.now() - started,
      });
    });
  });
}

async function runChecks(sourceRootPath, checks) {
  const results = [];
  const aggregateStarted = Date.now();
  for (const check of checks) {
    const cwd = path.resolve(sourceRootPath, check.cwd);
    const prefix = `${path.resolve(sourceRootPath)}${path.sep}`;
    if (cwd !== path.resolve(sourceRootPath) && !cwd.startsWith(prefix)) {
      throw new Error(`Check ${check.id} working directory escapes the linked source.`);
    }
    const remaining = 30 * 60 * 1000 - (Date.now() - aggregateStarted);
    const timeoutMs = Math.min((check.timeout_seconds ?? 120) * 1000, 15 * 60 * 1000, remaining);
    const outcome = remaining <= 0
      ? { status: "not-run", reason: "The 30-minute aggregate source-check deadline was reached." }
      : await runCommand(check.argv, cwd, timeoutMs);
    const result = { id: check.id, required: check.required, ...outcome };
    results.push(result);
    if (check.required && result.status !== "pass") {
      const error = new Error(`Required source check ${check.id} ${result.status}.`);
      error.checks = results;
      throw error;
    }
  }
  return results;
}

async function persistResult(mutator, result) {
  await assertV2("reconciliation-result-v2.schema.json", result);
  await mutator.write(`${RESULT_ROOT}/results/${result.id}.json`, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export async function applySynchronization({
  root = process.cwd(),
  input,
  only,
  externalResult,
  capture,
  now = new Date().toISOString(),
  hooks = {},
}) {
  const workspace = path.resolve(root);
  const mutator = await createWorkspaceMutator(workspace);
  const proposal = input.proposal ?? input;
  await assertV2("change-set-v2.schema.json", proposal);
  if (!only?.length) throw new Error("sync apply requires --only with one or more operation ids.");
  const selectedIds = [...new Set(only)];
  const selected = proposal.operations.filter(({ id }) => selectedIds.includes(id));
  if (selected.length !== selectedIds.length) throw new Error("sync apply named an unknown operation id.");
  if (selected.some(({ type }) => ["finding", "no-op"].includes(type))) {
    throw new Error("Findings and no-op entries cannot be applied.");
  }
  if (selected.some(({ unresolved }) => unresolved.length)) {
    throw new Error("Unresolved or conflicting operations cannot be applied.");
  }
  const { content: bindingContent, binding } = await loadBinding(workspace, proposal.binding_id);
  if (!directionPermitted(binding, proposal.direction)) {
    throw new Error(`The ${binding.authority} binding cannot be applied in the ${proposal.direction} direction.`);
  }
  if (workspaceContentIntegrity(bindingContent) !== proposal.binding_integrity) {
    throw new Error("Representation binding changed after inspection.");
  }
  if (binding.counterpart.type === "provider") {
    const currentLocal = await localIdentity(workspace, binding);
    if (JSON.stringify(currentLocal) !== JSON.stringify(proposal.local)) {
      throw new Error("Synchronization proposal is stale; the local representation changed.");
    }
    const providerOperation = proposal.adapter_payload?.provider_operation;
    if (proposal.direction === "local-to-external" && (!externalResult || !capture)) {
      const pending = {
        schema: "silver/reconciliation-result/v2",
        id: `${proposal.id}-result`,
        binding_id: binding.id,
        direction: proposal.direction,
        status: "external-action-required",
        state: "local-changed",
        proposal_path: `${RESULT_ROOT}/change-sets/${proposal.id}.json`,
        proposal_integrity: proposalIntegrity(proposal),
        selected_operations: selectedIds,
        applied_operations: [],
        checks: [],
        external_action: providerOperation,
        transaction: null,
        binding_advancement: null,
        blockers: ["Perform the approved provider operation, then apply again with --external-result and a fresh --capture."],
        created_at: input.result?.created_at ?? now,
        updated_at: now,
      };
      return persistResult(mutator, pending);
    }
    const loaded = await loadBinding(workspace, proposal.binding_id);
    let fileOperations = [];
    let nextLocal = proposal.local;
    let nextExternal = proposal.external;
    if (proposal.direction === "external-to-local") {
      const prepared = await preparePortableReconciliation({
        root: workspace,
        changeSet: proposal,
        operationIds: selectedIds,
        approvals: selectedIds.map((id) => ({ operation_id: id, approved: true })),
      });
      fileOperations = prepared.files.map((file, index) => ({
        id: `figma-${index + 1}`,
        type: "write",
        path: file.path,
        content: file.content,
        expectedIntegrity: file.expectedIntegrity,
      }));
      const artifactFile = prepared.files.find(({ path: filePath }) => filePath === binding.artifact.path);
      if (artifactFile) {
        nextLocal = {
          state: "present",
          revision: nextRevision(binding.artifact.revision),
          integrity: workspaceContentIntegrity(artifactFile.content),
        };
      }
    } else {
      if (externalResult.status !== "applied") {
        throw new Error("Figma external result must record status applied.");
      }
      const postSnapshot = await normalizeFigmaSnapshot({
        binding: loaded.binding,
        payload: capture.payload ?? capture,
        capturedAt: now,
      });
      if (postSnapshot.revision === proposal.external.revision) {
        throw new Error("Fresh Figma capture did not advance the external revision.");
      }
      nextExternal = {
        state: "present",
        revision: postSnapshot.revision,
        integrity: valueIntegrity(postSnapshot),
      };
    }
    const nextBinding = {
      ...binding,
      artifact: {
        ...binding.artifact,
        revision: nextLocal.state === "present" ? nextLocal.revision : binding.artifact.revision,
      },
      counterpart: {
        ...binding.counterpart,
        revision: nextExternal.state === "present" ? nextExternal.revision : binding.counterpart.revision,
      },
      base: { state: "initialized", local: nextLocal, external: nextExternal, at: now },
    };
    const contextOperations = proposal.direction === "external-to-local"
      ? await contextAdvancementOperations(
          workspace,
          new Set(fileOperations.map(({ path: filePath }) => filePath)),
          nextBinding.artifact.revision,
        )
      : [];
    const transaction = await runWorkspaceTransaction({
      root: workspace,
      command: `silver sync apply ${proposal.id}`,
      operations: [
        ...fileOperations,
        ...contextOperations,
        {
          id: "advance-binding",
          type: "write",
          path: bindingPath(binding.id),
          content: stringify(nextBinding),
          expectedIntegrity: proposal.binding_integrity,
        },
      ],
      metadata: { workflow: "sync", provider: binding.counterpart.provider, proposal: proposal.id },
      validate: async () => ({ status: "pass", check: "provider-reconciliation" }),
    });
    const applied = {
      schema: "silver/reconciliation-result/v2",
      id: `${proposal.id}-result`,
      binding_id: binding.id,
      direction: proposal.direction,
      status: "applied",
      state: "current",
      proposal_path: `${RESULT_ROOT}/change-sets/${proposal.id}.json`,
      proposal_integrity: proposalIntegrity(proposal),
      selected_operations: selectedIds,
      applied_operations: selectedIds,
      checks: [],
      external_action: externalResult ?? null,
      transaction,
      binding_advancement: {
        revision: nextBinding.artifact.revision,
        base: nextBinding.base,
        contexts: contextOperations.map(({ path: contextPath }) => contextPath),
      },
      blockers: [],
      created_at: input.result?.created_at ?? now,
      updated_at: now,
    };
    return persistResult(mutator, applied);
  }
  const { content: registryContent, registry, relativePath: registryPath } = await loadRegistry(workspace);
  let saga = await readSaga(workspace, proposal.id);
  if (saga && JSON.stringify(saga.selected_operations) !== JSON.stringify(selectedIds)) {
    throw new Error("Synchronization recovery selection differs from the recorded saga.");
  }
  const inspection = await repositoryInspection(workspace, binding, registry, proposal.direction);
  const continuingSaga = saga && !["completed", "rolled-back"].includes(saga.state);
  if (
    JSON.stringify(inspection.local) !== JSON.stringify(proposal.local) ||
    (!continuingSaga && JSON.stringify(inspection.external) !== JSON.stringify(proposal.external))
  ) {
    throw new Error("Synchronization proposal is stale; inspect again.");
  }
  const source = inspection.source;
  const externalRoot = inspection.externalRoot;
  const externalMutator = await createWorkspaceMutator(externalRoot);
  let checks = [];
  let externalCommit = saga?.external_commit ?? null;
  let externalPreimages = (saga?.preimages ?? []).map((preimage) => ({
    path: preimage.path,
    content: preimage.content === null ? null : Buffer.from(preimage.content, "base64"),
  }));
  if (proposal.direction === "local-to-external") {
    if (source.source.type === "git" && !continuingSaga) {
      const head = await gitHead(externalRoot);
      if (head !== source.source.revision) throw new Error("Linked Git source is not at its reviewed commit.");
      for (const operation of selected) {
        const externalPath = operation.target_path.slice(source.id.length + 1);
        const status = await runGit(externalRoot, ["status", "--porcelain", "--", externalPath]);
        if (status.stdout.trim()) throw new Error(`Selected external path is dirty: ${externalPath}`);
      }
      const branch = source.writeback?.branch;
      let branchExists = true;
      try {
        await runGit(externalRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
      } catch {
        branchExists = false;
      }
      await runGit(externalRoot, branchExists ? ["checkout", branch] : ["checkout", "-b", branch]);
    }
    try {
      if (!saga) {
        for (const operation of selected) {
          const externalPath = operation.target_path.slice(source.id.length + 1);
          let previous = null;
          try { previous = await readFile(externalMutator.absolute(externalPath)); }
          catch (error) { if (error.code !== "ENOENT") throw error; }
          externalPreimages.push({ path: externalPath, content: previous });
        }
        saga = {
          schema: "silver/synchronization-saga/v1",
          id: proposal.id,
          state: "prepared",
          source_id: source.id,
          source_type: source.source.type,
          external_root: externalMutator.root,
          proposal,
          selected_operations: selectedIds,
          preimages: externalPreimages.map((preimage) => ({
            path: preimage.path,
            content: preimage.content === null ? null : preimage.content.toString("base64"),
          })),
          checks: [],
          external_commit: null,
          created_at: now,
          updated_at: now,
        };
        await persistSaga(mutator, saga);
      }
      if (saga.state === "prepared") {
        for (const operation of selected) {
          const externalPath = operation.target_path.slice(source.id.length + 1);
          if (operation.type === "delete") await externalMutator.remove(externalPath);
          else await externalMutator.write(externalPath, operation.content);
        }
        saga.state = "external-written";
        await persistSaga(mutator, saga);
        await hooks.afterExternalWrite?.({ saga, source, selected });
      }
      if (saga.state === "external-written") {
        checks = await runChecks(externalRoot, proposal.required_checks);
        saga.checks = checks;
        saga.state = "checks-passed";
        await persistSaga(mutator, saga);
      } else {
        checks = saga.checks ?? [];
      }
      if (source.source.type === "git" && saga.state === "checks-passed") {
        const paths = selected.map((operation) => operation.target_path.slice(source.id.length + 1));
        const currentHead = await gitHead(externalRoot);
        const status = await runGit(externalRoot, ["status", "--porcelain", "--", ...paths]);
        if (currentHead !== source.source.revision && !status.stdout.trim()) {
          const subject = (await runGit(externalRoot, ["log", "-1", "--pretty=%s"])).stdout.trim();
          if (subject !== `silver: synchronize ${binding.id}`) {
            throw new Error("External Git history advanced outside the recorded synchronization saga.");
          }
          externalCommit = currentHead;
        } else {
          await runGit(externalRoot, ["add", "--", ...paths]);
          await runGit(externalRoot, ["commit", "-m", `silver: synchronize ${binding.id}`, "--", ...paths]);
          externalCommit = await gitHead(externalRoot);
        }
        saga.external_commit = externalCommit;
        saga.state = "external-committed";
        await persistSaga(mutator, saga);
        await hooks.afterExternalCommit?.({ saga, source, selected });
      }
    } catch (error) {
      if (!externalCommit) {
        for (const preimage of externalPreimages.reverse()) {
          if (preimage.content === null) await externalMutator.remove(preimage.path).catch(() => {});
          else await externalMutator.write(preimage.path, preimage.content);
        }
        if (saga) {
          saga.state = "rolled-back";
          saga.error = error.message;
          await persistSaga(mutator, saga).catch(() => {});
        }
      }
      throw error;
    }
  }

  const appliedContent = selected.find(({ content }) => typeof content === "string")?.content;
  const nextArtifactRevision = nextRevision(binding.artifact.revision);
  const finalLocal = proposal.direction === "external-to-local"
    ? selected.length === 1 && selected[0].type === "delete"
      ? { state: "missing" }
      : { state: "present", revision: nextArtifactRevision, integrity: workspaceContentIntegrity(appliedContent ?? "") }
    : inspection.local;
  const observedIntegrity = await linkedSourceIntegrity(externalRoot, source.source.paths);
  const observedRevision = source.source.type === "git"
    ? externalCommit ?? await gitHead(externalRoot)
    : `snapshot-${observedIntegrity.slice(7, 19)}`;
  const finalExternal = selected.length === 1 && selected[0].type === "delete"
    ? { state: "missing" }
    : {
        state: "present",
        revision: observedRevision,
        integrity: selected.length === 1
          ? workspaceContentIntegrity(selected[0].content ?? appliedContent ?? "")
          : observedIntegrity,
      };
  const nextBinding = {
    ...binding,
    artifact: {
      ...binding.artifact,
      revision: proposal.direction === "external-to-local" ? nextArtifactRevision : binding.artifact.revision,
    },
    base: {
      state: "initialized",
      local: finalLocal,
      external: finalExternal,
      at: now,
    },
  };
  const nextRegistry = structuredClone(registry);
  const sourceIndex = nextRegistry.sources.findIndex(({ id }) => id === source.id);
  nextRegistry.sources[sourceIndex] = {
    ...source,
    source: { ...source.source, revision: observedRevision, integrity: observedIntegrity },
  };
  const operations = [];
  let convertedLinkedSystem = false;
  if (proposal.direction === "external-to-local") {
    const systemPath = path.join(workspace, "design/system");
    let linkedSystem = false;
    try { linkedSystem = (await lstat(systemPath)).isSymbolicLink(); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const touchesSystem = selected.some(({ target_path: targetPath }) =>
      targetPath === "design/system" || targetPath.startsWith("design/system/"));
    if (linkedSystem && touchesSystem) {
      const linkedTarget = await realpath(systemPath);
      if (linkedTarget !== externalMutator.root && !linkedTarget.startsWith(`${externalMutator.root}${path.sep}`)) {
        throw new Error("The reviewed linked source does not own the design/system symlink target.");
      }
      const conversionRelative = `${RESULT_ROOT}/conversions/${proposal.id}`;
      await mutator.remove(conversionRelative, { recursive: true }).catch(() => {});
      await mutator.copyTree(linkedTarget, conversionRelative);
      for (const operation of selected) {
        if (!operation.target_path.startsWith("design/system/")) {
          throw new Error("A linked design/system conversion cannot mix targets outside the primary system.");
        }
        const nested = operation.target_path.slice("design/system/".length);
        const stagedPath = `${conversionRelative}/${nested}`;
        if (operation.type === "delete") await mutator.remove(stagedPath);
        else await mutator.write(stagedPath, operation.content);
      }
      operations.push({
        id: "convert-linked-design-system",
        type: "convert-tree",
        path: "design/system",
        sourcePath: mutator.absolute(conversionRelative),
      });
      convertedLinkedSystem = true;
    } else {
      for (const operation of selected) {
        const localPath = operation.target_path;
        operations.push(operation.type === "delete"
          ? { id: operation.id, type: "delete", path: localPath, ...(operation.target_identity.integrity ? { expectedIntegrity: operation.target_identity.integrity } : {}) }
          : { id: operation.id, type: "write", path: localPath, content: operation.content, ...(operation.target_identity.integrity ? { expectedIntegrity: operation.target_identity.integrity } : {}) });
      }
    }
  }
  const contextOperations = proposal.direction === "external-to-local"
    ? await contextAdvancementOperations(
        workspace,
        new Set(selected.map(({ target_path: targetPath }) => targetPath)),
        nextArtifactRevision,
      )
    : [];
  operations.push(
    ...contextOperations,
    { id: "advance-binding", type: "write", path: bindingPath(binding.id), content: stringify(nextBinding), expectedIntegrity: proposal.binding_integrity },
    { id: "advance-source", type: "write", path: registryPath, content: stringify(nextRegistry), expectedIntegrity: workspaceContentIntegrity(registryContent) },
  );
  let transaction;
  try {
    await hooks.beforeWorkspaceTransaction?.({ saga, source, selected });
    transaction = await runWorkspaceTransaction({
      root: workspace,
      command: `silver sync apply ${proposal.id}`,
      operations,
      metadata: {
        workflow: "sync",
        proposal: proposal.id,
        external_commit: externalCommit,
        converted_linked_design_system: convertedLinkedSystem,
      },
      validate: async ({ journal }) => {
        const diagnosis = await doctorWorkspace({ root: workspace, ignoreTransactionId: journal.id });
        return { status: diagnosis.ok ? "pass" : "fail", check: "doctor", diagnostics: diagnosis.diagnostics };
      },
    });
  } catch (error) {
    if (
      saga &&
      proposal.direction === "local-to-external" &&
      source.source.type !== "git"
    ) {
      for (const preimage of [...externalPreimages].reverse()) {
        if (preimage.content === null) await externalMutator.remove(preimage.path).catch(() => {});
        else await externalMutator.write(preimage.path, preimage.content);
      }
      saga.state = "rolled-back";
      saga.error = error.message;
      await persistSaga(mutator, saga);
    }
    throw error;
  }
  if (saga) {
    saga.state = "completed";
    saga.workspace_transaction = transaction.transaction_id;
    await persistSaga(mutator, saga);
  }
  const result = {
    schema: "silver/reconciliation-result/v2",
    id: `${proposal.id}-result`,
    binding_id: binding.id,
    direction: proposal.direction,
    status: "applied",
    state: "current",
    proposal_path: `${RESULT_ROOT}/change-sets/${proposal.id}.json`,
    proposal_integrity: proposalIntegrity(proposal),
    selected_operations: selectedIds,
    applied_operations: selectedIds,
    checks,
    external_action: externalResult ?? null,
    transaction,
    binding_advancement: {
      revision: nextBinding.artifact.revision,
      base: nextBinding.base,
      contexts: contextOperations.map(({ path: contextPath }) => contextPath),
    },
    blockers: [],
    created_at: input.result?.created_at ?? now,
    updated_at: now,
  };
  return persistResult(mutator, result);
}

export async function resumeSynchronizationSaga({ root = process.cwd(), id }) {
  const workspace = path.resolve(root);
  const saga = await readSaga(workspace, id);
  if (!saga) throw new Error(`No synchronization saga named ${id}.`);
  if (["completed", "rolled-back"].includes(saga.state)) {
    throw new Error(`Synchronization saga ${id} is already ${saga.state}.`);
  }
  return applySynchronization({
    root: workspace,
    input: saga.proposal,
    only: saga.selected_operations,
  });
}

export async function rollbackSynchronizationSaga({ root = process.cwd(), id }) {
  const workspace = path.resolve(root);
  const mutator = await createWorkspaceMutator(workspace);
  const saga = await readSaga(workspace, id);
  if (!saga) throw new Error(`No synchronization saga named ${id}.`);
  if (saga.external_commit) {
    throw new Error("A committed external Git saga can only resume forward; rollback never rewrites Git history.");
  }
  const externalMutator = await createWorkspaceMutator(saga.external_root);
  for (const preimage of [...saga.preimages].reverse()) {
    if (preimage.content === null) await externalMutator.remove(preimage.path).catch(() => {});
    else await externalMutator.write(preimage.path, Buffer.from(preimage.content, "base64"));
  }
  saga.state = "rolled-back";
  await persistSaga(mutator, saga);
  return { transaction_id: id, status: "rolled-back", kind: "synchronization-saga" };
}
