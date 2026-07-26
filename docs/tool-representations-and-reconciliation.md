# Portable Representations and Tool Reconciliation

## Purpose

Silver skills must remain useful without a hosted service, external design
tool, or provider-specific agent integration. External tools add authoring,
rendering, inspection, and synchronization capabilities; they do not replace
the portable artifact contracts that let skills and playbooks exchange design
intent predictably.

This document defines:

- the portable baseline every generally applicable skill must provide;
- the distinction between canonical artifacts, local views, and external
  views;
- default formats by artifact family;
- provider and authority boundaries;
- freshness, divergence, and reconciliation behavior; and
- the safe path from an externally edited representation into another Silver
  artifact such as a prototype.

## Representation Roles

Silver recognizes three representation roles.

### Portable artifact

The portable artifact carries the accepted design meaning. It has a stable
identity, revision, kind, scope, status, authority, and references. Playbooks
and skill handoffs exchange portable artifact references.

The default portable formats are:

| Artifact family | Canonical local format |
| --- | --- |
| Prose-first foundations and working artifacts | Markdown with Silver frontmatter |
| Graphs, catalogs, contracts, and normalized findings | JSON or YAML selected by the artifact contract |
| Design tokens | DTCG JSON |
| Prototype state and repository configuration | YAML |
| Prototype and implementation source | Files required by the selected recipe |

A workspace has one canonical representation for an artifact revision.
Human-readable and machine-readable projections may coexist, but they may not
both claim authority over the same fields.

### Local view

A local view is a generated, disposable projection used for review,
inspection, or interaction. It pins the portable artifact revisions, renderer
identity and version, constraint profile, and any assets or design-system
revisions it uses.

Self-contained semantic HTML is Silver's default visual view because it is
portable, brandable, inspectable, interactive, and compatible with browser
checks. Mermaid remains the default compact flow diagram view. A flow may
produce both Mermaid and HTML from the same structured graph.

Editing a generated local view never silently updates its portable artifact.
The edit is either discarded by explicit regeneration, retained as a detached
experiment, or imported through the same proposal and reconciliation process
as an external view.

### External view

An external view is a provider object such as a Figma file or node, FigJam
board, Paper canvas, Canva design, or slide deck. It records a binding to the
portable artifact revision from which it was created or last reconciled.

External views may be editing surfaces. Their changes become normalized
proposals unless the project declares that provider authoritative for the
artifact kind. External writes always remain separately permissioned.

## Portable Baseline Providers

Every generally applicable skill must declare a bundled baseline provider for
its core task. The provider uses repository files and packaged scripts only.
It must be independently invokable from the exact release archive without
external credentials or globally installed workflow skills.

A skill may declare optional capabilities that improve its output. Unavailable
enhancements do not make a complete portable artifact incomplete. The skill
result distinguishes:

- core execution and acceptance;
- baseline provider actually used;
- unavailable or denied optional projections;
- checks that ran against the portable artifact or local view; and
- named downstream readiness that remains blocked by missing inspection or
  freshness evidence.

A task that is inherently external, such as publishing an accepted artifact
to Figma, may require an external provider. A production implementation may
require an actual codebase binding. Such tasks must not claim a portable
fallback performed the external or production effect.

Baseline providers are installed packages registered through provider
contracts. Framework source packages live under `framework/providers/<id>/`
and install as framework-managed packages under
`.silver/providers/<id>/`. They are not a hard-coded list inside capability
resolution.

## Default Local Outputs

The release baseline uses the following outputs:

| Skill or artifact family | Portable output | Local review output |
| --- | --- | --- |
| Brand, product, voice, principles | Markdown | HTML guide when visual review is useful |
| Research, synthesis, evaluation | Markdown and normalized findings | Markdown or HTML review |
| Ideation | Markdown concepts and hypotheses | Optional HTML concept board |
| Specification | Markdown | Markdown; optional HTML reading view |
| Flow | Structured JSON graph | Mermaid and self-contained HTML |
| Sketch | Structured sketch record | Semantic HTML alternatives |
| Component | JSON or YAML behavior contract | HTML specimen |
| Theme and system | DTCG JSON and catalogs | HTML token or component catalog |
| Prototype | `prototype.yaml` and recipe source | Runnable local prototype |
| Pitch | Markdown change case and structured pins | Branded HTML presentation |
| Implementation | Accepted handoff and recipe source | Declared application preview |

HTML is the common local visual target, not the universal canonical format.

## Bindings and Provenance

Each generated or synchronized view records:

```yaml
schema: silver/representation-binding/v1
id: checkout-flow-figma
artifact:
  id: checkout-flow
  kind: flow
  revision: r4
provider:
  id: figma
  external_id: file-123/node-456
  revision: v18
adapter:
  id: silver-figma
  version: 0.3.0
mapping_profile: product-web
authority: local
round_trip: partial
last_reconciled_at: 2026-07-25T14:00:00Z
```

External object IDs are non-secret configuration. Credentials and tokens
remain in the provider, environment, or operating-system credential store and
are never copied into project artifacts or result records.

The required machine-readable contracts are:

- `silver/provider/v1`;
- `silver/artifact-codec/v1`;
- `silver/representation-binding/v1`;
- `silver/provider-operation/v1`;
- `silver/external-snapshot/v1`;
- `silver/change-set/v1`; and
- `silver/reconciliation-result/v1`.

Project-owned bindings live under
`design/integrations/<binding-id>.yaml`. Provider operation results, normalized
snapshots, and reconciliation proposals are generated records under
`.silver/results/reconciliation/`; they do not become canonical design
artifacts merely by being persisted there.

## Authority

Authority is explicit per artifact or artifact kind:

- `local` — the portable artifact is canonical; external changes are
  proposals;
- `external` — the named provider object is canonical; the local artifact is a
  pinned validated representation that must be refreshed before freshness-
  sensitive use.

Silver does not support implicit equal bidirectional authority. Multiple
authoring surfaces may exist, but one declared authority determines how a
change becomes accepted.

A local fallback does not bypass external authority. If an externally
authoritative artifact cannot be refreshed, an agent may inspect the last
validated pin or draft a proposal, but it must report freshness as unverified
and block readiness that requires current canonical input.

## Synchronization States

A representation binding has one of these normalized states:

| State | Meaning |
| --- | --- |
| `current` | Portable and external revisions match their last reconciled base |
| `view-stale` | The portable artifact changed after the view was generated |
| `external-changed` | The external representation changed after the shared base |
| `diverged` | Both portable and external representations changed |
| `unmapped` | The adapter cannot assign some changes portable meaning |
| `unverified` | Provider, permission, or adapter availability prevents a freshness decision |
| `conflict` | Two mapped changes make incompatible claims |

The default `notify` policy detects and reports these states. It does not
perform reconciliation.

## Three-Way Reconciliation

Synchronization compares:

1. the base portable revision used at the last successful reconciliation;
2. the current portable revision; and
3. the current normalized external snapshot.

The adapter emits a normalized change set. It never mutates a canonical
artifact during inspection. Each change records:

- affected artifact kind and stable identity;
- base, local, and external revisions;
- semantic classification;
- proposed operation;
- confidence and mapping fidelity;
- affected semantic styles, components, states, or transitions;
- unresolved or provider-specific data; and
- required checks and approval.

Changes are classified by design meaning rather than file location. Moving a
button may affect only a sketch. Adding an error state may propose
specification and flow updates. Adding a new navigation path may propose flow
transitions. Introducing an unknown color produces a design-system finding or
token proposal; it never silently creates a style.

A proposed change to one artifact kind does not implicitly update another.
Cross-artifact updates are separately represented and accepted.

## Apply Behavior

Reconciliation has two phases:

1. **inspect and propose** — read provider state, normalize it, compare three
   revisions, validate proposed outputs, and persist a reviewable result;
2. **apply** — after required acceptance and permission, update only the
   approved portable artifacts or external objects using expected-integrity
   guards and atomic local writes.

Before applying, Silver verifies that the current local and external
revisions still match the proposal. A stale proposal is rejected and must be
recomputed.

Partial extraction, invalid provider data, missing permissions, failed
validation, or an interrupted operation leaves accepted artifacts and
generated outputs unchanged. Successfully extracted but unresolved changes
remain inspectable without being represented as accepted.

## Local View Updates

A skill invocation may regenerate declared generated local views when that
rendering is part of the explicitly invoked task. This is not an automatic
next action because it is a declared output of the current invocation.

Outside that invocation:

- freshness checks may mark a view stale;
- diagnostics may recommend regeneration;
- no watcher or background process regenerates it automatically; and
- canonical or external artifacts are never changed as a side effect.

## Figma-to-Prototype Example

Given a flow at `r4` and a Figma sketch at `v18` derived from it:

1. a designer edits the Figma file to `v19`;
2. a read operation creates a normalized external snapshot;
3. reconciliation compares flow `r4`, the binding base, and Figma `v19`;
4. visual-only changes propose a sketch revision;
5. changed states or navigation propose separate specification or flow
   revisions;
6. unknown tokens or components produce findings or proposals rather than
   being invented;
7. accepted proposals update the corresponding portable artifacts;
8. the prototype is generated from exact accepted revisions and records the
   Figma revision as provenance when relevant.

If reconciliation cannot complete, the existing flow and prototype remain
unchanged. A designer may explicitly create an isolated prototype from the
Figma snapshot, but it must record its divergence and cannot claim readiness
that depends on the unreconciled flow or design system.

## Relationship to Silver 0.2

Silver 0.2 already provides the foundation:

- typed, revision-pinned artifact handoffs;
- local `silver-local` capability resolution;
- normalized provider and degraded-capability results;
- independently runnable skills;
- local flow, sketch, prototype, presentation, and implementation renderers;
- no-silent-mutation and permission guardrails;
- expected-integrity and atomic local writes;
- playbook invalidation after upstream revisions change; and
- `not-run` coverage for unavailable browser or external targets.

Silver 0.3 formalizes local providers as installed packages, defines
representation bindings and synchronization states, adds three-way
reconciliation and safe apply contracts, establishes format and view
conventions, and proves the model through the first Figma adapter.
