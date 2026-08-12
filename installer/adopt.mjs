// Adopting a repository that already has work in it.
//
// Silver used to refuse any folder that was not blank, which meant it could only
// be used on a product that did not exist yet. Real products have docs, tokens,
// components, and brand material already, sitting in places their team chose.
//
// The division of labour here is the whole design:
//
//   SILVER   enumerates what is present, validates a plan against its contract,
//            enforces the guardrails, computes the pins, and writes. It does not
//            know what a `tokens.json` is and does not try to.
//   AGENT    reads the entries, works out what they are, and proposes one
//            disposition per entry with its reasoning shown.
//   HUMAN    decides, one entry at a time.
//
// Being only as smart as necessary is deliberate. Deterministic framework and
// token detection is the kind of code that is always almost right, and every
// almost-right guess here would move somebody's files. The agent reads; Silver
// keeps it honest.
//
// The invariant everything else protects: **adoption is additive.** No
// disposition moves, renames, deletes, or rewrites a file that already exists.
// `register-in-place` exists precisely so a design system can be named where it
// already sits rather than relocated into a layout Silver prefers.
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { parse, stringify } from "yaml";

import { assertV2 } from "../framework/runtime/contracts.mjs";
import { INDEX_PATH, MANIFEST_PATH } from "../framework/runtime/manifest-sync.mjs";
import { createCheckpoint } from "./checkpoint.mjs";
import {
  exists,
  integrity,
  readUtf8,
  resolveInside,
  writeNewFile,
  writeUtf8,
} from "./lib/files.mjs";
import { renderIndex } from "./lib/index.mjs";
import { linkedSourceIntegrity } from "./sources.mjs";
import { stateIntegrity } from "./setup-plan.mjs";
import { FRAMEWORK_VERSION } from "./version.mjs";

export const ADOPTION_PATH = "design/adoption.yaml";

// Dependencies, build output, and tool caches are nobody's design material. This
// is the checkers' list rather than the integrity one: integrity asks "is this
// still the file we installed?", where build output counts; adoption asks "is
// this something a designer would want to name?", where it never does.
const SKIPPED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".parcel-cache",
  ".svelte-kit",
  ".turbo",
  ".vite",
  "__pycache__",
  "bower_components",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

// Directories setup creates for its own use. Enumerating them would ask a
// designer whether they want to adopt the framework into itself.
const SILVER_TEMPLATE_ROOTS = [
  ".claude",
  ".mcp.json",
  ".silver",
  ".skills",
  "design",
  "prototypes",
  "presentations",
  "production",
  "reference-system",
];

// Everything else Silver owns comes from the lock, which is the authority on
// what this installation put here. Deriving it beats a hardcoded list that
// drifts every time the payload changes — and after `silver setup`, an
// un-derived list means the first thing adoption asks about is CLAUDE.md.
async function silverOwnedRoots(root) {
  const owned = new Set(SILVER_TEMPLATE_ROOTS);
  const lockPath = path.join(root, ".silver", "lock.yaml");
  if (!(await exists(lockPath))) return owned;
  try {
    const lock = parse(await readUtf8(lockPath));
    for (const entry of [...(lock?.packages ?? []), ...(lock?.managed_files ?? [])]) {
      const declared = entry?.path;
      if (typeof declared === "string" && declared.length > 0) {
        owned.add(declared.split("/")[0]);
      }
    }
  } catch {
    // A malformed lock is doctor's finding. Fall back to the template roots
    // rather than refusing to enumerate.
  }
  return owned;
}

const DEFAULT_DEPTH_LIMIT = 3;
const DEFAULT_ENTRY_LIMIT = 500;
const DIRECTORY_ENTRY_LIMIT = 40;

// What each disposition is allowed to touch. Enforced here rather than trusted
// to the agent that proposed it: a plan is untrusted input, and a disposition
// that could write anywhere would make the additive-only rule a promise instead
// of a property.
const WRITE_SCOPES = {
  "leave-in-place": [],
  ignore: [ADOPTION_PATH],
  "register-in-place": [MANIFEST_PATH],
  "link-as-source": ["design/sources/sources.yaml"],
  "as-references": ["design/references/"],
  translate: ["design/"],
};

function relative(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join("/");
}

// `assertNoSecrets` walks object keys, so it is a no-op on a content string.
// Translated content is prose an agent wrote after reading a real repository,
// which is exactly the path by which a token in a config file becomes a token in
// a committed design artifact.
const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/,
  /\bfigd_[A-Za-z0-9_-]{12,}/,
  /\bgh[ps]_[A-Za-z0-9]{12,}/,
  /\bsk-[A-Za-z0-9]{16,}/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:password|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
];

function assertContentHasNoSecrets(content, where) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error(
        `Refusing to write ${where}: the content contains something that looks like a credential. Remove it from the source material and propose the item again.`,
      );
    }
  }
}

// Paths, kinds, and sizes. Nothing about meaning — every judgement belongs to
// the agent, and a walk that starts guessing is a walk that starts being wrong.
export async function enumerateRepository(root, options = {}) {
  const resolved = path.resolve(root);
  const depthLimit = options.depthLimit ?? DEFAULT_DEPTH_LIMIT;
  const entryLimit = options.entryLimit ?? DEFAULT_ENTRY_LIMIT;
  const owned = options.owned ?? (await silverOwnedRoots(resolved));
  const entries = [];
  let truncated = false;

  async function visit(directory, depth) {
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    children.sort((left, right) => left.name.localeCompare(right.name));
    const visible = children.filter((child) => child.name !== ".DS_Store");

    let reported = 0;
    for (const child of visible) {
      if (child.isDirectory() && SKIPPED_DIRECTORIES.has(child.name)) continue;
      if (depth === 0 && owned.has(child.name)) continue;
      if (entries.length >= entryLimit) {
        truncated = true;
        return;
      }
      if (reported >= DIRECTORY_ENTRY_LIMIT) {
        truncated = true;
        // Mark the parent rather than dropping silently, so a directory never
        // looks smaller than it is.
        const parent = entries.find(
          (entry) => entry.path === relative(resolved, directory),
        );
        if (parent) parent.truncated = true;
        return;
      }

      const absolute = path.join(directory, child.name);
      const entryPath = relative(resolved, absolute);
      reported += 1;

      if (child.isDirectory()) {
        let childCount = 0;
        try {
          childCount = (await readdir(absolute)).length;
        } catch {
          childCount = 0;
        }
        entries.push({ path: entryPath, entry_kind: "directory", child_count: childCount });
        if (depth + 1 < depthLimit) await visit(absolute, depth + 1);
      } else if (child.isFile()) {
        let size = 0;
        try {
          size = (await stat(absolute)).size;
        } catch {
          size = 0;
        }
        entries.push({ path: entryPath, entry_kind: "file", size });
      }
    }
  }

  if (await exists(resolved)) await visit(resolved, 0);

  return {
    entries,
    skipped_directories: [...SKIPPED_DIRECTORIES].sort(),
    truncated,
    depth_limit: depthLimit,
    entry_limit: entryLimit,
  };
}

// Entries already named in the manifest, or already decided in a previous run.
// Re-asking about them is how a per-item flow becomes unusable on the second
// pass.
async function alreadyHandled(root) {
  const handled = new Set();

  const manifestPath = path.join(root, MANIFEST_PATH);
  if (await exists(manifestPath)) {
    try {
      const manifest = parse(await readUtf8(manifestPath));
      for (const artifact of manifest?.artifacts ?? []) {
        if (artifact?.path) handled.add(artifact.path);
      }
    } catch {
      // A malformed manifest is doctor's finding. Adoption just learns nothing
      // from it rather than refusing to run.
    }
  }

  for (const record of await readAdoptionRecord(root)) {
    if (record.decision !== "deferred") handled.add(record.path);
  }
  return handled;
}

export async function readAdoptionRecord(root) {
  const file = path.join(path.resolve(root), ADOPTION_PATH);
  if (!(await exists(file))) return [];
  try {
    const document = parse(await readUtf8(file));
    return Array.isArray(document?.decisions) ? document.decisions : [];
  } catch {
    return [];
  }
}

function questionFor(entry) {
  return {
    id: entry.path.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, ""),
    question: `What should Silver do with ${entry.path}?`,
    explanation:
      "Adoption is additive. Whatever you choose, this file stays exactly where it is with its contents unchanged; the choice only decides how Silver refers to it.",
    options: [
      {
        value: "register-in-place",
        summary: "Name it in the manifest where it sits.",
        effect:
          "Adds an entry to design/manifest.yaml pointing at this path. The file is not read, moved, or rewritten.",
      },
      {
        value: "link-as-source",
        summary: "Pin it as a linked source.",
        effect:
          "Records it in design/sources/sources.yaml with an exact revision and integrity pin. Silver inspects it read-only and reports drift.",
      },
      {
        value: "as-references",
        summary: "Bring it in as reference material.",
        effect:
          "Creates a reference collection under design/references/. References inform work; they never become a source of truth.",
      },
      {
        value: "translate",
        summary: "Write a new Silver artifact derived from it.",
        effect:
          "Creates a new draft artifact under design/ whose provenance pins this path and its integrity. The original is untouched.",
      },
      {
        value: "leave-in-place",
        summary: "Do nothing for now.",
        effect: "No change. You will be asked again on the next run.",
      },
      {
        value: "ignore",
        summary: "Not design material.",
        effect: "Recorded in design/adoption.yaml so later runs stop asking about it.",
      },
    ],
    recommended: null,
    reversible: true,
    how_to_change:
      "Every disposition is additive and can be undone by removing the entry it added.",
    external_paths: [],
  };
}

// `--source` usually names a filesystem path, but a codebase registered
// through `silver link` is more durable to name by its linked-source id —
// the id survives a clone landing the sibling repository somewhere else,
// a literal path does not.
async function resolveSourceOption(root, source) {
  if (!source) return null;
  const registryPath = path.join(root, "design", "sources", "sources.yaml");
  if (await exists(registryPath)) {
    const registry = parse(await readUtf8(registryPath));
    const match = (registry?.sources ?? []).find((item) => item.id === source);
    if (match) {
      return path.isAbsolute(match.source.reference)
        ? match.source.reference
        : path.resolve(root, match.source.reference);
    }
  }
  return path.resolve(source);
}

export async function inspectAdoption(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const now = options.now ?? new Date().toISOString();
  const resolvedSource = await resolveSourceOption(root, options.source);
  const discovered = await enumerateRepository(resolvedSource ?? root, options);
  const handled = await alreadyHandled(root);
  const undecided = discovered.entries.filter((entry) => !handled.has(entry.path));

  return {
    schema: "silver/adoption-plan/v1",
    id: `adoption-${createHash("sha256").update(`${root}${now}`).digest("hex").slice(0, 12)}`,
    created_at: now,
    framework_version: options.version ?? FRAMEWORK_VERSION,
    target: root,
    ...(options.source
      ? {
          source: {
            kind: options.sourceKind ?? "local",
            reference: resolvedSource,
          },
        }
      : {}),
    discovered,
    // Deliberately empty. Silver enumerates; the agent fills this in with one
    // item per entry it can say something about, and the human decides each.
    items: [],
    // What the agent has to answer before this plan can be applied, phrased so
    // the shape of the work is obvious from the plan alone.
    unresolved_questions: undecided.map(
      (entry) =>
        `${entry.path}: no disposition proposed yet. Read it, then add an item with observed, agent_reading, confidence, proposed_disposition, and rationale.`,
    ),
    // Ready-made questions in the shape every host already renders, so a
    // per-item conversation needs no new presentation code.
    questions: undecided.map((entry) => questionFor(entry)),
    state_integrity: await stateIntegrity(root),
  };
}

function assertWithinScope(disposition, writePath) {
  const allowed = WRITE_SCOPES[disposition] ?? [];
  const normalized = writePath.split(path.sep).join("/");
  const permitted = allowed.some((scope) =>
    scope.endsWith("/") ? normalized.startsWith(scope) : normalized === scope,
  );
  if (!permitted) {
    throw new Error(
      `Disposition ${disposition} may not write ${normalized}. Allowed: ${
        allowed.length > 0 ? allowed.join(", ") : "nothing"
      }.`,
    );
  }
}

// design/manifest.yaml is canonical and hand-edited. Re-serializing it to add an
// entry would drop its comments and blank lines and turn a two-line addition
// into a whole-file diff, so new artifacts are spliced in as text at the end of
// the existing `artifacts:` block.
export function appendArtifactsToSource(source, artifacts) {
  if (artifacts.length === 0) return source;
  const lines = source.split("\n");
  const start = lines.findIndex((line) => /^artifacts:\s*$/.test(line));
  if (start === -1) {
    throw new Error("design/manifest.yaml has no artifacts: block to extend.");
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[A-Za-z_][A-Za-z0-9_]*:/.test(lines[index])) {
      end = index;
      break;
    }
  }
  while (end > start + 1 && lines[end - 1].trim() === "") end -= 1;

  const rendered = artifacts.map((artifact) =>
    [
      `  - id: ${artifact.id}`,
      `    kind: ${artifact.kind}`,
      `    path: ${artifact.path}`,
      `    scope: ${artifact.scope}`,
      `    role: ${artifact.role}`,
      `    status: ${artifact.status}`,
      "    authority:",
      "      type: local",
      // Registered, not owned. Without this the checkers would demand Silver
      // frontmatter in a file the team wrote, and the only way to satisfy them
      // would be to edit it — which is the one thing adoption promised not to do.
      "    origin: adopted",
    ].join("\n"),
  );
  lines.splice(end, 0, ...rendered);
  return lines.join("\n");
}

export async function applyAdoptionPlan(options = {}) {
  const plan = options.plan;
  await assertV2("adoption-plan.schema.json", plan);

  const root = path.resolve(options.root ?? plan.target);
  const now = options.now ?? new Date().toISOString();
  const decidedBy = options.decidedBy ?? "silver-adopt";

  // A plan describes a working tree. If that tree moved underneath it, every
  // path and integrity in it is a claim about something that no longer exists.
  const currentState = await stateIntegrity(root);
  if (currentState !== plan.state_integrity) {
    throw new Error(
      "This adoption plan was built against a different state of the repository. Re-run `silver adopt inspect` and decide again.",
    );
  }

  const only = options.only ? new Set(options.only) : null;
  const scoped = plan.items.filter((item) => !only || only.has(item.id));

  const pending = scoped.filter((item) => item.decision === "pending");
  if (pending.length > 0) {
    throw new Error(
      `Every item must be decided before it is applied. Still pending: ${pending
        .map((item) => item.id)
        .join(", ")}. Pass --only to apply a decided subset.`,
    );
  }

  const accepted = scoped.filter((item) => item.decision === "accepted");
  const written = [];
  const registered = [];
  const linked = [];
  const recorded = [];

  for (const item of accepted) {
    // Every path in a plan is untrusted input. resolveInside throws on escape.
    const absolute = resolveInside(root, item.path);
    if (!plan.source && !(await exists(absolute))) {
      throw new Error(`Cannot adopt ${item.path}: it does not exist in ${root}.`);
    }

    switch (item.proposed_disposition) {
      case "leave-in-place":
      case "ignore":
        break;

      case "register-in-place":
        assertWithinScope(item.proposed_disposition, MANIFEST_PATH);
        registered.push({ ...item.artifact, path: item.path });
        break;

      case "link-as-source": {
        assertWithinScope(item.proposed_disposition, "design/sources/sources.yaml");
        // Silver computes revision and integrity rather than accepting them:
        // a pin is a measurement, and one supplied by its beneficiary is not.
        linked.push({
          schema: "silver/linked-source/v1",
          id: item.id,
          title: item.link.title,
          kind: item.link.kind,
          source: {
            type: "local",
            reference: root,
            revision: FRAMEWORK_VERSION,
            integrity: await linkedSourceIntegrity(root, [item.path]),
            paths: [item.path],
          },
          authority: item.link.authority,
          scope: {},
          linked_at: now,
          linked_by: decidedBy,
        });
        break;
      }

      case "translate":
      case "as-references": {
        assertWithinScope(item.proposed_disposition, item.target_path);
        const destination = resolveInside(root, item.target_path);
        assertContentHasNoSecrets(item.content, item.target_path);
        // `wx` — writeNewFile fails if the path exists. The additive-only rule
        // is a property of the write call, not a check that could be forgotten.
        await writeNewFile(destination, item.content);
        written.push(item.target_path);
        break;
      }

      default:
        throw new Error(`Unknown disposition: ${item.proposed_disposition}`);
    }

    recorded.push({
      id: item.id,
      path: item.path,
      disposition: item.proposed_disposition,
      decision: item.decision,
      rationale: item.rationale,
      decided_by: item.decided_by ?? decidedBy,
      decided_at: item.decided_at ?? now,
    });
  }

  // Rejected and deferred entries are decisions too. Recording them is what
  // stops the second run asking the same questions as the first.
  for (const item of scoped.filter((entry) => entry.decision !== "accepted")) {
    recorded.push({
      id: item.id,
      path: item.path,
      disposition:
        item.decision === "rejected" ? "leave-in-place" : item.proposed_disposition,
      decision: item.decision,
      rationale: item.rationale,
      decided_by: item.decided_by ?? decidedBy,
      decided_at: item.decided_at ?? now,
    });
  }

  if (registered.length > 0) {
    const manifestAbsolute = path.join(root, MANIFEST_PATH);
    const source = await readUtf8(manifestAbsolute);
    const updated = appendArtifactsToSource(source, registered);
    await writeUtf8(manifestAbsolute, updated);
    written.push(MANIFEST_PATH);

    // design/INDEX.md lists every mapped artifact, so a manifest that gained
    // entries leaves it stale. 0.7's rule is that the manifest and its generated
    // index move together in one checkpoint; adoption is no exception.
    const lockPath = path.join(root, ".silver", "lock.yaml");
    if (await exists(lockPath)) {
      const lock = parse(await readUtf8(lockPath));
      const skillIds = (lock?.packages ?? [])
        .filter(({ type }) => type === "skill")
        .map(({ id }) => id);
      const indexContent = renderIndex(parse(updated), skillIds);
      await writeUtf8(path.join(root, INDEX_PATH), indexContent);
      written.push(INDEX_PATH);

      // The lock records the integrity of every generated file it manages, so
      // regenerating the index without re-pinning it trades one stale-index
      // diagnostic for a stale-lock one. Artifact, manifest, index, and lock
      // move together or the workspace disagrees with itself.
      const managed = (lock?.managed_files ?? []).find(
        (entry) => entry.path === INDEX_PATH,
      );
      if (managed) {
        managed.base_integrity = integrity(indexContent);
        await writeUtf8(lockPath, stringify(lock));
        written.push(".silver/lock.yaml");
      }
    }
  }

  if (linked.length > 0) {
    const registryPath = path.join(root, "design", "sources", "sources.yaml");
    const existing = (await exists(registryPath))
      ? (parse(await readUtf8(registryPath))?.sources ?? [])
      : [];
    await writeUtf8(
      registryPath,
      stringify({
        schema: "silver/source-registry/v1",
        sources: [...existing, ...linked],
      }),
    );
    written.push("design/sources/sources.yaml");
  }

  if (recorded.length > 0) {
    const previous = await readAdoptionRecord(root);
    const byId = new Map(previous.map((entry) => [entry.id, entry]));
    for (const entry of recorded) byId.set(entry.id, entry);
    await writeUtf8(
      path.join(root, ADOPTION_PATH),
      stringify({
        schema: "silver/adoption-record/v1",
        updated: now,
        decisions: [...byId.values()].sort((left, right) =>
          left.id.localeCompare(right.id),
        ),
      }),
    );
    written.push(ADOPTION_PATH);
  }

  const paths = [...new Set(written)].sort();
  const checkpoint =
    paths.length > 0 && options.checkpoint !== false
      ? await createCheckpoint({
          root,
          id: `adopt-${plan.id}`,
          reason: "workspace-configuration",
          paths,
          now,
        })
      : null;

  return {
    root,
    applied: accepted.map((item) => ({
      id: item.id,
      path: item.path,
      disposition: item.proposed_disposition,
    })),
    skipped: scoped
      .filter((item) => item.decision !== "accepted")
      .map((item) => ({ id: item.id, decision: item.decision })),
    paths,
    checkpoint,
  };
}
