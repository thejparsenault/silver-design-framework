import { readFile } from "node:fs/promises";
import path from "node:path";

export async function checkStructure({ root = process.cwd(), structure }) {
  const workspace = path.resolve(root);
  const file = path.resolve(workspace, structure);
  if (!file.startsWith(`${workspace}${path.sep}`)) throw new Error("Structure path escapes workspace.");
  const value = JSON.parse(await readFile(file, "utf8"));
  const findings = [];
  if (
    value?.schema !== "silver/structure/v1" ||
    value.kind !== "structure" ||
    !/^r[1-9][0-9]*$/.test(value.revision ?? "") ||
    !Array.isArray(value.entities) ||
    !Array.isArray(value.relationships) ||
    !Array.isArray(value.design_contexts) ||
    !value.provenance
  ) {
    return {
      schema: "silver/structure-check/v1",
      status: "fail",
      findings: ["Structure does not satisfy the portable v1 structural contract."],
    };
  }
  const seen = new Set();
  for (const entity of value.entities) {
    if (seen.has(entity.id)) {
      findings.push(`Entity id ${entity.id} is duplicated.`);
    }
    seen.add(entity.id);
  }
  const entities = new Set(value.entities.map(({ id }) => id));
  for (const entity of value.entities) {
    if (entity.parent && !entities.has(entity.parent)) {
      findings.push(`Entity ${entity.id} references missing parent ${entity.parent}.`);
    }
  }
  const parentOf = new Map(value.entities.map(({ id, parent }) => [id, parent]));
  for (const entity of value.entities) {
    const trail = [entity.id];
    let current = parentOf.get(entity.id);
    while (current) {
      if (trail.includes(current)) {
        findings.push(`Entity ${entity.id} is part of a parent cycle: ${[...trail, current].join(" -> ")}.`);
        break;
      }
      trail.push(current);
      current = parentOf.get(current);
    }
  }
  for (const relationship of value.relationships) {
    if (!entities.has(relationship.from)) {
      findings.push(`Relationship references missing entity ${relationship.from}.`);
    }
    if (!entities.has(relationship.to)) {
      findings.push(`Relationship references missing entity ${relationship.to}.`);
    }
  }
  if (!value.design_contexts.some(({ id }) => id === value.primary_context)) {
    findings.push("primary_context must reference one of design_contexts.");
  }
  return { schema: "silver/structure-check/v1", status: findings.length ? "fail" : "pass", findings };
}
