import { access } from "node:fs/promises";
import path from "node:path";

import { runGit } from "./git.mjs";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function git(root, args, { allowFailure = false } = {}) {
  try {
    const result = await runGit(root, args);
    return result.stdout.trim();
  } catch (error) {
    if (allowFailure) return null;
    throw new Error(error.stderr?.trim() || error.message);
  }
}

// Can Git take this checkpoint right now?
//
// The checkpoint used to run only after canonical files were already written, so
// an environment that refused `.git/index.lock` left the outputs on disk, the
// command reporting failure, and an identical retry rejected for overwriting
// files the failed attempt had created. Asking first turns that into a clean
// refusal with nothing to undo.
export async function checkpointPreflight({ root, outputs }) {
  const workspace = path.resolve(root);
  const selected = [
    ...new Set(outputs.map(({ path: outputPath }) => outputPath)),
  ];
  if (!(await exists(path.join(workspace, ".git")))) {
    // Not a repository is a known, documented state rather than a failure: the
    // work is still written and the result records that no checkpoint exists.
    return { status: "ok", checkpointable: false };
  }
  if (await exists(path.join(workspace, ".git", "index.lock"))) {
    return {
      status: "blocked",
      message:
        "Git cannot commit right now because .git/index.lock exists; another Git process may be running. Remove the lock or wait for it to finish, then run this invocation again.",
    };
  }
  const overlapping = await git(
    workspace,
    ["diff", "--cached", "--name-only", "--", ...selected],
    { allowFailure: true },
  );
  if (overlapping) {
    return {
      status: "blocked",
      message: `Accepted paths already contain staged work (${overlapping
        .split("\n")
        .filter(Boolean)
        .join(", ")}); commit or unstage it before accepting this invocation.`,
    };
  }
  return { status: "ok", checkpointable: true };
}

export async function checkpointAcceptedOutputs({
  root,
  invocationId,
  outputs,
  now,
}) {
  const workspace = path.resolve(root);
  const selected = [...new Set(outputs.map(({ path: outputPath }) => outputPath))];
  const reason = outputs.some(({ kind }) => kind === "implementation-handoff")
    ? "implementation-handoff"
    : "accepted-artifact";
  const base = {
    schema: "silver/git-checkpoint/v1",
    id: `accepted-${invocationId}`,
    reason,
    created_at: now,
    paths: selected,
    status: "not-a-repository",
    commit: null,
    pushes: [],
    pull_requests: [],
    merges: [],
  };
  if (!(await exists(path.join(workspace, ".git")))) {
    return {
      ...base,
      message: "The workspace has no local Git repository.",
    };
  }
  const branch =
    (await git(workspace, ["rev-parse", "--abbrev-ref", "HEAD"], {
      allowFailure: true,
    })) ?? "unborn";
  const overlapping = await git(workspace, [
    "diff",
    "--cached",
    "--name-only",
    "--",
    ...selected,
  ]);
  if (overlapping) {
    return {
      ...base,
      branch,
      paths: overlapping.split("\n").filter(Boolean).sort(),
      status: "blocked",
      message:
        "Accepted paths already contain staged work; the local checkpoint was paused.",
    };
  }
  const changed = await git(workspace, [
    "status",
    "--porcelain",
    "--",
    ...selected,
  ]);
  if (!changed) {
    return {
      ...base,
      branch,
      status: "no-change",
      message: "No accepted output paths changed.",
    };
  }
  await git(workspace, ["add", "--", ...selected]);
  await git(workspace, [
    "-c",
    "user.name=Silver",
    "-c",
    "user.email=silver@local",
    "-c",
    "commit.gpgSign=false",
    "commit",
    "--only",
    "-m",
    `Silver checkpoint: ${invocationId}`,
    "--",
    ...selected,
  ]);
  const commit = await git(workspace, ["rev-parse", "HEAD"]);
  const committedPaths = (
    await git(workspace, [
      "show",
      "--pretty=format:",
      "--name-only",
      commit,
    ])
  ).split("\n").filter(Boolean).sort();
  return {
    ...base,
    branch:
      (await git(workspace, ["rev-parse", "--abbrev-ref", "HEAD"])) || branch,
    paths: committedPaths,
    status: "committed",
    commit,
  };
}
