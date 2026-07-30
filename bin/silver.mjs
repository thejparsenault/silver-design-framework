#!/usr/bin/env node

// Fail with an explanation rather than a syntax error on older runtimes. The
// installer uses import.meta.dirname, which landed in Node 20.11.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 11)) {
  console.error(
    [
      `Silver needs Node.js 20.11 or newer; this is ${process.versions.node}.`,
      "",
      "Install a supported Node.js, then run this command again:",
      "  macOS with Homebrew:  brew install node",
      "  macOS/Windows:        download the LTS installer from https://nodejs.org",
      "  Linux with a manager: https://nodejs.org/en/download/package-manager",
      "",
      "Verify with `node --version` before continuing.",
    ].join("\n"),
  );
  process.exit(1);
}

const { runCli } = await import("../installer/cli.mjs");

process.exitCode = await runCli(process.argv.slice(2));
