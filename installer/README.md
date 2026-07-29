# Local installer

The installer is intentionally narrower than the design workflows it installs.
This development slice provides four workspace commands:

```sh
node bin/silver.mjs setup ./path-to-blank-workspace \
  --name "Example Product" \
  --id example-product

node bin/silver.mjs doctor ./path-to-blank-workspace

node bin/silver.mjs repair ./path-to-blank-workspace

node bin/silver.mjs update ./path-to-blank-workspace
```

`setup` currently supports an empty or minimal folder and an interrupted
framework setup. It refuses to infer an adoption plan for an existing codebase.
It displays the Silver terminal mark using a contrast-aware silver tone,
installs all nineteen project-local skills, a ready-to-render editable
reference system, a generated agent discovery pointer, and the canonical design
artifacts. It creates missing files but does not overwrite project-owned files
or repair generated files. After installation it runs the project-local
`what-now` analyzer through Silver's guarded runtime, records that result under
`.silver/results/skills/`, and prints its ranked recommendations without
starting any of them. `--json` omits the decorative mark and returns the setup,
analysis, and invocation result as one machine-readable value.

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

`repair` regenerates only the disposable `design/INDEX.md` and agent discovery
pointer from the canonical manifest and installed package lock. It does not
repair or alter design work.

`update` replaces a framework-managed skill only when its installed contents
still match the recorded base. Local edits stop the update as a conflict.
Copied-and-owned packages such as the reference system are never overwritten;
a changed release is reported as an available proposal. Repeating the same
update is idempotent.

Existing-codebase adoption and the `migrate` command remain subsequent
milestones.
