// Carrying My Practice into a workspace.
//
// My Practice is where a designer's personal preferences live — one visible,
// Git-tracked place, shared across every workspace they work in. Anything
// personal is authored there and nowhere else: a workspace never becomes the
// home for one person's preferences, because a workspace is shared.
//
// Two kinds of personal preference resolve through here:
//
//   studio-voice.md   how the agent should talk (register, not rigour)
//   methods/*.yaml    method overlays: preferred questions, techniques,
//                     quality emphasis, and exclusions per skill
//
// Both are deliberately decoupled from the skill packages. Skills say what to
// do and can be rewritten, optimized, or upgraded without touching either, so a
// skill upgrade never silently changes how the agent sounds and a preference
// change never edits 21 files.
//
// Voice resolution is an ordered list of sources, first present wins. Two ship
// today; the list shape is the point, because a workspace-level house voice
// drops in between them later without changing any contract.
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { defaultPracticeRoot } from "./practice.mjs";
import { exists, readUtf8, writeUtf8 } from "./lib/files.mjs";
import { validateSchema } from "./lib/schemas.mjs";

const installerRoot = path.dirname(fileURLToPath(import.meta.url));

// The resolved practice, materialized into a workspace so an agent working there
// can read it. Untracked on purpose: AGENTS.md and CLAUDE.md are committed and
// shared, and one person's preferences must not travel with them.
//
// This file is generated. It is never an authoring location — edits here are
// overwritten by `silver repair`. Author in My Practice.
export const WORKSPACE_PRACTICE_OVERLAY_PATH = ".silver/my-practice.md";

export const PRACTICE_STUDIO_VOICE_FILE = "studio-voice.md";
export const PRACTICE_METHODS_DIRECTORY = "methods";

export function frameworkStudioVoicePath() {
  return path.resolve(installerRoot, "..", "framework", "studio-voice", "default.md");
}

function splitFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { metadata: null, body: content.trim() };
  let metadata = null;
  try {
    metadata = parse(match[1]);
  } catch {
    metadata = null;
  }
  return { metadata, body: match[2].trim() };
}

// A studio voice counts only when it declares itself one. That keeps the
// commented starter Silver seeds into a new practice inert until the designer
// deliberately activates it, rather than silently overriding the default with
// its own instructions.
export const STUDIO_VOICE_SCHEMA = "silver/studio-voice/v1";

async function readVoice(absolute, source) {
  if (!(await exists(absolute))) return null;
  const { metadata, body } = splitFrontmatter(await readUtf8(absolute));
  if (metadata?.schema !== STUDIO_VOICE_SCHEMA || !body) return null;
  return {
    source,
    path: absolute,
    id: metadata.id ?? `${source}-studio-voice`,
    title: metadata.title ?? "Studio voice",
    revision: metadata.revision ?? "r1",
    ...(metadata.summary ? { summary: metadata.summary } : {}),
    body,
  };
}

// Highest priority first.
export async function studioVoiceSources({ practiceRoot } = {}) {
  const practice = practiceRoot ?? defaultPracticeRoot();
  return [
    {
      source: "practice",
      absolute: path.join(practice, PRACTICE_STUDIO_VOICE_FILE),
    },
    // A workspace-level source belongs here when it lands.
    { source: "framework", absolute: frameworkStudioVoicePath() },
  ];
}

// A personal voice replaces the default rather than merging with it. Merging two
// voices produces neither; a designer writing their own is writing the whole
// thing.
export async function resolveStudioVoice({ practiceRoot } = {}) {
  for (const { source, absolute } of await studioVoiceSources({ practiceRoot })) {
    const voice = await readVoice(absolute, source);
    if (voice) return voice;
  }
  return null;
}

// The framework default only. AGENTS.md is committed and shared with the team,
// so it never carries personal practice content.
export async function resolveSharedStudioVoice() {
  return readVoice(frameworkStudioVoicePath(), "framework");
}

// Load the personal method overlays from My Practice.
//
// `silver/method-overlay/v1` has existed since 0.5 with nothing reading it, so a
// designer could author preferred questions, techniques, quality emphasis, and
// exclusions and no agent would ever see them. An overlay only ever *adds* — it
// cannot relax project facts, safety invariants, or required guidance, and the
// rendered overlay says so where the agent will read it.
export async function loadMethodOverlays({ practiceRoot } = {}) {
  const root = path.join(
    path.resolve(practiceRoot ?? defaultPracticeRoot()),
    PRACTICE_METHODS_DIRECTORY,
  );
  if (!(await exists(root))) return { overlays: [], invalid: [] };

  let entries;
  try {
    entries = (await readdir(root)).sort();
  } catch {
    return { overlays: [], invalid: [] };
  }

  const overlays = [];
  const invalid = [];
  for (const entry of entries) {
    if (!/\.ya?ml$/.test(entry)) continue;
    const absolute = path.join(root, entry);
    let value;
    try {
      value = parse(await readUtf8(absolute));
    } catch (error) {
      invalid.push({ path: entry, reason: error.message });
      continue;
    }
    const validation = await validateSchema("v2/method-overlay.schema.json", value);
    if (!validation.valid) {
      // A malformed personal file is reported, never silently applied and never
      // fatal: a broken overlay must not stop someone using their workspace.
      invalid.push({ path: entry, reason: validation.errors.join("; ") });
      continue;
    }
    overlays.push({ ...value, file: entry });
  }
  return { overlays, invalid };
}

// Entries a workspace must ignore. The materialized practice is the reason this
// exists: it has to be readable by the agent from inside the workspace, and it
// must never be committed.
export const GITIGNORE_ENTRIES = [
  WORKSPACE_PRACTICE_OVERLAY_PATH,
  // Pre-0.7 name, ignored so an upgraded workspace does not commit a leftover.
  ".silver/studio-voice.md",
];

const GITIGNORE_HEADER =
  "# The Silver Design Framework — personal, machine-local files.";

// Append the entries Silver needs without disturbing a project's own rules.
export async function ensureGitignoreEntries(root) {
  const absolute = path.join(path.resolve(root), ".gitignore");
  const current = (await exists(absolute)) ? await readUtf8(absolute) : "";
  const lines = current.split("\n").map((line) => line.trim());
  const missing = GITIGNORE_ENTRIES.filter((entry) => !lines.includes(entry));
  if (missing.length === 0) return { path: ".gitignore", changed: false };
  const next = [
    ...(current.trim() ? [current.trimEnd(), ""] : []),
    GITIGNORE_HEADER,
    ...missing,
    "",
  ].join("\n");
  await writeUtf8(absolute, next);
  return { path: ".gitignore", changed: true, added: missing };
}

function renderMethodOverlay(overlay) {
  const section = (heading, items) =>
    items?.length ? [`${heading}`, "", ...items.map((item) => `- ${item}`), ""] : [];
  return [
    `### ${overlay.title}`,
    "",
    `Applies to: ${overlay.applies_to.join(", ")}`,
    "",
    ...section("Preferred approach:", overlay.guidance),
    ...section("Hold these to a higher bar:", overlay.quality_emphasis),
    ...section("Skip or avoid:", overlay.exclusions),
  ];
}

export function renderPracticeOverlay({ practiceRoot, voice, overlays }) {
  return [
    "<!-- Generated by The Silver Design Framework from your personal practice at",
    `     ${practiceRoot}`,
    "",
    "     This file is a copy. Editing it does nothing lasting — `silver repair`",
    "     overwrites it. Author your preferences in My Practice instead.",
    "",
    "     Not committed: these are one person's preferences, not the project's. -->",
    "",
    "# Your practice, applied here",
    "",
    ...(voice
      ? [
          "## Studio voice",
          "",
          voice.body,
          "",
        ]
      : []),
    ...(overlays.length > 0
      ? [
          "## Method overlays",
          "",
          "Personal refinements to specific skills. These add to a skill's",
          "instructions; they never relax project facts, guardrails, required",
          "guidance, or approval boundaries. Where a preference and a project rule",
          "disagree, the project rule wins.",
          "",
          ...overlays.flatMap((overlay) => renderMethodOverlay(overlay)),
        ]
      : []),
  ].join("\n");
}

// Materialize My Practice into the workspace when there is anything personal to
// carry, and remove it when there is not, so reverting to defaults is complete.
export async function writeWorkspacePracticeOverlay(root, { practiceRoot } = {}) {
  const workspaceRoot = path.resolve(root);
  const absolute = path.join(workspaceRoot, WORKSPACE_PRACTICE_OVERLAY_PATH);
  const resolvedPracticeRoot = path.resolve(
    practiceRoot ?? defaultPracticeRoot(),
  );

  const voice = await resolveStudioVoice({ practiceRoot });
  const personalVoice = voice && voice.source !== "framework" ? voice : null;
  const { overlays, invalid } = await loadMethodOverlays({ practiceRoot });

  // Nothing personal to carry: the framework default already renders into the
  // committed AGENTS.md, so an overlay file would be noise.
  if (!personalVoice && overlays.length === 0) {
    if (await exists(absolute)) await rm(absolute, { force: true });
    return { source: "framework", written: false, overlays: 0, invalid };
  }

  const content = renderPracticeOverlay({
    practiceRoot: resolvedPracticeRoot,
    voice: personalVoice,
    overlays,
  });
  const existing = (await exists(absolute)) ? await readUtf8(absolute) : null;
  if (existing !== content) await writeUtf8(absolute, content);
  await ensureGitignoreEntries(workspaceRoot);
  return {
    source: personalVoice ? personalVoice.source : "practice",
    path: WORKSPACE_PRACTICE_OVERLAY_PATH,
    ...(personalVoice ? { revision: personalVoice.revision } : {}),
    overlays: overlays.length,
    invalid,
    written: existing !== content,
  };
}
