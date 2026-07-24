function clone(value) {
  return structuredClone(value);
}

function nodeMap(playbook) {
  return new Map(playbook.nodes.map((node) => [node.id, node]));
}

function stateMap(state) {
  return new Map(state.node_states.map((node) => [node.node, node]));
}

function forwardEdges(playbook, nodeId) {
  return playbook.edges.filter(
    (edge) =>
      edge.from === nodeId &&
      ["handoff", "branch"].includes(edge.type),
  );
}

function requiredIncoming(playbook, nodeId) {
  return playbook.edges.filter(
    (edge) =>
      edge.to === nodeId &&
      edge.required &&
      ["handoff", "branch"].includes(edge.type),
  );
}

function incomingEdges(playbook, nodeId) {
  return playbook.edges.filter(
    (edge) =>
      edge.to === nodeId &&
      ["handoff", "branch"].includes(edge.type),
  );
}

function conditionMatches(condition, options) {
  if (!condition) {
    return true;
  }
  if (condition.type === "invocation-option") {
    return options[condition.key] === condition.equals;
  }
  return true;
}

function descendants(playbook, start) {
  const seen = new Set();
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const edge of forwardEdges(playbook, current)) {
      queue.push(edge.to);
    }
  }
  return [...seen];
}

function bump(state, now, event, detail) {
  state.revision += 1;
  state.updated_at = now;
  state.history.push({ at: now, event, detail });
}

function hasPendingCheckpoint(state) {
  return state.checkpoints.some(({ status }) => status === "pending");
}

function markRunnable(playbook, state) {
  if (hasPendingCheckpoint(state)) {
    state.current_nodes = [];
    state.status = "paused";
    return;
  }
  const states = stateMap(state);
  for (const node of playbook.nodes) {
    const observed = states.get(node.id);
    if (observed.status !== "pending") {
      continue;
    }
    const incoming = incomingEdges(playbook, node.id);
    if (
      !playbook.entry_nodes.includes(node.id) &&
      (incoming.length === 0 ||
        !incoming.some(
          (edge) => states.get(edge.from)?.status === "completed",
        ))
    ) {
      continue;
    }
    if (!conditionMatches(node.when, state.options)) {
      observed.status = "skipped";
      continue;
    }
    const required = requiredIncoming(playbook, node.id);
    if (
      required.every(
        (edge) => states.get(edge.from)?.status === "completed",
      )
    ) {
      if (node.checkpoint?.timing === "before") {
        state.checkpoints.push({
          id: node.checkpoint.id,
          node: node.id,
          type: node.checkpoint.type,
          status: "pending",
          prompt: node.checkpoint.prompt,
        });
        observed.status = "paused";
        state.status = "paused";
      } else {
        observed.status = "ready";
      }
    }
  }
  state.current_nodes = state.node_states
    .filter(({ status }) => status === "ready")
    .map(({ node }) => node);
  if (state.current_nodes.length > 0) {
    state.status = "running";
  }
}

export function assertPlaybookGraph(playbook) {
  const nodes = nodeMap(playbook);
  if (nodes.size !== playbook.nodes.length) {
    throw new Error("Playbook node ids must be unique.");
  }
  for (const entry of playbook.entry_nodes) {
    if (!nodes.has(entry)) {
      throw new Error(`Unknown entry node: ${entry}`);
    }
  }
  const edgeIds = new Set();
  for (const edge of playbook.edges) {
    if (edgeIds.has(edge.id)) {
      throw new Error(`Duplicate edge id: ${edge.id}`);
    }
    edgeIds.add(edge.id);
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      throw new Error(`Edge ${edge.id} references an unknown node.`);
    }
    if (
      ["feedback", "retry"].includes(edge.type) &&
      !edge.max_traversals
    ) {
      throw new Error(
        `Feedback or retry edge ${edge.id} requires max_traversals.`,
      );
    }
  }
  return playbook;
}

export function createPlaybookState({
  playbook,
  runId,
  inputs,
  options = {},
  now,
}) {
  assertPlaybookGraph(playbook);
  const state = {
    schema: "silver/playbook-state/v2",
    run_id: runId,
    playbook: {
      id: playbook.id,
      version: playbook.version,
    },
    revision: 1,
    status: "running",
    created_at: now,
    updated_at: now,
    inputs: clone(inputs),
    options: clone(options),
    current_nodes: [...playbook.entry_nodes],
    node_states: playbook.nodes.map((node) => ({
      node: node.id,
      status: playbook.entry_nodes.includes(node.id)
        ? node.checkpoint?.timing === "before"
          ? "paused"
          : "ready"
        : "pending",
      inputs: [],
      outputs: [],
    })),
    checkpoints: [],
    invalidations: [],
    history: [
      {
        at: now,
        event: "playbook-created",
        detail: `Created ${playbook.id}@${playbook.version}.`,
      },
    ],
  };
  for (const node of playbook.nodes.filter(
    ({ id }) => playbook.entry_nodes.includes(id),
  )) {
    if (node.checkpoint?.timing === "before") {
      state.checkpoints.push({
        id: node.checkpoint.id,
        node: node.id,
        type: node.checkpoint.type,
        status: "pending",
        prompt: node.checkpoint.prompt,
      });
      state.current_nodes = state.current_nodes.filter(
        (id) => id !== node.id,
      );
      state.status = "paused";
    }
  }
  return state;
}

export function recordNodeResult({
  playbook,
  state: original,
  nodeId,
  result,
  now,
}) {
  const state = clone(original);
  if (
    state.playbook.id !== playbook.id ||
    state.playbook.version !== playbook.version
  ) {
    throw new Error("Playbook state does not match the supplied playbook.");
  }
  const node = nodeMap(playbook).get(nodeId);
  if (!node) {
    throw new Error(`Unknown playbook node: ${nodeId}`);
  }
  if (
    result.skill.id !== node.skill.id ||
    result.skill.version !== node.skill.version
  ) {
    throw new Error(`Result does not match pinned skill for node ${nodeId}.`);
  }
  const observed = stateMap(state).get(nodeId);
  if (!["ready", "running"].includes(observed.status)) {
    throw new Error(
      `Node ${nodeId} is ${observed.status}, not ready to record.`,
    );
  }
  observed.invocation_id = result.invocation_id;
  observed.inputs = clone(result.inputs);
  observed.outputs = clone(result.outputs);
  observed.status = ["complete", "complete-with-findings"].includes(
    result.execution.status,
  )
    ? "completed"
    : "blocked";
  state.current_nodes = state.current_nodes.filter((id) => id !== nodeId);

  if (observed.status === "completed" && node.checkpoint?.timing === "after") {
    state.checkpoints.push({
      id: node.checkpoint.id,
      node: node.id,
      type: node.checkpoint.type,
      status: "pending",
      prompt: node.checkpoint.prompt,
    });
    state.status = "paused";
  } else if (observed.status === "blocked") {
    state.status = "blocked";
  }

  if (state.status !== "blocked") {
    markRunnable(playbook, state);
  }
  bump(
    state,
    now,
    "node-result-recorded",
    `Recorded ${result.invocation_id} for ${nodeId} as ${observed.status}.`,
  );
  return state;
}

export function resolveCheckpoint({
  playbook,
  state: original,
  checkpointId,
  accepted,
  resolution,
  now,
}) {
  const state = clone(original);
  const checkpoint = state.checkpoints.find(
    ({ id, status }) => id === checkpointId && status === "pending",
  );
  if (!checkpoint) {
    throw new Error(`No pending checkpoint: ${checkpointId}`);
  }
  checkpoint.status = accepted ? "accepted" : "rejected";
  checkpoint.resolved_at = now;
  checkpoint.resolution = resolution;
  const observed = stateMap(state).get(checkpoint.node);
  if (accepted && observed.status === "paused") {
    observed.status =
      nodeMap(playbook).get(checkpoint.node).checkpoint.timing === "before"
        ? "ready"
        : observed.status;
  }
  if (!accepted) {
    state.status = "stopped";
    state.current_nodes = [];
  } else {
    state.status = "running";
    markRunnable(playbook, state);
  }
  bump(
    state,
    now,
    "checkpoint-resolved",
    `${checkpointId} was ${checkpoint.status}.`,
  );
  return state;
}

export function resumePlaybook({
  playbook,
  state: original,
  currentArtifacts,
  now,
}) {
  const state = clone(original);
  if (
    state.playbook.id !== playbook.id ||
    state.playbook.version !== playbook.version
  ) {
    throw new Error("A compatible playbook version is required to resume.");
  }
  const current = new Map(
    currentArtifacts.map((artifact) => [artifact.id, artifact]),
  );
  const states = stateMap(state);
  for (const observed of state.node_states) {
    if (observed.status !== "completed") {
      continue;
    }
    for (const reference of [...observed.inputs, ...observed.outputs]) {
      const actual = current.get(reference.id);
      if (!actual || actual.revision === reference.revision) {
        continue;
      }
      const invalidationId =
        `changed-${reference.id}-${reference.revision}-to-${actual.revision}`;
      if (
        state.invalidations.some(
          (invalidation) => invalidation.id === invalidationId,
        )
      ) {
        continue;
      }
      const affected = descendants(playbook, observed.node);
      for (const nodeId of affected) {
        const affectedState = states.get(nodeId);
        if (
          affectedState &&
          !["pending", "skipped"].includes(affectedState.status)
        ) {
          affectedState.status = "stale";
        }
      }
      state.invalidations.push({
        id: invalidationId,
        artifact_id: reference.id,
        recorded_revision: reference.revision,
        observed_revision: actual.revision,
        affected_nodes: affected,
        detected_at: now,
        status: "unresolved",
      });
      state.checkpoints.push({
        id: `reconcile-${reference.id}`,
        node: observed.node,
        type: "reconciliation",
        status: "pending",
        prompt:
          `Reconcile ${reference.id} ${reference.revision} with ${actual.revision}; downstream artifacts were not rewritten.`,
      });
    }
  }
  if (state.invalidations.some(({ status }) => status === "unresolved")) {
    state.status = "paused";
    state.current_nodes = [];
  } else {
    markRunnable(playbook, state);
  }
  bump(
    state,
    now,
    "playbook-resumed",
    state.status === "paused"
      ? "Resume detected revision changes and paused for reconciliation."
      : "Resume found no unresolved revision changes.",
  );
  return state;
}
