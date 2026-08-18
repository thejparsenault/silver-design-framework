// Coverage for W7's declared-support model: providers now *declare* which
// activities they serve rather than having it derived purely from
// capabilities/directions/artifact-kinds, and `auditProviderActivities` is
// the guarantee that replaces the drift-proofing the pure derivation used to
// give for free.
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { parse } from "yaml";

import {
  auditProviderActivities,
  loadActivityCatalog,
  providerSupportsActivity,
} from "../runtime/activities.mjs";
import { discoverProviders } from "../runtime/providers.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");
const emptyHome = path.join(repositoryRoot, "fixtures/host/empty");

function provider(overrides = {}) {
  return {
    id: "test-provider",
    capabilities: ["design-file"],
    directions: ["read", "write"],
    activities: [],
    ...overrides,
  };
}

test("shipped providers and catalog carry no drift", async () => {
  const catalog = await loadActivityCatalog();
  const providers = await discoverProviders({ home: emptyHome });
  assert.deepEqual(auditProviderActivities({ catalog, providers }), []);
});

test("a declared activity id that does not exist in the catalog is drift", async () => {
  const catalog = await loadActivityCatalog();
  const findings = auditProviderActivities({
    catalog,
    providers: [
      provider({ activities: [{ id: "design.does-not-exist", support: "full", actions: ["read"] }] }),
    ],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /does not exist in the activity catalog/);
});

test("declaring an activity whose capability the provider does not hold is drift", async () => {
  const catalog = await loadActivityCatalog();
  const findings = auditProviderActivities({
    catalog,
    providers: [
      provider({
        capabilities: ["browser"],
        activities: [{ id: "design.pull-file", support: "full", actions: ["read", "inspect"] }],
      }),
    ],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /does not hold that capability/);
});

test("declaring an action the activity does not define is drift", async () => {
  const catalog = await loadActivityCatalog();
  const findings = auditProviderActivities({
    catalog,
    providers: [
      // design.pull-file only defines [read, inspect]; "delete" is not one of them.
      provider({ activities: [{ id: "design.pull-file", support: "full", actions: ["read", "delete"] }] }),
    ],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /which the activity does not define/);
});

test("providerSupportsActivity requires a declared entry, not just a matching capability", async () => {
  const catalog = await loadActivityCatalog();
  const activity = catalog.activities.find(({ id }) => id === "design.pull-file");
  // Holds the capability and satisfies the direction, but never declared the
  // activity — the pre-0.9 pure derivation would have matched this.
  const undeclaredButCapable = provider({ activities: [] });
  assert.equal(providerSupportsActivity(undeclaredButCapable, activity), false);

  const declared = provider({
    activities: [{ id: "design.pull-file", support: "full", actions: ["read", "inspect"] }],
  });
  assert.equal(providerSupportsActivity(declared, activity), true);
});

test("every activity carries a fallback, so there is always a Silver-native answer", async () => {
  const catalog = await loadActivityCatalog();
  for (const activity of catalog.activities) {
    assert.ok(activity.fallback, `${activity.id} has no fallback`);
    assert.ok(
      ["native", "input-required", "representational"].includes(activity.fallback.mode),
      `${activity.id}'s fallback.mode is not one of the three allowed values`,
    );
  }
});

test("the only internal activity is the one whose capability a declaration may never claim", async () => {
  const catalog = await loadActivityCatalog();
  const internal = catalog.activities.filter((activity) => activity.binding === "internal");
  assert.deepEqual(internal.map(({ id }) => id), ["artifact.write-canonical"]);
  assert.equal(internal[0].capability, "canonical-artifact");
});

test("silver-portable declares artifact.write-canonical directly rather than relying on a special case", async () => {
  // Internal activities are matched exactly like any other — the earlier
  // design (an unconditional `binding === "internal"` early return in
  // providerSupportsActivity) made every skill needing canonical-artifact
  // unrunnable, because nothing could ever match. silver-portable declaring
  // the activity normally is what makes it resolvable at all.
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      path.join(repositoryRoot, "framework/providers/silver-portable/provider.yaml"),
      "utf8",
    ),
  );
  const manifest = parse(source);
  assert.ok(
    manifest.activities.some((entry) => entry.id === "artifact.write-canonical"),
    "silver-portable must declare artifact.write-canonical",
  );
});
