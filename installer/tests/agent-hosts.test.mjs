// Regression coverage for the two defects that made a 0.5 workspace unusable
// from Claude Code: the installed runtime could not resolve its dependencies,
// and nothing Claude Code reads pointed at the framework.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  CLAUDE_BLOCK_BEGIN,
  CLAUDE_MEMORY_PATH,
  LAUNCHER_PATH,
} from "../agent-adapters.mjs";
import { doctorWorkspace } from "../doctor.mjs";
import { repairWorkspace } from "../repair.mjs";
import { setupWorkspace } from "../setup.mjs";
import { SCAFFOLD_PLACEHOLDER } from "../invoke.mjs";

const run = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const cli = path.join(repositoryRoot, "bin", "silver.mjs");

// os.tmpdir() has no ancestor node_modules, which is exactly the condition the
// packaged smoke test cannot reproduce: it installs into a consumer directory
// whose node_modules sits above the workspace and masks the resolution failure.
async function isolatedWorkspace(t, name = "isolated-product") {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-host-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  await setupWorkspace({ root, name, id: name });
  return root;
}

async function silver(args, options = {}) {
  return run(process.execPath, [cli, ...args], {
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

test("a workspace outside any node_modules tree can run its own skills", async (t) => {
  const root = await isolatedWorkspace(t);

  // The unguarded shim still cannot resolve ajv/yaml from here. It must say so
  // and name the fix rather than emitting a bare ERR_MODULE_NOT_FOUND.
  const shim = path.join(root, ".skills", "brand", "scripts", "invoke.mjs");
  const shimFailure = await run(process.execPath, [shim, "missing.json"], {
    cwd: root,
  }).then(
    () => null,
    (error) => error,
  );
  assert.ok(shimFailure, "the shim should fail in an isolated workspace");
  assert.match(shimFailure.stderr, /silver invoke --scaffold brand/);
  assert.doesNotMatch(shimFailure.stderr, /^Error \[ERR_MODULE_NOT_FOUND\]/m);

  // The CLI resolves the runtime because it runs from the Silver installation.
  const whatNow = await silver(["what-now", root]);
  assert.match(whatNow.stdout, /What Now recommends:/);
  assert.match(whatNow.stdout, /No recommendation was started automatically\./);

  // Dependency-free checks keep working directly, as designed.
  const fast = await run(
    process.execPath,
    [path.join(root, ".skills/design-check/scripts/run-fast.mjs"), "--root", "."],
    { cwd: root, maxBuffer: 10 * 1024 * 1024 },
  ).catch((error) => error);
  assert.doesNotMatch(String(fast.stderr ?? ""), /ERR_MODULE_NOT_FOUND/);

  // The generated launcher is the sanctioned entry point from inside the tree.
  const launcher = await run(path.join(root, LAUNCHER_PATH), ["doctor", root]).catch(
    (error) => error,
  );
  assert.match(String(launcher.stdout ?? ""), /Workspace/);
});

test("scaffolded requests round-trip through the guarded runtime", async (t) => {
  const root = await isolatedWorkspace(t, "scaffold-product");

  const { stdout } = await silver(["invoke", "--scaffold", "brand", root]);
  const scaffold = JSON.parse(stdout);
  assert.equal(scaffold.schema, "silver/skill-invocation/v2");
  assert.equal(scaffold.skill.id, "brand");
  assert.equal(scaffold.provenance.acceptance, "awaiting-review");
  // design/brand.md is seeded, so overwriting it requires a matching integrity.
  const brandOutput = scaffold.outputs.find(
    ({ reference }) => reference.path === "design/brand.md",
  );
  assert.match(brandOutput.expected_integrity, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(
    scaffold.checks.map(({ id }) => id),
    ["contract-integrity", "evidence-provenance"],
  );

  const requestPath = path.join(root, "request.json");
  await writeFile(requestPath, stdout);
  const refused = await silver(["invoke", "brand", requestPath, root]).then(
    () => null,
    (error) => error,
  );
  assert.ok(refused, "an unmodified scaffold must be refused");
  assert.match(refused.stderr, new RegExp(SCAFFOLD_PLACEHOLDER));

  scaffold.outputs = [brandOutput];
  scaffold.outputs[0].reference.id = "scaffold-product-brand";
  scaffold.outputs[0].content.value =
    "---\nkind: brand\nid: scaffold-product-brand\nstatus: draft\nrevision: r1\nscope: product\nauthority: canonical\n---\n\n# Brand\n\nAudience: teams adopting Silver.\n";
  scaffold.provenance.change.reason = "Record the initial brand foundation.";
  await writeFile(requestPath, JSON.stringify(scaffold, null, 2));

  const { stdout: invoked } = await silver(["invoke", "brand", requestPath, root]);
  assert.match(invoked, /WROTE design\/brand\.md/);
  assert.match(
    await readFile(path.join(root, "design", "brand.md"), "utf8"),
    /Audience: teams adopting Silver\./,
  );
});

test("setup generates the Claude Code adapters and repair restores them", async (t) => {
  const root = await isolatedWorkspace(t, "adapter-product");

  // Claude Code reads CLAUDE.md, not AGENTS.md.
  const memory = await readFile(path.join(root, CLAUDE_MEMORY_PATH), "utf8");
  assert.match(memory, /^@AGENTS\.md$/m);
  assert.ok(memory.includes(CLAUDE_BLOCK_BEGIN));

  // Claude Code discovers skills only under .claude/skills.
  const link = path.join(root, ".claude", "skills", "brand");
  assert.equal((await lstat(link)).isSymbolicLink(), true);
  assert.equal(await readlink(link), "../../.skills/brand");
  assert.match(
    await readFile(path.join(link, "SKILL.md"), "utf8"),
    /^name: brand$/m,
  );

  await rm(link, { force: true, recursive: true });
  await rm(path.join(root, LAUNCHER_PATH), { force: true });
  const broken = await doctorWorkspace({ root });
  assert.ok(
    broken.diagnostics.some(({ code }) => code === "claude-skill-links-missing"),
  );
  assert.ok(broken.diagnostics.some(({ code }) => code === "launcher-missing"));

  await repairWorkspace({ root });
  const repaired = await doctorWorkspace({ root });
  assert.equal(
    repaired.diagnostics.some(({ code }) =>
      ["claude-skill-links-missing", "launcher-missing"].includes(code),
    ),
    false,
  );
});

test("a project-owned CLAUDE.md keeps its content", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-owned-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  const owned = "# House rules\n\nAlways run `make lint` before committing.\n";
  await writeFile(path.join(root, CLAUDE_MEMORY_PATH), owned);

  // An agent instruction file must not make setup treat the folder as an
  // existing codebase it refuses to touch.
  await setupWorkspace({ root, name: "Owned Memory", id: "owned-memory" });

  const merged = await readFile(path.join(root, CLAUDE_MEMORY_PATH), "utf8");
  assert.ok(merged.includes(owned.trim()), "project-owned content is preserved");
  assert.match(merged, /^@AGENTS\.md$/m);

  // Repair refreshes Silver's block without disturbing the owned content.
  await repairWorkspace({ root });
  const afterRepair = await readFile(path.join(root, CLAUDE_MEMORY_PATH), "utf8");
  assert.ok(afterRepair.includes(owned.trim()));
  assert.equal(
    afterRepair.split(CLAUDE_BLOCK_BEGIN).length - 1,
    1,
    "repair must not duplicate the Silver block",
  );
});

test("setup apply reads a plan from stdin so no file lands in the target", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-stdin-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  // A realistic existing product, which plain `silver setup` refuses.
  await writeFile(path.join(root, "package.json"), "{}\n");

  const answers = '{"team_shape":"solo","topology":"integrated"}';
  const { stdout: plan } = await silver([
    "setup",
    "inspect",
    root,
    "--answers",
    answers,
    "--json",
  ]);

  // Writing that plan inside the target invalidates it: state integrity covers
  // the whole directory, so the plan changes the thing it describes.
  const insidePath = path.join(root, "silver-plan.json");
  await writeFile(insidePath, plan);
  const stale = await silver(["setup", "apply", insidePath, "--json"]).then(
    () => null,
    (error) => error,
  );
  assert.ok(stale, "a plan written inside the target must be rejected");
  assert.match(stale.stderr, /stale because the inspected target changed/);
  await rm(insidePath, { force: true });

  // Piping avoids the trap entirely.
  const applied = await new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [cli, "setup", "apply", "-", "--json"],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
    child.stdin.end(plan);
  });
  assert.equal(JSON.parse(applied).schema, "silver/setup-application/v1");
  assert.match(
    await readFile(path.join(root, "CLAUDE.md"), "utf8"),
    /^@AGENTS\.md$/m,
  );
  // The product's own files are untouched.
  assert.equal(await readFile(path.join(root, "package.json"), "utf8"), "{}\n");
});

test("setup refuses to apply while topology is unanswered", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "silver-unanswered-"));
  t.after(() => rm(root, { force: true, recursive: true }));

  const { stdout: plan } = await silver(["setup", "inspect", root, "--json"]);
  const parsed = JSON.parse(plan);
  assert.equal(parsed.unresolved_questions.length, 2);
  assert.equal(parsed.topology.recommended, "integrated");

  const refused = await new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [cli, "setup", "apply", "-", "--json"],
      (error, stdout, stderr) => resolve({ error, stderr }),
    );
    child.stdin.end(plan);
  });
  assert.ok(refused.error, "a human must confirm topology before apply");
  assert.match(refused.stderr, /still has unresolved questions/);
});

test("the launcher adapts to how the CLI was delivered", async () => {
  const { isEphemeralInstall, renderLauncher } = await import(
    "../agent-adapters.mjs"
  );
  const stable = "/opt/silver/bin/silver.mjs";
  assert.equal(isEphemeralInstall(stable), false);
  assert.match(renderLauncher(stable), /^exec node "\/opt\/silver/m);

  // npx unpacks into a cache npm garbage-collects, so an absolute path rots.
  const ephemeral = path.join(
    os.homedir(),
    ".npm",
    "_npx",
    "4a91d615c2059338",
    "node_modules",
    "silver-design-framework",
    "bin",
    "silver.mjs",
  );
  assert.equal(isEphemeralInstall(ephemeral), true);
  const { PACKAGE_SPEC, RELEASE_TARBALL_URL } = await import("../version.mjs");
  assert.match(
    renderLauncher(ephemeral),
    new RegExp(`^exec npx --yes ${PACKAGE_SPEC.replace(".", "\\.")} "\\$@"$`, "m"),
  );
  // Both published channels must describe the same exact version.
  assert.match(PACKAGE_SPEC, /^silver-design-framework@\d+\.\d+\.\d+$/);
  assert.match(
    RELEASE_TARBALL_URL,
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/v\d+\.\d+\.\d+\/silver-design-framework-\d+\.\d+\.\d+\.tgz$/,
  );
});
