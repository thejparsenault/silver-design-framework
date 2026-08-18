# Check Result Protocol

A checker evaluates one deterministic conformance dimension and returns one
`silver/check-result/v1` object. Checkers do not modify design work.

## Status

- `pass` — all requested coverage completed and no findings were produced.
- `fail` — the checker ran and produced at least one failing finding.
- `error` — execution began, but the checker could not complete because its
  launch, readiness, navigation, protocol, inspection, or cleanup mechanism
  failed. This is distinct from a conformance finding.
- `not-run` — requested coverage could not execute. This is never converted to
  `pass`, including when a render target or browser provider is unavailable.

Every finding in a `fail` result has status `fail`. `not-run` and `error`
coverage include a human-readable reason and identify requested versus
completed targets. An `error` includes a typed `execution_error`; it may retain
findings from targets completed before the mechanism failed, but those findings
do not change the result's stricter `error` status.

## Exit Behavior

Each checker writes its complete result before exiting:

- exit `0` for `pass`;
- exit `1` for `fail`;
- exit `2` for `not-run`;
- exit `3` for `error`, checker, or contract failure.

The `design-check` orchestrator runs enabled checkers independently, preserves
their results, and reports the strictest status (`error > fail > not-run > pass`). A policy profile may decide
whether warnings or missing coverage block CI, but it cannot relabel an
unexecuted check as passed.

## Suites

- `fast` contains deterministic static checks.
- `browser` contains render-dependent checks.
- `full` is the union of enabled fast and browser checks.

Suites select checkers; they do not merge checker implementations. This keeps
schema, flow-structure, semantic-style, component-contract, prototype-policy,
browser, accessibility, responsive, and freshness checks replaceable and
debuggable.
