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

async function loadRuntime(injected) {
  if (injected) return injected;
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

// A single cut-off resolves the whole checker: an explicit --since overrides the
// workspace's stored horizon, and --since all evaluates every record regardless of age.
// With neither, the workspace's own horizon (if it has one) is the default.
function resolveCutoff(options, enforcement) {
  if (options.since === "all") return { cutoff: null, source: "since-all" };
  if (options.since) {
    const parsed = new Date(options.since).valueOf();
    if (Number.isNaN(parsed)) throw new Error("--since must be an ISO timestamp or all.");
    return { cutoff: parsed, source: "since" };
  }
  if (enforcement) return { cutoff: new Date(enforcement.from).valueOf(), source: "horizon" };
  return { cutoff: null, source: "none" };
}

export async function checkAuditTrailIntegrity(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const checker = "audit-trail-integrity";
  const requested = [".silver/lock.yaml", ".silver/results/skills"];
  const completed = [];
  const findings = [];
  const advisories = [];
  let enforcement = null;
  try {
    const lock = parseYaml(await readFile(path.join(root, ".silver/lock.yaml"), "utf8"));
    if (lock.schema === "silver/lock/v2" && !Number.isNaN(new Date(lock.enforcement?.from).valueOf())) {
      enforcement = lock.enforcement;
      completed.push(".silver/lock.yaml");
    } else {
      findings.push(finding({ checker, rule: "audit-trail.enforcement-horizon-missing", file: ".silver/lock.yaml", message: "This workspace has no valid audit enforcement horizon. Run silver migrate --apply before relying on current audit gates." }));
    }
  } catch (error) {
    findings.push(finding({ checker, rule: "audit-trail.enforcement-horizon-missing", file: ".silver/lock.yaml", message: `This workspace cannot establish its audit enforcement horizon: ${error.message}` }));
  }

  const { cutoff, source: cutoffSource } = resolveCutoff(options, enforcement);
  let evaluated = 0;
  let skipped = 0;

  const { assertV2, loadSkillResultIndex } = await loadRuntime(options.runtime?.auditTrail);
  const index = await loadSkillResultIndex(root);

  for (const record of index.records) {
    completed.push(record.path);

    // A record whose JSON cannot even be parsed has no completed_at to test against
    // the cut-off, and unlike a merely superseded schema shape this is not a known,
    // bounded population from a past vocabulary change — it is unreadable, of
    // unknown age, and exactly the kind of tampering this checker exists to catch.
    // It is always reported, cut-off or not.
    if (record.parse_error) {
      findings.push(finding({ checker, rule: "audit-trail.result-invalid", file: record.path, message: `Result is not valid JSON: ${record.parse_error}` }));
      evaluated += 1;
      continue;
    }

    const result = record.result;
    const completedAtMs = new Date(result?.completed_at).valueOf();
    const preCutoff = cutoff !== null && !Number.isNaN(completedAtMs) && completedAtMs < cutoff;
    if (preCutoff) {
      skipped += 1;
      continue;
    }

    // The cut-off test runs before schema validation on purpose: a record written
    // under an older activity vocabulary (or any other now-superseded shape) is
    // immutable history, not a defect to keep re-flagging on every check.
    try {
      await assertV2("skill-result.schema.json", result);
    } catch (error) {
      findings.push(finding({ checker, rule: "audit-trail.result-invalid", file: record.path, message: error.message }));
      evaluated += 1;
      continue;
    }

    if (new Date(result.started_at).valueOf() > new Date(result.completed_at).valueOf()) {
      findings.push(finding({ checker, rule: "audit-trail.invocation-interval-invalid", file: record.path, message: "Result started_at falls after completed_at." }));
    }
    if (result.retry_of === result.invocation_id) {
      findings.push(finding({ checker, rule: "audit-trail.retry-self-reference", file: record.path, message: "Result retry_of cannot reference its own invocation_id." }));
    }
    if ((result.outputs?.length ?? 0) > 0 && !result.provenance) {
      findings.push(finding({ checker, rule: "audit-trail.provenance-missing", file: record.path, message: "A durable-output result has no provenance envelope." }));
    }

    if (result.provenance) {
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

      // Whether a historical design-context, guidance, or binding pin still matches the
      // current registry is the passage of time against a closed record, not a defect —
      // it is not reported here. `silver trace` surfaces per-artifact drift on demand.
      for (const context of result.provenance.design_contexts ?? []) {
        try {
          await readFile(inside(root, context.path), "utf8");
        } catch {
          advisories.push(advisory({ checker, rule: "audit-trail.design-context-unavailable", file: record.path, message: `Historical design-context pin ${context.id}@${context.revision} is unavailable.` }));
        }
      }

      if ((result.provenance.guidance ?? []).length > 0) {
        try {
          const registry = parseYaml(await readFile(inside(root, "design/guidance/sources.yaml"), "utf8"));
          for (const pin of result.provenance.guidance) {
            const current = (registry.sources ?? []).find(({ id }) => id === pin.id);
            if (!current) {
              advisories.push(advisory({ checker, rule: "audit-trail.guidance-unavailable", file: record.path, message: `Historical guidance pin ${pin.id}@${pin.revision} could not be resolved in the registry.` }));
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
          if (observed === binding.integrity) {
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

    evaluated += 1;
  }

  for (const [output, matches] of index.byOutput) {
    if (matches.length < 2) continue;
    const [id, kind, revision] = output.split("\0");
    const later = matches[0];
    const laterCompletedAt = new Date(later.result?.completed_at).valueOf();
    const preCutoff = cutoff !== null && !Number.isNaN(laterCompletedAt) && laterCompletedAt < cutoff;
    if (preCutoff) {
      skipped += 1;
      continue;
    }
    const message = `${matches.length} results claim the same exact output identity (${kind} ${id}@${revision}).`;
    findings.push(finding({ checker, rule: "audit-trail.duplicate-output-result", file: later.path, message }));
    evaluated += 1;
  }

  const result = checkResult({ checker, requested, completed, findings, advisories });
  result.extensions ??= {};
  result.extensions["silver.audit-horizon"] = {
    enforcement: enforcement ?? "missing",
    cutoff: cutoff !== null ? new Date(cutoff).toISOString() : null,
    cutoff_source: cutoffSource,
    evaluated,
    skipped,
  };
  return result;
}
