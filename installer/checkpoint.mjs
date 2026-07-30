import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { assertV2 } from "../framework/runtime/contracts.mjs";
import { exists, resolveInside, writeUtf8 } from "./lib/files.mjs";

const run = promisify(execFile);

async function git(root, args, { allowFailure = false } = {}) {
  try {
    const result = await run("git", ["-C", root, ...args], { encoding: "utf8" });
    return result.stdout.trim();
  } catch (error) {
    if (allowFailure) return null;
    throw new Error(error.stderr?.trim() || error.message);
  }
}

export async function createCheckpoint({
  root,
  id,
  reason,
  paths,
  now = new Date().toISOString(),
}) {
  const workspace = path.resolve(root);
  const normalized = [...new Set(paths)].map((item) => {
    resolveInside(workspace, item);
    return item.split(path.sep).join("/");
  });
  let status = "committed";
  let commit = null;
  let message;
  let branch;
  let recordedPaths = normalized;
  if (!(await exists(path.join(workspace, ".git")))) {
    status = "not-a-repository";
    message = "The workspace has no local Git repository.";
  } else {
    branch = await git(workspace, ["rev-parse", "--abbrev-ref", "HEAD"], {
      allowFailure: true,
    }) ?? "unborn";
    const changed = await git(workspace, ["status", "--porcelain", "--", ...normalized]);
    if (!changed) {
      status = "no-change";
      message = "No selected paths changed.";
    } else {
      const tracked = await git(
        workspace,
        ["diff", "--name-only", "HEAD", "--", ...normalized],
        { allowFailure: true },
      );
      const untracked = await git(workspace, [
        "ls-files",
        "--others",
        "--exclude-standard",
        "--",
        ...normalized,
      ]);
      recordedPaths = [
        ...new Set(
          `${tracked ?? ""}\n${untracked}`
            .split("\n")
            .filter(Boolean),
        ),
      ].sort();
      const overlapping = await git(workspace, [
        "diff",
        "--cached",
        "--name-only",
        "--",
        ...normalized,
      ]);
      if (overlapping) {
        status = "blocked";
        recordedPaths = overlapping.split("\n").filter(Boolean).sort();
        message =
          "Selected paths already contain staged work; checkpoint creation paused to preserve the existing index.";
      } else {
        await git(workspace, ["add", "--", ...recordedPaths]);
        await git(workspace, [
          "-c",
          "user.name=Silver",
          "-c",
          "user.email=silver@local",
          "commit",
          "--only",
          "-m",
          `Silver checkpoint: ${id}`,
          "--",
          ...recordedPaths,
        ]);
        commit = await git(workspace, ["rev-parse", "HEAD"]);
        branch = await git(workspace, ["rev-parse", "--abbrev-ref", "HEAD"]);
        recordedPaths = (
          await git(workspace, [
            "show",
            "--pretty=format:",
            "--name-only",
            commit,
          ])
        ).split("\n").filter(Boolean).sort();
      }
    }
  }
  const record = {
    schema: "silver/git-checkpoint/v1",
    id,
    reason,
    created_at: now,
    paths: recordedPaths,
    status,
    commit,
    ...(branch ? { branch } : {}),
    pushes: [],
    pull_requests: [],
    merges: [],
    ...(message ? { message } : {}),
  };
  await assertV2("git-checkpoint.schema.json", record);
  const recordPath = resolveInside(
    workspace,
    `.silver/results/checkpoints/${id}.json`,
  );
  await writeUtf8(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
