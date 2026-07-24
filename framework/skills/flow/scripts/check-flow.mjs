#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArguments, workspaceRelative } from "./flow-lib.mjs";

function finding(rule, message, file, observedValue) {
  return {
    schema: "design-practice/finding/v1",
    checker: "flow-structure",
    rule,
    severity: "error",
    policy_profile: "conforming",
    ...(file ? { file } : {}),
    message,
    ...(observedValue === undefined
      ? {}
      : { observed_value: observedValue }),
    status: "fail",
  };
}

function duplicates(values) {
  const seen = new Set();
  return [...new Set(values.filter((value) => seen.has(value) || !seen.add(value)))];
}

export function checkFlowStructure(flow, options = {}) {
  const file = options.file;
  const findings = [];
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  const actors = Array.isArray(flow.actors) ? flow.actors : [];
  const transitions = Array.isArray(flow.transitions) ? flow.transitions : [];
  const nodeIds = nodes.map(({ id }) => id);
  const actorIds = actors.map(({ id }) => id);
  const transitionIds = transitions.map(({ id }) => id);
  const nodeSet = new Set(nodeIds);
  const actorSet = new Set(actorIds);

  for (const [label, values] of [
    ["node", nodeIds],
    ["actor", actorIds],
    ["transition", transitionIds],
  ]) {
    for (const duplicate of duplicates(values)) {
      findings.push(
        finding(
          `flow.duplicate-${label}`,
          `Duplicate ${label} id "${duplicate}".`,
          file,
          duplicate,
        ),
      );
    }
  }

  const starts = Array.isArray(flow.start_nodes) ? flow.start_nodes : [];
  for (const start of starts) {
    if (!nodeSet.has(start)) {
      findings.push(
        finding(
          "flow.missing-start-node",
          `Start node "${start}" does not exist.`,
          file,
          start,
        ),
      );
    }
  }

  for (const node of nodes) {
    if (node.actor && !actorSet.has(node.actor)) {
      findings.push(
        finding(
          "flow.missing-actor",
          `Node "${node.id}" references unknown actor "${node.actor}".`,
          file,
          node.actor,
        ),
      );
    }
  }

  const outgoing = new Map(nodeIds.map((id) => [id, []]));
  for (const transition of transitions) {
    if (!nodeSet.has(transition.from)) {
      findings.push(
        finding(
          "flow.missing-transition-source",
          `Transition "${transition.id}" starts at unknown node "${transition.from}".`,
          file,
          transition.from,
        ),
      );
    }
    if (!nodeSet.has(transition.to)) {
      findings.push(
        finding(
          "flow.missing-transition-target",
          `Transition "${transition.id}" ends at unknown node "${transition.to}".`,
          file,
          transition.to,
        ),
      );
    }
    if (transition.actor && !actorSet.has(transition.actor)) {
      findings.push(
        finding(
          "flow.missing-actor",
          `Transition "${transition.id}" references unknown actor "${transition.actor}".`,
          file,
          transition.actor,
        ),
      );
    }
    if (outgoing.has(transition.from) && nodeSet.has(transition.to)) {
      outgoing.get(transition.from).push(transition.to);
    }
  }

  const reachable = new Set(starts.filter((id) => nodeSet.has(id)));
  const queue = [...reachable];
  while (queue.length > 0) {
    for (const target of outgoing.get(queue.shift()) ?? []) {
      if (!reachable.has(target)) {
        reachable.add(target);
        queue.push(target);
      }
    }
  }
  for (const node of nodes) {
    if (!reachable.has(node.id)) {
      findings.push(
        finding(
          "flow.unreachable-node",
          `Node "${node.id}" cannot be reached from a start node.`,
          file,
          node.id,
        ),
      );
    }
    const nodeOutgoing = outgoing.get(node.id) ?? [];
    if (node.type === "outcome" && nodeOutgoing.length > 0) {
      findings.push(
        finding(
          "flow.outcome-has-transition",
          `Outcome node "${node.id}" must not have outgoing transitions.`,
          file,
          node.id,
        ),
      );
    }
    if (node.type === "decision" && nodeOutgoing.length < 2) {
      findings.push(
        finding(
          "flow.incomplete-decision",
          `Decision node "${node.id}" needs at least two outgoing transitions.`,
          file,
          node.id,
        ),
      );
    }
  }

  if (!nodes.some(({ type }) => type === "outcome")) {
    findings.push(
      finding(
        "flow.missing-outcome",
        "The flow has no terminal outcome node.",
        file,
      ),
    );
  }

  return findings;
}

export function checkResult(flow, findings, file) {
  const policyProfile = flow.scope === "prototype" ? "prototype" : "conforming";
  const normalized = findings.map((item) => ({
    ...item,
    policy_profile: policyProfile,
  }));
  return {
    schema: "design-practice/check-result/v1",
    checker: "flow-structure",
    suite: "fast",
    policy_profile: policyProfile,
    status: normalized.length > 0 ? "fail" : "pass",
    coverage: {
      requested: [file],
      completed: [file],
    },
    findings: normalized,
  };
}

async function main() {
  const root = process.cwd();
  let file;
  try {
    if (process.argv.slice(2).includes("--help")) {
      console.log("Usage: check-flow.mjs <flow.json>");
      return;
    }
    const options = parseArguments(process.argv.slice(2));
    if (options.positional.length !== 1 || Object.keys(options).length !== 1) {
      throw new Error("Provide exactly one flow.json path.");
    }
    const absolute = path.resolve(options.positional[0]);
    file = workspaceRelative(root, absolute) ?? options.positional[0];
    const flow = JSON.parse(await readFile(absolute, "utf8"));
    const result = checkResult(
      flow,
      checkFlowStructure(flow, { file }),
      file,
    );
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "fail") {
      process.exitCode = 1;
    }
  } catch (error) {
    const target = file ?? "flow.json";
    console.log(
      JSON.stringify(
        checkResult(
          { scope: "product" },
          [finding("flow.unreadable", error.message, target)],
          target,
        ),
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
) {
  await main();
}
