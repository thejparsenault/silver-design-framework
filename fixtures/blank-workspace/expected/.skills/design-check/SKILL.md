---
name: silver-design-check
description: Discover and run applicable independent design checks for a declared target and policy, preserve every result, and summarize coverage. Use for conformance, browser, accessibility, responsive, interaction, provenance, asset, presentation, and production readiness checks.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Check design

## Workflow

1. Discover checks applicable to the declared target and policy profile.
2. Run each checker independently and preserve its normalized result.
3. Report unavailable required targets or providers as not-run.
4. Summarize coverage and recommend corrections without performing design work.

Run the guarded fast suite through the CLI. It executes every declared fast
checker, persists one evidence file per checker, and records the normalized
design-check skill result:

```sh
.silver/bin/silver invoke --scaffold design-check .
.silver/bin/silver invoke design-check <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

When a declared render target also needs live browser verification, run the
browser suite separately after the fast suite:

```sh
.silver/bin/silver check --browser .
```

Chrome/Chromium is the default deterministic provider. An explicitly selected
CLI adapter such as Ego Lite runs only through its declared adapter contract;
Silver never treats it as a Chrome executable. For an MCP or host-native
browser, prepare the exact inspection plan, call the selected browser tool,
return normalized observations, then complete the check:

```sh
.silver/bin/silver check --browser --browser-provider <provider-id> --prepare . --json
# Run the returned plan with the selected provider and save its
# silver/browser-check-observation/v1 response outside the workspace.
.silver/bin/silver check --browser --browser-provider <provider-id> --complete /tmp/browser-observations.json .
```

The observation must echo the prepared plan, its run ID, workspace digest, and
all target/viewport measurements. A changed workspace, replayed plan, partial
coverage, or provider mismatch is rejected rather than converted to a pass.

The browser suite reports `not-run` when Chrome, the selected provider, or a target is unavailable,
`error` when the browser/checking mechanism cannot complete, and `fail` only
when completed accessibility, responsive, or interaction checks find defects.

## Done

- Satisfy: checks-independent, results-preserved, not-run-never-pass.
- Evaluate quality: The summary names requested, completed, failed, and unavailable coverage without changing the target.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not fix designs or code as part of a check invocation.
- Never collapse failed, errored, or not-run results into a passing suite.
