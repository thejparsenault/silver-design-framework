# Design Practice Framework

This repository is being repurposed into a meta-system for designers working across code, design tools, and agent workflows.

It will provide:

- opinionated but adaptable design-artifact contracts;
- project-scoped task skills;
- deterministic and independently runnable conformance checks;
- provider-neutral tool integration and permission declarations;
- blank-workspace recipes and existing-codebase adoption;
- an editable reference design system used for examples and tests.

The framework does **not** impose one design system, one application stack, or one mandatory design process. It makes sources of truth discoverable, gives common design tasks consistent interfaces, and prevents constraints from being silently ignored.

## Current State

The product model and first-iteration plan are documented. V1 contracts cover
the workspace manifest, artifact metadata, portable flows, prototypes, skill
declarations, permissions, lock state, findings, and checker results. A local
development CLI initializes the blank-workspace artifacts, five project-local
skills, a ready-to-render editable reference system, and an agent discovery
pointer, then diagnoses their contracts without changing them. The installed
skills can author portable flows, render constrained static walkthroughs from
exact flow revisions, and run four independent dependency-free fast checks.

The earlier token/CSS/component spike now lives in `reference-system/`. Its
token build and static light/dark example have been build- and browser-tested.

Development checks:

```sh
python3 -m pip install -r requirements-dev.txt
npm install
npm run build
npm run test:package
```

Try the local blank-workspace path:

```sh
node bin/design-practice.mjs setup ./my-design-workspace \
  --name "My Product" \
  --id my-product
node bin/design-practice.mjs doctor ./my-design-workspace
node bin/design-practice.mjs repair ./my-design-workspace
node bin/design-practice.mjs update ./my-design-workspace

node ./my-design-workspace/.skills/design-check/scripts/run-fast.mjs \
  --root ./my-design-workspace
```

See [`installer/README.md`](installer/README.md) for the current command
boundary and intentionally deferred installer behavior.

Start with:

1. [`PROJECT.md`](PROJECT.md)
2. [`STATUS.md`](STATUS.md)
3. [`TASKS.md`](TASKS.md)
4. [`design_practice_framework_prd.md`](design_practice_framework_prd.md)
5. [`BACKLOG.md`](BACKLOG.md)

The previous design-system PRD is retained as historical input in [`portable_design_system_prd.md`](portable_design_system_prd.md).
