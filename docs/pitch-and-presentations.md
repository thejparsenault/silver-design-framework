# Pitch and Presentation Architecture

**Status:** Accepted direction; implementation planned
**Date:** 2026-07-24

## Purpose

The `pitch` skill helps a designer build team support for a decision. It turns
accepted evidence and design artifacts into a tool-neutral **change case** and
may render that case as a branded deck, document, HTML story, design-tool
presentation, pull-request summary, or post-launch report.

The skill is cross-cutting rather than a required lifecycle stage. It may be
used:

- after synthesis to establish that an opportunity matters;
- after ideation, specification, or sketching to select a direction;
- after prototyping and evaluation to justify production investment;
- after release to report measured outcomes and recommend follow-up work.

## Change Case

`change-case` is the portable content and evidence artifact produced by
`pitch`. It supports three initial modes:

- **opportunity** — explain the current problem and why it matters;
- **proposal** — describe a proposed change and its expected impact;
- **outcome** — compare implemented results with the baseline.

A complete change case identifies:

1. audience and requested decision;
2. before state and baseline;
3. findings, evidence, interpretations, and assumptions;
4. proposed or actual post state;
5. estimated, proxy, or measured impact;
6. cost, tradeoffs, risks, alternatives, and contradictions;
7. the explicit ask and recommended next action.

Claims reference stable source artifact IDs and revisions. Proposed work must
not be described as implemented, estimates must not be described as measured,
and a prototype must not be represented as an actual post state.

## Presentation Views

The change case is authoritative for the case content. Presentation outputs
are views produced from:

```text
change case
+ brand and voice
+ design-system semantics and assets
+ presentation template and components
+ provider adapter
→ rendered presentation
```

Supported view types may include Markdown, HTML, PowerPoint, Google Slides,
Figma Slides, Canva, PDF, and other providers. Provider selection follows the
normal capability and permission model.

If no presentation provider is configured, the skill can still complete the
change case and a portable presentation outline. Provider-dependent rendering
or visual inspection is reported as `not-run`.

An external presentation may be authoritative for its final composition, but
it never silently rewrites the underlying change case, evidence, brand,
design-system source, or presentation kit.

## Presentation Kit

A workspace may maintain a project-owned presentation kit:

```text
design/
  presentations/
    manifest.yaml
    guidelines.md
    templates/
      opportunity/
      proposal/
      outcome/
    components/
      before-after/
      finding/
      metric/
      evidence-quote/
      comparison/
      flow/
      recommendation/
      decision/
      appendix/

presentations/
  <case-id>/
    case.md
    deck.yaml
    exports/
```

These are default logical locations, not mandatory physical paths.

The presentation kit is a medium-specific projection of the brand and design
system. It owns presentation templates, semantic presentation roles, and
reusable presentation components. It does not duplicate or replace the
product UI component catalog.

Examples include title and section layouts, before/after comparisons, evidence
cards, metric callouts, annotated screens, flow views, charts, recommendations,
decision asks, and appendices. Presentation components may share brand assets
and semantic design tokens with product components while retaining their own
contracts and accessibility rules.

Deck-local compositions may be created freely within the requested output.
They are promoted into the reusable presentation kit only through an explicit
proposal and review:

```text
one-off composition
→ successful repeated use
→ reusable-pattern proposal
→ review
→ presentation-kit component
```

The `pitch` skill may use or propose presentation-kit additions. Maintaining a
reusable kit can remain an explicit mode or supporting operation initially. A
dedicated `presentation-kit` skill should be introduced only if that task
becomes frequent enough to justify a separate authority and completion
contract.

## Pitch Completion and Guardrails

A pitch execution is complete when:

- its audience and requested decision are explicit;
- material claims are linked to evidence or labeled as assumptions;
- before and after states pin their artifact revisions;
- proposed and implemented states are distinguished;
- metrics are classified as estimated, proxy, or measured;
- estimates disclose assumptions, confidence, and timeframe;
- tradeoffs, risks, credible alternatives, and contradictory evidence are
  represented;
- the selected output is understandable without loading the entire workspace;
- unresolved questions are visible;
- external publication or presentation has not occurred without permission.

Pitch acceptance remains a team decision; successful artifact generation does
not imply approval.

The skill must not fabricate evidence, manipulate charts, claim causality
without support, cherry-pick away material contradictions, change source
artifacts to simplify the story, or publish externally without resolved
authority.

## Presentation Checks

Independent checks should cover:

- brand, voice, and semantic-style conformance;
- pinned template, component, asset, and source revisions;
- citation and evidence integrity;
- estimated-versus-measured labeling;
- text overflow, clipping, and minimum readable type size;
- contrast and color-independent chart meaning;
- missing or low-resolution assets;
- stale screenshots and artifact references;
- unlabeled conceptual versus implemented screens;
- export and provider-rendering coverage.
