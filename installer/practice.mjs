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
  const update = [
    "",
    `## Revision ${next}: ${proposal.summary}`,
    "",
    `Reason: ${proposal.reason}`,
    "",
    ...proposal.updates.flatMap((item) => [
      `### ${item.section[0].toUpperCase()}${item.section.slice(1)}`,
      "",
      item.content,
      "",
    ]),
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
    ["PRACTICE.md", decisionPath, ".silver/practice.yaml"],
  );
  return { root: practiceRoot, revision: next, commit, backup: manifest.backup };
}
