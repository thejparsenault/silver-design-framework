import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { parse } from "yaml";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const skillsRoot = path.join(repositoryRoot, "framework", "skills");

async function loadSkills() {
  const entries = (
    await readdir(skillsRoot, { withFileTypes: true })
  ).filter((entry) => entry.isDirectory());
  return Promise.all(
    entries.map(async (entry) =>
      parse(await readFile(path.join(skillsRoot, entry.name, "skill.yaml"), "utf8")),
    ),
  );
}

// The gap this test exists to catch: `evidence` was a required input to
// `synthesize` and produced by no skill in the framework, until `collect`
// was added in Silver 0.9's W10. A required input with no producer is a
// contract nobody can satisfy — this holds the framework to never growing
// another one silently.
// Seeded workspace configuration, not design-loop output — authored by
// `silver setup`/`silver link`, never a skill's declared output.
const infrastructureKinds = new Set(["design-context"]);

test("every artifact kind required as an input by some skill is produced as an output by at least one skill", async () => {
  const skills = await loadSkills();
  const producedKinds = new Set(
    skills.flatMap((skill) => (skill.outputs ?? []).map(({ kind }) => kind)),
  );
  const missing = [];
  for (const skill of skills) {
    for (const input of skill.inputs ?? []) {
      if (!input.required || infrastructureKinds.has(input.kind)) continue;
      if (!producedKinds.has(input.kind)) {
        missing.push(`${skill.id} requires "${input.kind}", which no skill produces.`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("collect produces the evidence kind synthesize requires", async () => {
  const skills = await loadSkills();
  const collect = skills.find(({ id }) => id === "collect");
  const synthesize = skills.find(({ id }) => id === "synthesize");
  assert.ok(collect.outputs.some(({ kind }) => kind === "evidence"));
  assert.ok(
    synthesize.inputs.some(({ kind, required }) => kind === "evidence" && required),
  );
});
