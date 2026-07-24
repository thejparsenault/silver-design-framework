import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { setupWorkspace } from "../../installer/setup.mjs";

const run = promisify(execFile);

async function temporaryWorkspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "vertical-slice-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function runInstalled(root, relativeScript, args) {
  return run(process.execPath, [path.join(root, relativeScript), ...args], {
    cwd: root,
  });
}

test("blank workspace completes the first-iteration vertical slice", async (t) => {
  const root = await temporaryWorkspace(t);
  const setup = await setupWorkspace({
    root,
    name: "Campaign Studio",
    id: "campaign-studio",
    date: "2026-07-23",
    version: "0.1.0-alpha.1",
    sourceReference: "vertical-slice-fixture",
  });

  assert.equal(setup.recommendedNextActions.length, 3);
  await assert.rejects(
    access(path.join(root, "design", "flows", "campaign-setup", "flow.json")),
  );
  await assert.rejects(
    access(path.join(root, "prototypes", "campaign-setup", "prototype.yaml")),
  );

  const brandPath = path.join(root, "design", "brand.md");
  await writeFile(
    brandPath,
    `${await readFile(brandPath, "utf8")}
## Audience

Growth marketers coordinating multi-channel campaigns.

## Promise

Turn a complex launch into a calm, understandable sequence.

## Desired feeling

Confident, oriented, and in control.
`,
  );

  await runInstalled(
    root,
    ".skills/flow/scripts/init-flow.mjs",
    [
      "--root",
      root,
      "--id",
      "campaign-setup",
      "--title",
      "Campaign setup",
      "--purpose",
      "Help a marketer prepare a campaign without missing a required step.",
      "--outcome",
      "Campaign is ready for review",
      "--actor-id",
      "marketer",
      "--actor-name",
      "Growth marketer",
      "--date",
      "2026-07-23",
    ],
  );
  const flowPath = path.join(
    root,
    "design",
    "flows",
    "campaign-setup",
    "flow.json",
  );
  const flow = JSON.parse(await readFile(flowPath, "utf8"));
  flow.revision = 2;
  flow.status = "active";
  flow.updated = "2026-07-23";
  flow.nodes[0].title = "Choose campaign objective";
  flow.nodes[0].description =
    "Select the outcome this campaign should optimize.";
  flow.nodes.splice(1, 0, {
    id: "review",
    type: "screen",
    title: "Review campaign setup",
    actor: "marketer",
    description: "Confirm the objective, audience, channels, and schedule.",
  });
  flow.transitions = [
    {
      id: "review-setup",
      from: "start",
      to: "review",
      trigger: "Continue to review",
      actor: "marketer",
    },
    {
      id: "complete-flow",
      from: "review",
      to: "complete",
      trigger: "Mark ready",
      actor: "marketer",
    },
  ];
  await writeFile(flowPath, `${JSON.stringify(flow, null, 2)}\n`);
  await runInstalled(
    root,
    ".skills/flow/scripts/render-flow.mjs",
    ["design/flows/campaign-setup/flow.json"],
  );

  await runInstalled(
    root,
    ".skills/prototype/scripts/init-prototype.mjs",
    [
      "--root",
      root,
      "--id",
      "campaign-setup",
      "--title",
      "Campaign setup walkthrough",
      "--question",
      "Can a marketer understand what remains before review?",
      "--flow-ref",
      "campaign-setup@2=design/flows/campaign-setup/flow.json",
      "--date",
      "2026-07-23",
    ],
  );
  await runInstalled(
    root,
    ".skills/prototype/scripts/render-static-prototype.mjs",
    [
      "--root",
      root,
      "--prototype",
      "prototypes/campaign-setup",
      "--flow",
      "design/flows/campaign-setup/flow.json",
    ],
  );
  await assert.rejects(
    runInstalled(
      root,
      ".skills/prototype/scripts/render-static-prototype.mjs",
      [
        "--root",
        root,
        "--prototype",
        "prototypes/campaign-setup",
        "--flow",
        "design/flows/campaign-setup/flow.json",
      ],
    ),
    /Refusing to replace existing render files/,
  );

  const { stdout } = await runInstalled(
    root,
    ".skills/design-check/scripts/run-fast.mjs",
    ["--root", root],
  );
  const result = JSON.parse(stdout);
  assert.equal(result.status, "pass");
  assert.ok(
    result.results.every(({ status }) => status === "pass"),
  );
  await access(
    path.join(root, "reference-system", "packages", "css", "src", "ds.css"),
  );
  assert.match(
    await readFile(
      path.join(root, "prototypes", "campaign-setup", "index.html"),
      "utf8",
    ),
    /Review campaign setup/,
  );
  assert.match(
    await readFile(
      path.join(root, "design", "flows", "campaign-setup", "flow.mmd"),
      "utf8",
    ),
    /revision 2/,
  );
});
