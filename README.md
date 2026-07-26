# The Silver Design Framework

This repository contains a meta-system for designers working across code,
design tools, and agent workflows.

It provides:

- opinionated but adaptable design-artifact contracts;
- project-scoped task skills;
- optional artifact-driven playbooks for longer, resumable design loops;
- deterministic and independently runnable conformance checks;
- provider-neutral tool integration and permission declarations;
- evidence-backed change cases and branded presentation views;
- blank-workspace recipes and existing-codebase adoption;
- an editable reference design system used for examples and tests.

The framework does **not** impose one design system, one application stack, or one mandatory design process. It makes sources of truth discoverable, gives common design tasks consistent interfaces, and prevents constraints from being silently ignored.

## Current State

Silver `0.3.0`, Portable Tools and Reconciliation, is implemented and
validated from source and as an exact offline archive. The setup/update CLI
installs eighteen project-local skills, registered portable and Figma provider
packages, strict artifact and reconciliation contracts, an editable reference
system, optional resumable playbooks, local semantic-HTML renderers, and
independent deterministic checks.

Every general skill has a repository-only baseline. Portable artifacts, local
views, and external views carry explicit authority and revision provenance;
the Figma adapter can normalize captured provider state, classify drift, stage
three-way reconciliation proposals, and apply only explicitly accepted and
permissioned changes. All 22 release criteria have direct evidence in
[`docs/silver-0.3-acceptance-audit.md`](docs/silver-0.3-acceptance-audit.md).
Existing-codebase adoption is the next milestone.

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
node bin/silver.mjs setup ./my-design-workspace \
  --name "My Product" \
  --id my-product
node bin/silver.mjs doctor ./my-design-workspace
node bin/silver.mjs repair ./my-design-workspace
node bin/silver.mjs update ./my-design-workspace

node ./my-design-workspace/.skills/design-check/scripts/run-fast.mjs \
  --root ./my-design-workspace
```

See [`installer/README.md`](installer/README.md) for the current command
boundary and intentionally deferred installer behavior.

Start with:

1. [`PROJECT.md`](PROJECT.md)
2. [`STATUS.md`](STATUS.md)
3. [`TASKS.md`](TASKS.md)
4. [`silver_design_framework_prd.md`](silver_design_framework_prd.md)
5. [`BACKLOG.md`](BACKLOG.md)
6. [`docs/agentic-design-workflows.md`](docs/agentic-design-workflows.md)
7. [`docs/pitch-and-presentations.md`](docs/pitch-and-presentations.md)
8. [`docs/silver-0.3-acceptance.md`](docs/silver-0.3-acceptance.md)

The previous design-system PRD is retained as historical input in [`portable_design_system_prd.md`](portable_design_system_prd.md).
