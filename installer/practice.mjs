import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { parse, stringify } from "yaml";

import { assertV2 } from "../framework/runtime/contracts.mjs";
import {
  exists,
  readUtf8,
  resolveInside,
  writeNewFile,
  writeUtf8,
} from "./lib/files.mjs";
import { slugify } from "./setup.mjs";

const run = promisify(execFile);

export function defaultPracticeRoot() {
  return path.join(homedir(), "Silver", "My Practice");
}

// The shape of a practice folder. Declared here rather than in
// practice-overlay.mjs so the dependency runs one way: the overlay reads the
// practice, never the reverse.
export const PRACTICE_STUDIO_VOICE_FILE = "studio-voice.md";
export const PRACTICE_METHODS_DIRECTORY = "methods";

// A studio voice counts only when it declares itself one, so the commented
// starter Silver seeds stays inert until the designer means it.
export const STUDIO_VOICE_SCHEMA = "silver/studio-voice/v1";

async function git(root, args, { allowFailure = false } = {}) {
  try {
    const result = await run("git", ["-C", root, ...args], {
      encoding: "utf8",
    });
    return result.stdout.trim();
  } catch (error) {
    if (allowFailure) return null;
    throw new Error(`Git failed in My Practice: ${error.stderr?.trim() || error.message}`);
  }
}

async function commitPractice(root, message, paths) {
  const overlapping = await git(
    root,
    ["diff", "--cached", "--name-only", "--", ...paths],
    { allowFailure: true },
  );
  if (overlapping) {
    throw new Error(
      "My Practice paths already contain staged work; the revision was not committed.",
    );
  }
  await git(root, ["add", "--", ...paths]);
  const changed = await git(root, ["diff", "--cached", "--quiet"], {
    allowFailure: true,
  });
  if (changed === "") return null;
  await git(root, [
    "-c",
    "user.name=Silver",
    "-c",
    "user.email=silver@local",
    "commit",
    "--only",
    "-m",
    message,
    "--",
    ...paths,
  ]);
  return git(root, ["rev-parse", "HEAD"]);
}

async function backupState(root, now = new Date().toISOString()) {
  const remote = await git(root, ["remote", "get-url", "origin"], {
    allowFailure: true,
  });
  if (!remote) return { status: "local-only" };
  const head = await git(root, ["rev-parse", "HEAD"], { allowFailure: true });
  const upstream = await git(root, ["rev-parse", "@{upstream}"], {
    allowFailure: true,
  });
  return head && upstream && head === upstream
    ? { status: "verified", remote, verified_at: now }
    : { status: "remote-configured", remote };
}

export async function initializePractice(options = {}) {
  const root = path.resolve(options.root ?? defaultPracticeRoot());
  const now = options.now ?? new Date().toISOString();
  const manifestPath = path.join(root, ".silver", "practice.yaml");
  if (await exists(manifestPath)) {
    const manifest = parse(await readUtf8(manifestPath));
    await assertV2("practice.schema.json", manifest);
    const backup = await backupState(root, now);
    return {
      root,
      created: false,
      manifest: { ...manifest, backup },
      commit: await git(root, ["rev-parse", "HEAD"], { allowFailure: true }),
      backup,
    };
  }

  const name = options.name?.trim() || "My Practice";
  const id = options.id?.trim() || slugify(name) || "my-practice";
  const directories = ["methods", "playbooks", "rubrics", "decisions"];
  const practice = `# ${name}

This is your visible, tool-neutral design practice. Silver changes it only
through reviewed proposals and records each approved revision in local Git.

Everything personal lives here, in one place, and applies to every workspace you
work in. Nothing personal belongs in a project: a workspace is shared, and your
preferences are yours.

## What you can set here

| File | Sets |
| --- | --- |
| \`studio-voice.md\` | How the agent talks to you while designing |
| \`methods/*.yaml\` | Preferred questions, techniques, quality emphasis, and exclusions, per skill |
| \`playbooks/\` | Your own composed sequences |
| \`rubrics/\` | How you judge quality |

Silver reads these when you run \`silver repair\` in a workspace, and carries
them in as an untracked file. They are never committed with a project.

Personal preference adds to how work is done. It never relaxes project facts,
guardrails, required guidance, or approval boundaries — where a preference and a
project rule disagree, the project rule wins.

## Tools

- Add durable tool preferences through conversation.

## Process

- Adapt the process to the design question rather than enforcing one lifecycle.

## Quality

- Make evidence, assumptions, tradeoffs, and acceptance visible.

## Boundaries

- Personal methods do not override product facts or required linked guidance.
`;
  await writeNewFile(path.join(root, "PRACTICE.md"), practice);
  await writeNewFile(
    path.join(root, "README.md"),
    "# My Practice\n\nReadable methods, playbooks, rubrics, and decisions used across Silver workspaces.\n",
  );
  for (const directory of directories) {
    await writeNewFile(
      path.join(root, directory, "README.md"),
      `# ${directory[0].toUpperCase()}${directory.slice(1)}\n`,
    );
  }

  // An override point nobody can find is not an override point. Seed both with
  // commented-out starters so the shape is obvious and neither is active until
  // the designer means it.
  await writeNewFile(
    path.join(root, "studio-voice.md"),
    `<!--
Your studio voice: how you want the agent to talk to you while designing.

Silver ships a default. Uncomment the frontmatter below and write your own to
replace it everywhere you work, then run \`silver repair\` in a workspace to
apply it. Yours replaces the default rather than blending with it.

This governs register, not rigour. Skills still say what to do.

schema: silver/studio-voice/v1
id: my-studio-voice
title: My studio voice
revision: r1
-->

Write your voice here, then move the frontmatter above out of this comment.

For example: be blunt. Lead with the idea, not the process. Show me two options
before you commit to one, and tell me which you would pick.
`,
  );
  await writeNewFile(
    path.join(root, "methods", "example.yaml.txt"),
    `# A method overlay: your personal refinement to one or more skills.
#
# Rename this to something.yaml to activate it, then run \`silver repair\` in a
# workspace. Overlays only add — they never relax project facts, guardrails,
# required guidance, or approval boundaries.
#
# schema: silver/method-overlay/v1
# id: my-ideation-overlay
# title: How I like to ideate
# revision: r1
# applies_to:
#   - ideate
#   - visualize
# guidance:
#   - Give me at least three genuinely different directions, not three variations.
#   - Name the one you would pick and say why.
# quality_emphasis:
#   - An idea without a stated assumption is not finished.
# exclusions:
#   - Do not produce mood boards.
# provenance:
#   schema: silver/provenance/v1
#   origin: human-authored
#   recorded_at: ${now}
#   sources: []
#   guidance: []
#   design_contexts: []
#   change:
#     reason: Record how I prefer to run ideation.
#   acceptance: not-required
#   external_bindings: []
`,
  );
  await git(root, ["init"]);
  const manifest = {
    schema: "silver/practice/v1",
    id,
    name,
    revision: "r1",
    updated_at: now,
    methods: [],
    playbooks: [],
    backup: await backupState(root, now),
  };
  await assertV2("practice.schema.json", manifest);
  await writeNewFile(manifestPath, stringify(manifest));
  const commit = await commitPractice(root, "Initialize My Practice", [
    "README.md",
    "PRACTICE.md",
    "studio-voice.md",
    "methods/example.yaml.txt",
    ".silver/practice.yaml",
    ...directories.map((directory) => `${directory}/README.md`),
  ]);
  return { root, created: true, manifest, commit, backup: manifest.backup };
}

function nextRevision(revision) {
  const value = Number(revision.slice(1));
  if (!Number.isInteger(value)) throw new Error(`Unsupported practice revision: ${revision}`);
  return `r${value + 1}`;
}

export async function applyPracticeChange({ root, proposal, now = new Date().toISOString() }) {
  const practiceRoot = path.resolve(root ?? defaultPracticeRoot());
  await assertV2("practice-change.schema.json", proposal);
  if (!proposal.sanitization.reviewed) {
    throw new Error("Practice change must record a completed sanitization review.");
  }
  const manifestPath = resolveInside(practiceRoot, ".silver/practice.yaml");
  const manifest = parse(await readUtf8(manifestPath));
  await assertV2("practice.schema.json", manifest);
  if (manifest.revision !== proposal.expected_practice_revision) {
    throw new Error(
      `Stale practice proposal: expected ${proposal.expected_practice_revision}, found ${manifest.revision}.`,
    );
  }
  const next = nextRevision(manifest.revision);
  const practicePath = resolveInside(practiceRoot, "PRACTICE.md");
  const current = await readUtf8(practicePath);

  // A section that has a real file has to be written to that file. `studio-voice`
  // was accepted by the change contract in 0.7 and appended as prose to
  // PRACTICE.md, which `resolveStudioVoice` never reads — so changing your voice
  // through the sanctioned path validated, committed, reported success, and did
  // nothing. Prose in PRACTICE.md is the record of a change, not the mechanism.
  const routedPaths = [];
  for (const item of proposal.updates) {
    if (item.section !== "studio-voice") continue;
    const voicePath = resolveInside(practiceRoot, PRACTICE_STUDIO_VOICE_FILE);
    await writeUtf8(
      voicePath,
      [
        "---",
        `schema: ${STUDIO_VOICE_SCHEMA}`,
        `id: ${manifest.id}-studio-voice`,
        `title: ${proposal.summary}`,
        `revision: ${next}`,
        "---",
        "",
        item.content.trim(),
        "",
      ].join("\n"),
    );
    manifest.studio_voice = PRACTICE_STUDIO_VOICE_FILE;
    routedPaths.push(PRACTICE_STUDIO_VOICE_FILE);
  }

  const update = [
    "",
    `## Revision ${next}: ${proposal.summary}`,
    "",
    `Reason: ${proposal.reason}`,
    "",
    ...proposal.updates.flatMap((item) =>
      item.section === "studio-voice"
        ? [
            "### Studio voice",
            "",
            `Written to \`${PRACTICE_STUDIO_VOICE_FILE}\`. Run \`silver repair\` in a`,
            "workspace to carry it in.",
            "",
          ]
        : [
            `### ${item.section[0].toUpperCase()}${item.section.slice(1)}`,
            "",
            item.content,
            "",
          ],
    ),
  ].join("\n");
  await writeUtf8(practicePath, `${current.trimEnd()}\n${update}`);
  const decisionPath = `decisions/${proposal.id}-${next}.md`;
  await writeNewFile(
    resolveInside(practiceRoot, decisionPath),
    `# ${proposal.summary}\n\nRevision: ${next}\n\nReason: ${proposal.reason}\n\nSanitization reviewed: yes\n`,
  );
  manifest.revision = next;
  manifest.updated_at = now;
  manifest.backup = await backupState(practiceRoot, now);
  await assertV2("practice.schema.json", manifest);
  await writeUtf8(manifestPath, stringify(manifest));
  const commit = await commitPractice(
    practiceRoot,
    `Update My Practice: ${proposal.summary}`,
    ["PRACTICE.md", decisionPath, ".silver/practice.yaml", ...routedPaths],
  );
  return {
    root: practiceRoot,
    revision: next,
    commit,
    backup: manifest.backup,
    ...(routedPaths.length > 0 ? { written: routedPaths } : {}),
  };
}
