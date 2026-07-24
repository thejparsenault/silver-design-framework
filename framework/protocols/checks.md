# Check Result Protocol

A checker evaluates one deterministic conformance dimension and returns one
`design-practice/check-result/v1` object. Checkers do not modify design work.

## Status

- `pass` — all requested coverage completed and no findings were produced.
- `fail` — the checker ran and produced at least one failing finding.
- `not-run` — requested coverage could not execute. This is never converted to
  `pass`, including when a render target or browser provider is unavailable.

Every finding in a `fail` result has status `fail`. Every finding in a
`not-run` result has status `not-run`. `not-run` coverage includes a human-
readable reason and identifies requested versus completed targets.

## Exit Behavior

Each checker writes its complete result before exiting:

- exit `0` for `pass`;
- exit `1` for `fail`;
- exit `2` for `not-run`;
- exit `3` for checker or contract failure.

The `design-check` orchestrator runs enabled checkers independently, preserves
their results, and reports the strictest status. A policy profile may decide
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
