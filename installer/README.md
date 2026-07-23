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
It creates missing files but does not overwrite project-owned files or repair
generated files.

`doctor` is read-only. It validates:

- the workspace manifest, artifact frontmatter, permission policy, and lock
  against the v1 schemas;
- mapped artifact existence and unique artifact IDs;
- agreement between manifest mappings and artifact frontmatter;
- deterministic `design/INDEX.md` content;
- managed-file existence and lock integrity.

The command exits nonzero when it finds an error. `--json` returns a stable
machine-readable result for agents and CI.

Reference-system copying, project-local skills, agent pointers, and the
`repair`, `update`, and `migrate` commands remain subsequent milestones.
