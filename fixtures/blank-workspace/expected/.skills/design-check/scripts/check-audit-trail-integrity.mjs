import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  advisory,
  checkResult,
  finding,
  parseYaml,
} from "./check-lib.mjs";

let resultRuntime;
function assertPortableResultShape(_schema, result) {
  const required = [
    "schema", "invocation_id", "skill", "started_at", "completed_at",
    "inputs", "outputs", "providers", "representation_coverage",
    "freshness_blockers", "degraded_capabilities", "execution", "acceptance",
    "readiness", "checks", "guardrails", "unresolved_questions",
    "recommended_next_actions",
  ];
  const missing = required.filter((field) => result?.[field] === undefined);
  if (result?.schema !== "silver/skill-result/v2" || missing.length > 0) {
    throw new Error(
      `Result does not satisfy the portable skill-result shape${missing.length ? `; missing ${missing.join(", ")}` : ""}.`,
    );
  }
  for (const field of [
    "inputs", "outputs", "providers", "representation_coverage",
    "freshness_blockers", "degraded_capabilities", "readiness", "checks",
    "guardrails", "unresolved_questions", "recommended_next_actions",
  ]) {
    if (!Array.isArray(result[field])) throw new Error(`${field} must be an array.`);
  }
}

async function loadRuntime() {
  if (resultRuntime) return resultRuntime;
  let indexRuntime;
  for (const base of [
    "silver-design-framework/framework/runtime/",
    "../../../.silver/runtime/",
    "../../../runtime/",
  ]) {
    try {
      indexRuntime = await import(`${base}result-index.mjs`);
      break;
    } catch {
      // Try the next result-index location.
    }
  }
  if (!indexRuntime) throw new Error("The shared audit-trail result index is unavailable.");
  let assertV2 = assertPortableResultShape;
  for (const base of [
    "silver-design-framework/framework/runtime/",
    "../../../.silver/runtime/",
    "../../../runtime/",
  ]) {
    try {
      ({ assertV2 } = await import(`${base}contracts.mjs`));
      break;
    } catch {
      // A dependency-free workspace uses the portable shape validation above.
    }
  }
  resultRuntime = { ...indexRuntime, assertV2 };
  return resultRuntime;
}

const key = (reference) => JSON.stringify({
  id: reference.id,
  kind: reference.kind,
  revision: reference.revision,
  path: reference.path,
  ...(reference.role ? { role: reference.role } : {}),
});

function inside(root, relative) {
  const workspace = path.resolve(root);
  const absolute = path.resolve(workspace, relative);
  if (absolute === workspace || !absolute.startsWith(`${workspace}${path.sep}`)) {
    throw new Error(`Path escapes workspace: ${relative}`);
  }
  return absolute;
}

const digest = (content) =>
  `sha256:${createHash("sha256").update(content).digest("hex")}`;

export async function checkAuditTrailIntegrity(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "audit-trail-integrity";
  const requested = [".silver/results/skills"];
  const completed = [];
  const findings = [];
  const advisories = [];
  const { assertV2, loadSkillResultIndex } = await loadRuntime();
  const index = await loadSkillResultIndex(root);
  for (const record of index.records) {
    completed.push(record.path);
    if (record.parse_error) {
      findings.push(finding({ checker, rule: "audit-trail.result-invalid", file: record.path, message: `Result is not valid JSON: ${record.parse_error}` }));
      continue;
    }
    const result = record.result;
    try {
      await assertV2("skill-result.schema.json", result);
    } catch (error) {
      findings.push(finding({ checker, rule: "audit-trail.result-invalid", file: record.path, message: error.message }));
      continue;
    }
    if ((result.outputs?.length ?? 0) > 0 && !result.provenance) {
      findings.push(finding({ checker, rule: "audit-trail.provenance-missing", file: record.path, message: "A durable-output result has no provenance envelope." }));
      continue;
    }
    if (!result.provenance) continue;
    const sources = result.provenance.sources ?? [];
    if (
      sources.length !== result.inputs.length ||
      sources.some((source, index) => key(source) !== key(result.inputs[index]))
    ) {
      findings.push(finding({ checker, rule: "audit-trail.sources-disagree", file: record.path, message: "Result provenance sources disagree with the invocation inputs." }));
    }
    if (
      result.provenance.acceptance !== undefined &&
      result.provenance.acceptance !== result.acceptance.status
    ) {
      findings.push(finding({ checker, rule: "audit-trail.acceptance-disagrees", file: record.path, message: "Deprecated provenance acceptance disagrees with authoritative result acceptance." }));
    }
    const kinds = new Set((result.provenance.contributors ?? []).map(({ kind }) => kind));
    const required = { "human-authored": "human", "agent-assisted": "agent", imported: "provider" }[result.provenance.origin];
    if (required && !kinds.has(required)) {
      findings.push(finding({ checker, rule: "audit-trail.origin-unsubstantiated", file: record.path, message: `Origin ${result.provenance.origin} has no ${required} contributor.` }));
    }
    if (
      result.provenance.origin === "generated" &&
      !kinds.has("agent") &&
      !kinds.has("provider")
    ) {
      findings.push(finding({ checker, rule: "audit-trail.origin-unsubstantiated", file: record.path, message: "Generated provenance has no agent or provider contributor." }));
    }
    const recordedAt = new Date(result.provenance.recorded_at).valueOf();
    if (
      recordedAt < new Date(result.started_at).valueOf() ||
      recordedAt > new Date(result.completed_at).valueOf()
    ) {
      findings.push(finding({ checker, rule: "audit-trail.recorded-outside-invocation", file: record.path, message: "Provenance recorded_at falls outside the invocation interval." }));
    }

    for (const context of result.provenance.design_contexts ?? []) {
      try {
        const current = parseYaml(await readFile(inside(root, context.path), "utf8"));
        if (
          current.id !== context.id ||
          current.kind !== context.kind ||
          current.revision !== context.revision
        ) {
          advisories.push(advisory({ checker, rule: "audit-trail.design-context-advanced", file: record.path, message: `Historical design-context pin ${context.id}@${context.revision} no longer matches ${context.path}.` }));
        }
      } catch {
        advisories.push(advisory({ checker, rule: "audit-trail.design-context-unavailable", file: record.path, message: `Historical design-context pin ${context.id}@${context.revision} is unavailable.` }));
      }
    }

    if ((result.provenance.guidance ?? []).length > 0) {
      try {
        const registry = parseYaml(await readFile(inside(root, "design/guidance/sources.yaml"), "utf8"));
        for (const pin of result.provenance.guidance) {
          const current = (registry.sources ?? []).find(({ id }) => id === pin.id);
          if (
            !current ||
            current.source?.revision !== pin.revision ||
            current.source?.integrity !== pin.integrity
          ) {
            advisories.push(advisory({ checker, rule: "audit-trail.guidance-advanced", file: record.path, message: `Historical guidance pin ${pin.id}@${pin.revision} no longer matches the registry.` }));
          }
        }
      } catch {
        advisories.push(advisory({ checker, rule: "audit-trail.guidance-unavailable", file: record.path, message: "Historical guidance pins cannot be resolved because the registry is unavailable." }));
      }
    }
    for (const binding of result.provenance.external_bindings ?? []) {
      if (typeof binding === "string") {
        advisories.push(advisory({ checker, rule: "audit-trail.binding-unpinned", file: record.path, message: `Historical external binding ${binding} has no content-integrity pin.` }));
        continue;
      }
      try {
        const content = await readFile(inside(root, binding.path));
        const observed = digest(content);
        if (observed !== binding.integrity) {
          advisories.push(advisory({ checker, rule: "audit-trail.binding-advanced", file: record.path, message: `Historical external binding ${binding.id} differs from its recorded integrity.` }));
        } else {
          const current = parseYaml(content.toString("utf8"));
          if (current.id !== binding.id || current.schema !== "silver/representation-binding/v2") {
            findings.push(finding({ checker, rule: "audit-trail.binding-contradiction", file: record.path, message: `Pinned external binding ${binding.id} does not identify a v2 binding with that id.` }));
          }
        }
      } catch (error) {
        if (/Path escapes workspace/.test(error.message)) {
          findings.push(finding({ checker, rule: "audit-trail.binding-path-unsafe", file: record.path, message: error.message }));
        } else {
          advisories.push(advisory({ checker, rule: "audit-trail.binding-unavailable", file: record.path, message: `Historical external binding ${binding.id} is unavailable.` }));
        }
      }
    }
  }
  for (const [output, matches] of index.byOutput) {
    if (matches.length < 2) continue;
    const [id, kind, revision] = output.split("\0");
    findings.push(finding({ checker, rule: "audit-trail.duplicate-output-result", file: matches[0].path, message: `${matches.length} results claim the same exact output identity (${kind} ${id}@${revision}).` }));
  }
  return checkResult({ checker, requested, completed, findings, advisories });
}
