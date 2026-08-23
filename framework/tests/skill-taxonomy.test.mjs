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

// 0.9 moved the canonical layout from `reference-system/` to `design/system/`,
// but `theme` kept declaring its `token-source` output at the retired path, so
// every theme invocation that wrote tokens where they actually live was refused
// before mutation. Nothing in the framework should name the retired layout in a
// live contract again.
test("no skill contract declares an output or effect under the retired reference-system layout", async () => {
  const skills = await loadSkills();
  const offenders = [];
  for (const skill of skills) {
    for (const output of skill.outputs ?? []) {
      if (output.path_pattern?.startsWith("reference-system")) {
        offenders.push(`${skill.id}: outputs[${output.kind}].path_pattern`);
      }
    }
    for (const effect of skill.effects ?? []) {
      for (const declared of effect.paths ?? []) {
        if (declared.startsWith("reference-system")) {
          offenders.push(`${skill.id}: effects[${effect.capability}].paths`);
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});

// The specific refusal the contract drift produced:
//   Skill theme cannot produce token-source at
//   design/system/tokens/primitive/<theme>.tokens.json
test("theme declares its token-source output where buildDesignSystemTokens writes", async () => {
  const theme = (await loadSkills()).find((skill) => skill.id === "theme");
  const tokenSource = theme.outputs.find(({ kind }) => kind === "token-source");
  assert.equal(tokenSource.path_pattern, "design/system/tokens/**");
});
