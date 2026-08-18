import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const GIT_TIMEOUT_MS = 30000;

// Silver only performs local repository operations. They must never wait for
// credentials or an interactive helper, and a hook or Git configuration must
// not be able to hold a framework invocation open forever.
export function runGit(root, args, options = {}) {
  return run("git", ["-C", root, ...args], {
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    killSignal: "SIGKILL",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "Never",
      ...(options.env ?? {}),
    },
  });
}
