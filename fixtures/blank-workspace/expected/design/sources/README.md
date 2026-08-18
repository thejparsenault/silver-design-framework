# Linked design and code sources

`sources.yaml` contains only manually reviewed design-system,
component-catalog, and codebase links. Each record pins selected paths to an
exact revision and integrity and declares authority.

Silver inspects these sources read-only. Drift creates a re-pin proposal and
stale-dependent evidence; it does not synchronize semantic changes.

## Linking a codebase

`silver link <path> [--as <id>]` registers a codebase — a sibling repository
this design workspace is not part of — as a `kind: codebase` entry here. The
path is stored **relative to this workspace**, with the absolute path it
resolved to at link time recorded alongside only as a hint for a human
reading this file after a clone; nothing reads the hint back.

If exactly one active design context can be resolved, the link is also
recorded on its `codebase.linked_source` field, which is what lets
`silver adopt inspect --source <linked-id>` read the codebase to build a
design-system index, and what gives `implement` a real target.

`silver doctor` reports a codebase link that no longer resolves after a
clone (the sibling repository is missing at the stored relative path) and
one whose pinned git revision has moved upstream — both by re-running the
same read-only inspection every other linked source already gets. Nothing
here is synchronized automatically; a moved link is a proposal to review,
not a change already applied.
