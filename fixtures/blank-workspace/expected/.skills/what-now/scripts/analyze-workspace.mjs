#!/usr/bin/env node

import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isDirectoryKind,
  isInactiveKind,
} from "../../design-check/scripts/artifact-kinds.mjs";
// The dependency-free YAML subset the design checks already use. Scripts copied
// into a workspace's `.skills/` cannot resolve an npm dependency — Silver bundles
// `yaml` inside its own package, and Node's resolver only walks upward, never
// into a sibling package's private tree. This was the last copied script that
// still imported one.
import { parseYaml } from "../../design-check/scripts/check-lib.mjs";

const ACTION_TITLES = {
  "repair-workspace": "Repair the Silver workspace",
  "resume-playbook": "Resume the paused playbook",
  reconcile: "Reconcile stale or diverged state",
  "review-result": "Review the awaiting result",
  "design-check": "Run applicable design checks",
  brand: "Refine the brand foundation",
  product: "Refine the product foundation",
  voice: "Refine voice guidance",
  principles: "Refine design principles",
  theme: "Work on the semantic theme",
  system: "Maintain the design system",
  research: "Plan research",
  collect: "Gather evidence from declared sources",
  synthesize: "Synthesize current evidence",
  ideate: "Explore design concepts",
  specify: "Specify the selected direction",
  structure: "Define information architecture",
  flow: "Develop the interaction flow",
  visualize: "Visualize a design",
  component: "Design the component contract",
  prototype: "Build or refine a prototype",
  evaluate: "Evaluate the current design",
  pitch: "Build a change case",
  implement: "Assess production implementation",
  measure: "Measure whether the change worked",
};

const FOUNDATION_ACTIONS = {
  brand: "brand",
  product: "product",
  voice: "voice",
  "design-principles": "principles",
  "design-system": "system",
};

let resultIndexRuntime;
async function loadResultIndexRuntime() {
  if (resultIndexRuntime) return resultIndexRuntime;
  for (const specifier of [
    "silver-design-framework/framework/runtime/result-index.mjs",
    "../../../.silver/runtime/result-index.mjs",
    "../../../runtime/result-index.mjs",
  ]) {
    try {
      resultIndexRuntime = await import(specifier);
      return resultIndexRuntime;
    } catch {
      // Try the package, installed workspace, then source tree.
    }
  }
  throw new Error("The shared skill-result index is unavailable.");
}

function parseArgs(args) {
  const rootIndex = args.indexOf("--root");
  const nowIndex = args.indexOf("--now");
  const root =
    rootIndex >= 0 ? path.resolve(args[rootIndex + 1]) : process.cwd();
  const now =
    nowIndex >= 0 ? new Date(args[nowIndex + 1]) : new Date();
  if (Number.isNaN(now.valueOf())) {
    throw new Error("--now must be a valid ISO date-time.");
  }
  return { root, now };
}

async function safeStat(filePath) {
  try {
    const observed = await lstat(filePath);
    return observed.isSymbolicLink() ? null : observed;
  } catch {
    return null;
  }
}

function inside(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (
    resolved === resolvedRoot ||
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    return null;
  }
  return resolved;
}

async function readSafe(root, relativePath) {
  const absolute = inside(root, relativePath);
  if (!absolute) return null;
  const segments = path.relative(path.resolve(root), absolute).split(path.sep);
  let cursor = path.resolve(root);
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    const segmentStat = await safeStat(cursor);
    if (!segmentStat) return null;
  }
  const observed = await safeStat(absolute);
  if (!observed?.isFile()) return null;
  return {
    absolute,
    content: await readFile(absolute, "utf8"),
    mtime: observed.mtime,
  };
}

// Some artifact kinds are backed by a directory, not a document. Reading one
// through readSafe always reports it missing, which used to make every fresh
// workspace's component catalog a high-confidence repair blocker.
async function statArtifact(root, relativePath, kind) {
  const absolute = inside(root, relativePath);
  if (!absolute) return null;
  const segments = path.relative(path.resolve(root), absolute).split(path.sep);
  let cursor = path.resolve(root);
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    if (!(await safeStat(cursor))) return null;
  }
  const observed = await safeStat(absolute);
  if (!observed) return null;
  if (isDirectoryKind(kind)) {
    if (!observed.isDirectory()) return null;
    return { absolute, content: "", mtime: observed.mtime, directory: true };
  }
  if (!observed.isFile()) return null;
  return {
    absolute,
    content: await readFile(absolute, "utf8"),
    mtime: observed.mtime,
    directory: false,
  };
}

async function readStructured(root, relativePath) {
  const source = await readSafe(root, relativePath);
  if (!source) return { source: null, value: null, error: null };
  try {
    return {
      source,
      value: relativePath.endsWith(".json")
        ? JSON.parse(source.content)
        : parseYaml(source.content),
      error: null,
    };
  } catch (error) {
    return { source, value: null, error: error.message };
  }
}

async function structuredFiles(root, relativeDirectory) {
  const absolute = inside(root, relativeDirectory);
  if (!absolute) return [];
  const observed = await safeStat(absolute);
  if (!observed?.isDirectory()) return [];
  const found = [];
  async function visit(directory, prefix) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) continue;
      const child = path.join(directory, entry.name);
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) {
        await visit(child, relative);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".json") ||
          entry.name.endsWith(".yaml") ||
          entry.name.endsWith(".yml"))
      ) {
        found.push(relative);
      }
    }
  }
  await visit(absolute, relativeDirectory);
  return found;
}

function semanticTime(value) {
  if (!value || typeof value !== "object") return null;
  for (const key of [
    "completed_at",
    "updated_at",
    "updated",
    "recorded_at",
    "created_at",
    "created",
  ]) {
    if (typeof value[key] === "string") {
      const date = new Date(value[key]);
      if (!Number.isNaN(date.valueOf())) {
        return { date, source: key };
      }
    }
  }
  return null;
}

function sourceTime(value, source) {
  return (
    semanticTime(value) ??
    (source?.mtime ? { date: source.mtime, source: "filesystem-mtime" } : null)
  );
}

function candidate({
  action,
  priority,
  reason,
  evidence,
  time,
  confidence = "high",
}) {
  return {
    action,
    title: ACTION_TITLES[action] ?? action,
    priority,
    reason: reason.slice(0, 500),
    evidence: Array.isArray(evidence) ? evidence : [evidence],
    confidence,
    ...(time
      ? {
          observed_at: time.date.toISOString(),
          timestamp_source: time.source,
        }
      : {}),
    automatic: false,
  };
}

function addCandidate(candidates, next) {
  const current = candidates.get(next.action);
  if (
    !current ||
    next.priority < current.priority ||
    (next.priority === current.priority &&
      (next.observed_at ?? "") > (current.observed_at ?? ""))
  ) {
    candidates.set(next.action, next);
  } else if (next.priority === current.priority) {
    current.evidence = [...new Set([...current.evidence, ...next.evidence])];
  }
}

async function inspectWorkspace(root, now) {
  const candidates = new Map();
  const observations = [];
  const manifestRecord = await readStructured(root, "design/manifest.yaml");
  const lockRecord = await readStructured(root, ".silver/lock.yaml");

  for (const [label, relativePath, record] of [
    ["manifest", "design/manifest.yaml", manifestRecord],
    ["lock", ".silver/lock.yaml", lockRecord],
  ]) {
    if (!record.source) {
      observations.push({
        severity: "blocker",
        source: relativePath,
        detail: `Silver ${label} is missing.`,
      });
      addCandidate(
        candidates,
        candidate({
          action: "repair-workspace",
          priority: 1,
          reason: `Repair or initialize the workspace because ${relativePath} is missing.`,
          evidence: relativePath,
        }),
      );
    } else if (record.error) {
      observations.push({
        severity: "blocker",
        source: relativePath,
        detail: `Silver ${label} cannot be parsed: ${record.error}`,
      });
      addCandidate(
        candidates,
        candidate({
          action: "repair-workspace",
          priority: 1,
          reason: `Repair the workspace because ${relativePath} is malformed.`,
          evidence: relativePath,
          time: sourceTime(null, record.source),
        }),
      );
    }
  }

  if (Array.isArray(manifestRecord.value?.artifacts)) {
    for (const artifact of manifestRecord.value.artifacts) {
      if (!artifact?.path || !artifact?.kind) continue;
      // The legacy permission policy is inactive since 0.5 and is not required
      // to be present.
      if (isInactiveKind(artifact.kind)) continue;
      const declared = await statArtifact(root, artifact.path, artifact.kind);
      if (!declared) {
        observations.push({
          severity: "blocker",
          source: artifact.path,
          detail: `Declared ${artifact.kind} artifact is missing or unsafe to read.`,
        });
        addCandidate(
          candidates,
          candidate({
            action: "repair-workspace",
            priority: 1,
            reason: `Repair the workspace because declared artifact ${artifact.id ?? artifact.kind} is missing or unsafe to read.`,
            evidence: `design/manifest.yaml#${artifact.id ?? artifact.kind}`,
          }),
        );
        continue;
      }
      const action = FOUNDATION_ACTIONS[artifact.kind];
      if (action && ["draft", "missing", "incomplete"].includes(artifact.status)) {
        const frontmatterUpdated = declared.content.match(
          /^updated:\s*["']?([^"'\n]+)["']?\s*$/m,
        )?.[1];
        const time =
          semanticTime({ updated: frontmatterUpdated }) ??
          sourceTime(null, declared);
        addCandidate(
          candidates,
          candidate({
            action,
            priority: 5,
            reason: `Refine ${artifact.id ?? artifact.kind}; the manifest still marks it ${artifact.status}.`,
            evidence: [
              `design/manifest.yaml#${artifact.id ?? artifact.kind}`,
              artifact.path,
            ],
            time,
            confidence: "medium",
          }),
        );
      }
    }
  }

  for (const relativePath of await structuredFiles(
    root,
    ".silver/playbooks/runs",
  )) {
    const record = await readStructured(root, relativePath);
    if (!record.value) continue;
    const time = sourceTime(record.value, record.source);
    const pending = record.value.checkpoints?.filter(
      ({ status }) => status === "pending",
    );
    if (record.value.status === "paused" && pending?.length) {
      addCandidate(
        candidates,
        candidate({
          action: "resume-playbook",
          priority: 2,
          reason: `Resume playbook ${record.value.run_id}; it is paused at ${pending.map(({ id }) => id).join(", ")}.`,
          evidence: relativePath,
          time,
        }),
      );
    }
    const staleNodes = record.value.node_states?.filter(
      ({ status }) => status === "stale",
    );
    const invalidations = record.value.invalidations?.filter(
      ({ status }) => status === "unresolved",
    );
    if (staleNodes?.length || invalidations?.length) {
      addCandidate(
        candidates,
        candidate({
          action: "reconcile",
          priority: 3,
          reason: `Reconcile playbook ${record.value.run_id}; it contains stale nodes or unresolved revision invalidations.`,
          evidence: relativePath,
          time,
        }),
      );
    }
  }

  for (const relativePath of await structuredFiles(
    root,
    ".silver/results/checks",
  )) {
    const record = await readStructured(root, relativePath);
    const status = record.value?.status ?? record.value?.execution?.status;
    if (["fail", "failed", "not-run"].includes(status)) {
      addCandidate(
        candidates,
        candidate({
          action: "design-check",
          priority: 3,
          reason: `Inspect and rerun design checks because ${relativePath} records ${status} coverage.`,
          evidence: relativePath,
          time: sourceTime(record.value, record.source),
        }),
      );
    }
  }

  const { loadSkillResultIndex, currentResultRecords } = await loadResultIndexRuntime();
  const resultIndex = await loadSkillResultIndex(root);
  for (const { path: relativePath, result } of currentResultRecords(resultIndex)) {
    const source = await readSafe(root, relativePath);
    const time = sourceTime(result, source);
    if (result.acceptance?.status === "awaiting-review") {
      addCandidate(
        candidates,
        candidate({
          action: "review-result",
          priority: 2,
          reason: `Review ${result.skill?.id ?? "skill"} result ${result.invocation_id}; execution finished but acceptance is still awaiting review.`,
          evidence: relativePath,
          time,
        }),
      );
    }
    if (result.freshness_blockers?.length) {
      addCandidate(
        candidates,
        candidate({
          action: "reconcile",
          priority: 3,
          reason: `Reconcile ${result.invocation_id}; externally authoritative input freshness blocks downstream readiness.`,
          evidence: relativePath,
          time,
        }),
      );
    }
    const executionComplete = ["complete", "complete-with-findings"].includes(
      result.execution?.status,
    );
    const accepted = ["accepted", "not-required"].includes(
      result.acceptance?.status,
    );
    const ready = result.readiness?.some(({ status }) => status === "ready");
    if (executionComplete && accepted && ready) {
      for (const recommendation of result.recommended_next_actions ?? []) {
        if (!ACTION_TITLES[recommendation.action]) continue;
        addCandidate(
          candidates,
          candidate({
            action: recommendation.action,
            priority: 4,
            reason: `${recommendation.reason} This follows accepted result ${result.invocation_id}.`,
            evidence: relativePath,
            time,
          }),
        );
      }
    }
  }

  const fallbacks = [
    ["design-check", "Run the applicable checks to establish current workspace coverage."],
    ["ideate", "Explore a small set of distinct directions from the current foundations."],
    ["research", "Clarify the next decision with a proportionate research plan."],
  ];
  for (const [action, reason] of fallbacks) {
    if (candidates.size >= 5) break;
    addCandidate(
      candidates,
      candidate({
        action,
        priority: 6,
        reason,
        evidence: "workspace fallback",
        time: { date: now, source: "analysis-time" },
        confidence: "low",
      }),
    );
  }

  const recommendations = [...candidates.values()]
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        (right.observed_at ?? "").localeCompare(left.observed_at ?? "") ||
        left.action.localeCompare(right.action),
    )
    .slice(0, 5)
    .map((recommendation, index) => ({
      rank: index + 1,
      ...recommendation,
    }));

  return {
    schema: "silver/what-now-analysis/v1",
    generated_at: now.toISOString(),
    workspace: root,
    observations,
    recommendations,
    invocation_recommendations: recommendations.map(
      ({ action, reason, automatic }) => ({ action, reason, automatic }),
    ),
  };
}

export { inspectWorkspace };

if (import.meta.main ?? (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
)) {
  (async () => {
    try {
    const { root, now } = parseArgs(process.argv.slice(2));
    console.log(JSON.stringify(await inspectWorkspace(root, now), null, 2));
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exitCode = 1;
    }
  })();
}
