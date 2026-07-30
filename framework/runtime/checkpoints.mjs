import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

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
    const result = await run("git", ["-C", root, ...args], {
      encoding: "utf8",
    });
    return result.stdout.trim();
  } catch (error) {
    if (allowFailure) return null;
    throw new Error(error.stderr?.trim() || error.message);
  }
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
