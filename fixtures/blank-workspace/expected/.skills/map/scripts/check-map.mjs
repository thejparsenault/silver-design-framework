import { readFile } from "node:fs/promises";
import path from "node:path";

const requiredLanes = {
  journey: ["actor-action", "touchpoint"],
  "service-blueprint": ["actor-action", "frontstage", "backstage", "support", "system"],
};

export async function checkMap({ root = process.cwd(), map }) {
  const workspace = path.resolve(root);
  const file = path.resolve(workspace, map);
  if (!file.startsWith(`${workspace}${path.sep}`)) throw new Error("Map path escapes workspace.");
  const value = JSON.parse(await readFile(file, "utf8"));
  const findings = [];
  if (
    value?.schema !== "silver/map/v1" ||
    value.kind !== "map" ||
    !/^r[1-9][0-9]*$/.test(value.revision ?? "") ||
    !Array.isArray(value.actors) ||
    !Array.isArray(value.stages) ||
    !Array.isArray(value.lanes) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.connections) ||
    !Array.isArray(value.design_contexts) ||
    !value.provenance
  ) {
    return {
      schema: "silver/map-check/v1",
      status: "fail",
      findings: ["Map does not satisfy the portable v1 structural contract."],
    };
  }
  const stages = new Set(value.stages.map(({ id }) => id));
  const lanes = new Map(value.lanes.map((lane) => [lane.id, lane]));
  const items = new Set(value.items.map(({ id }) => id));
  const actors = new Set(value.actors.map(({ id }) => id));
  for (const kind of requiredLanes[value.map_type] ?? []) {
    if (![...lanes.values()].some((lane) => lane.kind === kind)) {
      findings.push(`Map type ${value.map_type} requires a ${kind} lane.`);
    }
  }
  for (const item of value.items) {
    if (!stages.has(item.stage)) findings.push(`Item ${item.id} references missing stage ${item.stage}.`);
    if (!lanes.has(item.lane)) findings.push(`Item ${item.id} references missing lane ${item.lane}.`);
    if (item.actor && !actors.has(item.actor)) {
      findings.push(`Item ${item.id} references missing actor ${item.actor}.`);
    }
    if (
      value.map_type === "journey" &&
      lanes.get(item.lane)?.kind === "actor-action" &&
      !item.actor
    ) {
      findings.push(`Journey action ${item.id} must reference an actor.`);
    }
    if (!item.assumption && item.evidence.length === 0) {
      findings.push(`Item ${item.id} must cite evidence or be labeled as an assumption.`);
    }
  }
  for (const connection of value.connections) {
    if (!items.has(connection.from) || !items.has(connection.to)) {
      findings.push(`Connection ${connection.from} → ${connection.to} references a missing item.`);
    }
  }
  if (!value.design_contexts.some(({ id }) => id === value.primary_context)) {
    findings.push("primary_context must reference one of design_contexts.");
  }
  return { schema: "silver/map-check/v1", status: findings.length ? "fail" : "pass", findings };
}
