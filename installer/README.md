# Local installer

The installer is intentionally narrower than the design workflows it installs.
Chat is the primary designer interface. An agent first inspects a target,
explains the recommendation, and applies only the approved plan:

```sh
node bin/silver.mjs setup inspect ./path-to-workspace \
  --answers '{"name":"Example Product","id":"example-product","team_shape":"solo"}' \
  --json

node bin/silver.mjs setup apply ./setup-plan.json --json

node bin/silver.mjs doctor ./path-to-blank-workspace

node bin/silver.mjs repair ./path-to-blank-workspace

node bin/silver.mjs update ./path-to-blank-workspace
```

`setup inspect` discovers the target and returns a revisioned, state-locked
plan. It recommends a separate design repository for multiple codebases,
separate discipline ownership or access, or independent design history.
Otherwise it recommends an integrated repository for a solo or small shared
team with one codebase. The plan lists intended writes, Git actions, guidance
links, codebase bindings, design contexts, unresolved questions, and optional
external actions. It does not silently choose.

`setup apply` verifies the inspected state is unchanged, applies only the
reviewed plan, and is idempotent. Separate setup initializes a local Git
repository. Integrated setup installs in the selected repository. GitHub
creation is never performed by Silver: the plan previews an external action
that an agent may perform after confirmation, then Silver records and verifies
the resulting remote.

The compatibility `setup <target> --name ... --id ...` form remains available
for deterministic fixtures. It is not the primary agent interface.

Setup installs twenty-one project-local skills, including `map`,
`practice-review`, and `what-now`; a ready-to-render reference system; generated
agent discovery; design-context and guidance registries; and canonical design
artifacts. It creates missing files but does not overwrite project-owned files.

`doctor` is read-only. It validates:

- the workspace manifest, artifact frontmatter, contexts, mappings, guidance,
  maps, and lock against their contracts;
- mapped artifact existence and unique artifact IDs;
- agreement between manifest mappings and artifact frontmatter;
- design-context resolution and expression compatibility;
- linked-guidance availability and freshness;
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

`silver trace <artifact-id-or-path>` writes a readable provenance view. It
distinguishes an artifact's immutable source pins from the producing
invocation's own sources — a different audit question, never merged — while
retaining `sources` as a compatibility alias for the artifact's pins.
`silver practice apply <proposal>` updates only an approved My Practice
proposal and commits its revision. Generalized external synchronization remains
deferred; newly linked sources support freshness, drift, and reviewed re-pins.
