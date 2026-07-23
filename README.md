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

The product model and first-iteration plan are documented. V1 contracts now
cover the workspace manifest, artifact metadata, skill declarations,
permissions, lock state, findings, and checker results. A validated
blank-workspace fixture demonstrates the contract shape.

The earlier token/CSS/component spike now lives in `reference-system/`. Its
token build and static light/dark example have been build- and browser-tested.

Development checks:

```sh
python3 -m pip install -r requirements-dev.txt
npm install
npm run build
```

Start with:

1. [`PROJECT.md`](PROJECT.md)
2. [`STATUS.md`](STATUS.md)
3. [`TASKS.md`](TASKS.md)
4. [`design_practice_framework_prd.md`](design_practice_framework_prd.md)
5. [`BACKLOG.md`](BACKLOG.md)

The previous design-system PRD is retained as historical input in [`portable_design_system_prd.md`](portable_design_system_prd.md).
