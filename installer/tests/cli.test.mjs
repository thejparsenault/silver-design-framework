import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("chat-facing setup inspect/apply and trace commands use reviewed JSON plans", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-cli-guided-"));
  const practice = await mkdtemp(path.join(os.tmpdir(), "silver-cli-practice-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  t.after(() => rm(practice, { force: true, recursive: true }));
  const answersPath = path.join(root, "answers.json");
  await writeFile(
    answersPath,
    JSON.stringify({
      name: "Guided Product",
      id: "guided-product",
      team_shape: "solo",
      topology: "integrated",
      codebases: [root],
      practice_root: practice,
    }),
  );
  const inspection = [];
  const inspectCode = await runCli(
    ["setup", "inspect", root, "--answers", answersPath, "--json"],
    {
      stdout: (message) => inspection.push(message),
      now: () => new Date("2026-07-30T18:00:00.000Z"),
    },
  );
  assert.equal(inspectCode, 0);
  const plan = JSON.parse(inspection[0]);
  assert.equal(plan.schema, "silver/setup-plan/v1");
  assert.equal(plan.topology.recommended, "integrated");
  assert.deepEqual(plan.unresolved_questions, []);

  const planPath = path.join(practice, "setup-plan.json");
  await writeFile(planPath, JSON.stringify(plan));
  const application = [];
  const applyCode = await runCli(
    ["setup", "apply", planPath, "--json"],
    { stdout: (message) => application.push(message) },
  );
  assert.equal(applyCode, 0);
  assert.equal(JSON.parse(application[0]).plan, "setup-guided-product");
  await readFile(path.join(practice, "PRACTICE.md"), "utf8");

  const trace = [];
  const traceCode = await runCli(
    ["trace", "default-design-context", root, "--json"],
    { stdout: (message) => trace.push(message) },
  );
  assert.equal(traceCode, 0);
  const traceResult = JSON.parse(trace[0]);
  assert.equal(traceResult.target.revision, "r1");
  assert.equal(
    traceResult.trace_view,
    ".silver/results/traces/default-design-context.md",
  );
});

test("check rejects unknown ids and returns a distinct not-run exit code", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-cli-check-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await runCli(["setup", root, "--name", "Check CLI", "--id", "check-cli"], {
    stdout: () => {},
    stderr: () => {},
  });

  const unknownErrors = [];
  const unknownCode = await runCli(
    ["check", root, "--only", "not-a-check"],
    { stdout: () => {}, stderr: (message) => unknownErrors.push(message) },
  );
  assert.equal(unknownCode, 1);
  assert.match(unknownErrors.join("\n"), /Unknown fast check: not-a-check/);

  const emptyErrors = [];
  const emptyCode = await runCli(
    ["check", root, "--only", ","],
    { stdout: () => {}, stderr: (message) => emptyErrors.push(message) },
  );
  assert.equal(emptyCode, 1);
  assert.match(emptyErrors.join("\n"), /At least one fast check must be selected/);

  await rm(path.join(root, "design/system/tokens.json"), { force: true });
  const manifestPath = path.join(root, "design/manifest.yaml");
  await writeFile(
    manifestPath,
    (await readFile(manifestPath, "utf8")).replace(
      "policy_profile: prototype",
      "policy_profile: adoption",
    ),
  );
  const notRunCode = await runCli(
    ["check", root, "--only", "semantic-styles", "--json"],
    { stdout: () => {}, stderr: () => {} },
  );
  assert.equal(notRunCode, 2);
});
