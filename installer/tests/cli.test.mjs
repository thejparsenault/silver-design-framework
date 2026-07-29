import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { renderBrandMark } from "../brand.mjs";
import { runCli } from "../cli.mjs";

const trueColorTerminal = { isTTY: true, colorDepth: 24 };

test("terminal mark selects contrast-safe silver tones", async () => {
  const dark = await renderBrandMark({
    terminal: trueColorTerminal,
    env: { COLORFGBG: "15;0" },
  });
  const light = await renderBrandMark({
    terminal: trueColorTerminal,
    env: { COLORFGBG: "0;15" },
  });
  const unknown = await renderBrandMark({
    terminal: trueColorTerminal,
    env: {},
  });
  const plain = await renderBrandMark({
    terminal: { isTTY: false, colorDepth: 0 },
    env: {},
  });
  const noColor = await renderBrandMark({
    terminal: trueColorTerminal,
    env: { COLORFGBG: "15;0", NO_COLOR: "" },
  });

  assert.match(dark, /^\u001B\[38;2;199;203;209m/);
  assert.match(light, /^\u001B\[38;2;91;96;104m/);
  assert.match(unknown, /^\u001B\[38;2;116;119;123m/);
  assert.match(dark, /\u001B\[0m$/);
  assert.doesNotMatch(plain, /\u001B\[/);
  assert.doesNotMatch(noColor, /\u001B\[/);
  assert.equal(plain.split("\n").length, 23);
  assert.ok(plain.split("\n").every((line) => line.length === 46));
});

test("setup displays the mark and completes a guarded what-now invocation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-cli-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  const stdout = [];
  const stderr = [];
  const code = await runCli(
    [
      "setup",
      root,
      "--name",
      "Branded Setup",
      "--id",
      "branded-setup",
    ],
    {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
      terminal: trueColorTerminal,
      env: { COLORFGBG: "15;0" },
      now: () => new Date("2026-07-28T19:00:00.000Z"),
    },
  );

  assert.equal(code, 0);
  assert.deepEqual(stderr, []);
  assert.match(stdout[0], /^\u001B\[38;2;199;203;209m\*/);
  assert.ok(stdout.includes("What Now recommends:"));
  assert.ok(stdout.includes("No recommendation was started automatically."));
  const result = JSON.parse(
    await readFile(
      path.join(
        root,
        ".silver/results/skills/what-now-after-setup-20260728t190000000z.json",
      ),
      "utf8",
    ),
  );
  assert.equal(result.skill.id, "what-now");
  assert.equal(result.execution.status, "complete");
  assert.ok(result.recommended_next_actions.length >= 3);
  assert.ok(
    result.recommended_next_actions.every(
      ({ automatic }) => automatic === false,
    ),
  );

  const jsonStdout = [];
  const jsonCode = await runCli(["setup", root, "--json"], {
    stdout: (message) => jsonStdout.push(message),
    stderr: (message) => stderr.push(message),
    terminal: trueColorTerminal,
    env: { COLORFGBG: "15;0" },
    now: () => new Date("2026-07-28T19:00:01.000Z"),
  });
  assert.equal(jsonCode, 0);
  assert.equal(jsonStdout.length, 1);
  assert.doesNotMatch(jsonStdout[0], /\u001B\[/);
  const jsonResult = JSON.parse(jsonStdout[0]);
  assert.equal(jsonResult.whatNow.result.skill.id, "what-now");
  assert.equal(jsonResult.whatNow.analysis.schema, "silver/what-now-analysis/v1");
});
