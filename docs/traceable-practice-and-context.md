# Traceable Practice and Context

**Release:** Silver `0.5.0`

## Experience boundary

Designers use chat and readable files. The agent translates intent into Silver
commands, previews consequential changes, and reports results in design
language. Designers do not need to manage schemas, package versions, or Git
commands directly.

Silver owns workflow contracts, preview, validation, provenance, and
checkpoint evidence. It does not replace repository permissions, branch
protection, provider authentication, or company policy.

## System layers

```text
Silver release
  versioned framework contracts, core skills, checks, providers, installer

My Practice
  personal methods, playbooks, rubrics, decisions, local Git history

Linked guidance
  manually selected company/team sources with declared influence and exact pins

Linked design/code sources
  manually registered systems, catalogs, and codebases with authority and pins

Product design repository
  canonical design artifacts, contexts, maps, decisions, prototypes, views

Design contexts
  product/brand + system + shared catalog + expression + surface + codebase

Code repositories and external tools
  linked authorities and representations governed by their native permissions
```

Core skill packages remain project-local and are pinned in
`.silver/lock.yaml`. My Practice is not an executable skill distribution
mechanism. Its method overlays are readable refinements that may add questions,
techniques, quality emphasis, and exclusions, but cannot relax project facts,
safety invariants, or required guidance.

## Repository topology

An integrated workspace keeps design and code in one repository. It fits a
solo or small shared team with one codebase and one lifecycle.

A separate design repository fits multiple codebases, separate discipline
ownership or access, or a need for independent design history. It contains the
same Silver workspace structure and links its codebase bindings explicitly.
The repositories remain independently versioned while provenance and handoff
records preserve their relationship.

`silver setup inspect` recommends one topology and explains why.
`silver setup apply` performs only the reviewed plan after confirming the
inspected state is unchanged.

## Versioning and backup

| Layer | Version identity | Local history | Optional remote backup |
| --- | --- | --- | --- |
| Silver framework | Semantic release, package versions, contract versions | Installed lock and migration records | Framework release repository |
| My Practice | Practice identity, revision, method IDs | Automatic isolated Git commits for approved changes | Private personal GitHub remote, never implied |
| Linked Git guidance | Repository, commit, selected paths, integrity | Link and re-pin checkpoints | Source repository is authoritative |
| Linked non-Git guidance | Snapshot revision, selected paths, integrity | Reviewed snapshots and re-pin checkpoints | User-managed source backup |
| Linked design/code source | Source identity, authority, exact revision or integrity | Link and re-pin checkpoints | Source repository is authoritative when configured |
| Product design work | Artifact identity/revision plus provenance | Design-repository Git history and isolated checkpoints | Repository remote when configured |
| Design context | Context revision and exact referenced revisions | Product design repository | Same as product design work |
| External representation | Provider object/revision and binding base | Binding and reconciliation evidence | External provider |
| Production code | Commit/branch/PR plus codebase binding | Code repository | Code repository remote |

Local Git history is not reported as remote backup. Silver never pushes merely
because it created a checkpoint.

## My Practice

The default location is `~/Silver/My Practice`:

```text
My Practice/
  PRACTICE.md
  methods/
  playbooks/
  rubrics/
  decisions/
  .silver/
    practice.yaml
```

`practice-review` consumes accepted product results and creates a sanitized
proposal in the product workspace. `silver practice apply` checks the expected
practice revision, writes the approved change, records the reason, and creates
an isolated local Git commit. Product artifacts record only practice identity,
revision, and applied method IDs; they do not expose the personal filesystem
path or copy the practice repository.

## Linked guidance

Guidance is opt-in. Silver never searches for or activates company knowledge
automatically.

- Git guidance records a repository, exact commit, selected paths, and their
  integrity without copying the repository.
- Non-Git guidance snapshots only the reviewed selected files and records
  their integrity.
- Every link declares scope and `reference`, `preferred`, or `required`
  influence.

Freshness inspection is read-only. Drift creates a re-pin proposal and marks
dependent work stale. It does not fetch or apply semantic changes.

## Design contexts

A revisioned design context composes:

- a product or brand reference;
- a design-system or theme reference;
- a component-catalog reference;
- a component-expression mapping;
- optional asset-catalog and presentation-kit references;
- one or more surface selectors; and
- a codebase binding.

A shared semantic component catalog can participate in several contexts.
Expression mappings prove how its roles resolve to each context's tokens,
themes, assets, and implementation conventions. Identity mappings are explicit.
Defaults resolve by product and surface when unambiguous; otherwise the agent
asks the designer. Durable visual work always records the resolved context
revision, with one primary context for cross-context output.

## Maps

`map` owns portable journey maps, service blueprints, experience maps, and
ecosystem/stakeholder maps. The structured artifact records state, actors,
stages, semantic lanes, items, connections, evidence, assumptions, pain
points, opportunities, provenance, and context pins.

Journey maps require actor actions and touchpoints across stages. Service
blueprints require customer action, frontstage, backstage, support, and system
lanes. A semantic local HTML view is generated for review. External canvases
are optional revision-bound views rather than the canonical map.

## Provenance and corrections

Every new durable artifact records:

- stable identity and revision;
- human, agent-assisted, imported, or generated origin;
- known contributors and providers;
- exact source-artifact revisions;
- My Practice revision and method IDs;
- linked-guidance, linked-source, and design-context revisions;
- change reason and any superseded revision;
- acceptance state; and
- external representation bindings.

`silver trace <artifact-id-or-path>` renders this chain. A correction creates a
new superseding revision; it does not rewrite history. Private reasoning,
discarded transient work, secrets, and unsanitized research are excluded.

## Repository authority and checkpoints

Skill contracts declare expected effects: reads, writes, external changes, and
Git/GitHub actions. Observed undeclared effects become findings. They are not a
second permission system.

Filesystem access, Git/GitHub permissions, branch protection, repository
instructions, provider authentication, and the agent host determine actual
authority. Silver retains hard protections for path escape, destructive
ambiguity, stale overwrite, secret exposure, fabricated evidence, silent
mutation, and misleading acceptance or readiness.

Silver creates path-isolated local checkpoints when an artifact is accepted,
an implementation handoff is prepared, My Practice changes, or guidance,
design contexts, or topology materially change. Unrelated dirty work is not
staged. An overlapping staged change pauses the checkpoint. No checkpoint
causes an automatic push.

## External-source boundary

Silver 0.5 preserves the 0.3 provider, representation-binding,
synchronization-state, three-way comparison, safe-apply, and narrow Figma
semantic-token write contracts.

New guidance, design-system, component, and codebase links support manual
authority declaration, exact revision or integrity pins, read-only
availability/freshness inspection, drift reporting, reviewed re-pinning, and
provenance. Silver 0.5 does not add generalized component, decision, map, flow,
prototype, presentation, or design-system push/pull commands.

The P1 External Sources and Synchronization milestone in `BACKLOG.md` owns a
single `reconcile` skill and generic `sync status`, `sync inspect`, and
`sync apply` commands. Domain skills remain responsible for semantic meaning.
