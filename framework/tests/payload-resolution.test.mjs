import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { payloadPath, payloadRoot } from "../runtime/payload.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

test("a source or npm install resolves the payload beside the runtime", () => {
  assert.equal(payloadRoot(), repositoryRoot);
  assert.equal(
    payloadPath("framework/schemas/v2", import.meta.url),
    path.join(repositoryRoot, "framework/schemas/v2"),
  );
});

// Every payload lookup the runtime makes, and where each one has to land in a
// workspace. `.silver/` mirrors the payload with the leading `framework/`
// segment dropped, so all five map by the same rule.
const payloadLookups = [
  ["framework/schemas/v2", "schemas/v2"],
  ["framework/schemas", "schemas"],
  ["framework/guardrails/registry.yaml", "guardrails/registry.yaml"],
  ["framework/activities/catalog.yaml", "activities/catalog.yaml"],
  ["framework/providers", "providers"],
  ["framework/transports", "transports"],
];

// Commit ff05caa moved the runtime's payload lookups from module-relative
// self-location to `installer/payload.mjs`, which is never copied into a
// workspace — and the mirror's resolution silently died. The second argument
// every caller already passed was ignored. This holds it implemented.
test("the runtime mirror resolves its payload relative to the calling module", async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "silver-mirror-"));
  const silver = path.join(workspace, ".silver");
  const runtime = path.join(silver, "runtime");
  await mkdir(runtime, { recursive: true });
  await copyFile(
    path.join(repositoryRoot, "framework/runtime/payload.mjs"),
    path.join(runtime, "payload.mjs"),
  );
  for (const [, mirrored] of payloadLookups) {
    const absolute = path.join(silver, mirrored);
    await mkdir(path.dirname(absolute), { recursive: true });
    if (path.extname(absolute)) {
      await writeFile(absolute, "");
    } else {
      await mkdir(absolute, { recursive: true });
    }
  }

  const mirrored = await import(pathToFileURL(path.join(runtime, "payload.mjs")));
  const callerUrl = pathToFileURL(path.join(runtime, "contracts.mjs")).href;
  for (const [lookup, expected] of payloadLookups) {
    assert.equal(
      mirrored.payloadPath(lookup, callerUrl),
      path.join(silver, expected),
      lookup,
    );
  }

  // Without the caller's module URL there is nothing to resolve against, so the
  // lookup stays on the payload root rather than guessing.
  assert.notEqual(
    mirrored.payloadPath("framework/schemas/v2"),
    path.join(silver, "schemas/v2"),
  );
  t.diagnostic(`mirror fixture: ${workspace}`);
});

// The fallback is a fallback. When the payload root resolves, the module URL is
// never consulted — so an installer module passing its own URL cannot be
// dragged off a path that exists.
test("a resolvable payload root wins over the module-relative fallback", () => {
  assert.equal(
    payloadPath("installer/templates/blank-workspace", import.meta.url),
    path.join(repositoryRoot, "installer/templates/blank-workspace"),
  );
});
