# Local installer

The installer is intentionally narrower than the design workflows it installs.
This development slice provides two commands:

```sh
node bin/design-practice.mjs setup ./path-to-blank-workspace \
  --name "Example Product" \
  --id example-product

node bin/design-practice.mjs doctor ./path-to-blank-workspace
```

`setup` currently supports an empty or minimal folder and an interrupted
framework setup. It refuses to infer an adoption plan for an existing codebase.
It installs the five initial project-local skills, a ready-to-render editable
reference system, a generated agent discovery pointer, and the canonical design
artifacts. It creates missing files but does not overwrite project-owned files
or repair generated files.

`doctor` is read-only. It validates:

- the workspace manifest, artifact frontmatter, permission policy, and lock
  against the v1 schemas;
- mapped artifact existence and unique artifact IDs;
- agreement between manifest mappings and artifact frontmatter;
- deterministic `design/INDEX.md` content;
- managed-file existence and lock integrity;
- framework-managed skill package integrity while allowing edits to the
  copied-and-owned reference system.

The command exits nonzero when it finds an error. `--json` returns a stable
machine-readable result for agents and CI.

The `repair`, `update`, and `migrate` commands remain subsequent milestones.
