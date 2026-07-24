# First-iteration acceptance audit

**Candidate:** `0.1.0-alpha.1`  
**Scope:** Blank-workspace MVP defined in `silver_design_framework_prd.md`

## Acceptance evidence

1. **Initialize a blank temporary directory without manual copying — pass**
   - `installer/tests/installer.test.mjs` verifies the complete exact output.
   - `installer/tests/package-smoke.mjs` repeats setup from the packed package
     outside the source checkout.
2. **Re-running setup makes no unintended changes — pass**
   - The installer idempotence test compares complete before/after snapshots
     while preserving edits to canonical guidance and the reference system.
3. **A fixture-release update is reviewable and preserves owned edits — pass**
   - Update tests replace a clean managed skill, preserve edited design and
     reference files, report the changed copied-owned package as a proposal,
     prove repeated updates are idempotent, and stop before managed conflicts.
4. **The manifest and generated index expose canonical artifacts — pass**
   - Exact-output tests cover both files; doctor and the artifact checker verify
     mappings, metadata agreement, required files, and installed skill discovery.
5. **Skills are workspace-local and declare capabilities and permissions — pass**
   - Setup installs the five packages only under `.skills/`.
   - Contract validation and the skill-package validator cover their
     machine-readable declarations.
6. **Brand, optional theme, flow, and constrained prototype work are possible — pass**
   - The vertical-slice test refines brand guidance, authors and revises a flow,
     renders its Mermaid view, pins revision 2, and renders an editable static
     prototype using the reference system.
   - Theme application remains optional; the theme skill and validated token
     build provide that path without making it a setup side effect.
7. **Fast checks reject raw values and malformed artifacts — pass**
   - Independent negative tests cover raw color and dimension literals,
     malformed canonical metadata, broken flow structure, and stale flow
     revisions. Individual results validate against the normalized v1 schema.
8. **Partial or suspended constraints are explicit and recorded — pass**
   - Initializer tests prove constrained default behavior, confirmation guards,
     named partial suspensions, and an explicitly confirmed full suspension.
9. **The workflow has no Figma, browser-provider, or global-skill dependency — pass**
   - The vertical slice executes only the installed project-local scripts and
     dependency-free fast checks in a temporary workspace.
10. **Flow views and derived revision links remain inspectable — pass**
    - Mermaid output records the source revision.
    - Prototype metadata pins the exact ID, path, and revision.
    - A later flow revision produces a finding rather than silently rewriting
      the prototype.

## Release checks

Run:

```sh
npm run build
npm run test:package
```

The package smoke test packs `0.1.0-alpha.1`, installs the tarball in an
isolated consumer fully offline, runs its CLI, initializes and diagnoses a
workspace, runs the installed fast suite, and verifies the pinned lock plus
compiled reference outputs. Runtime dependencies are bundled into the tarball,
so obtaining the candidate is the only required network transfer.

Public publishing, arbitrary existing-repository adoption, browser automation,
and live design-tool synchronization remain explicitly outside this iteration.
