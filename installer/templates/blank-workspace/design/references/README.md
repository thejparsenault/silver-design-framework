# Reference collections

Material a designer looked at — competitor screenshots, prior art,
inspiration — stored here so it stays with the project and is versioned with
it. Each collection is one `silver/reference-collection/v1` document, for
example `design/references/onboarding-patterns.json`. This directory starts
empty; a collection is created the first time something is captured.

Every reference requires an agent-readable `description` — an agent cannot
watch a video or see an image, so a reference without one is opaque to the
thing meant to use it — and `rights.usage`, which constrains where it can be
cited. `inspiration-only` means exactly that: it may inform thinking and must
never be cited by production. The `reference-integrity` check enforces this,
along with missing files, integrity, duplicate ids, and unrecognized rights.

**Nothing here is loaded automatically.** No skill takes a collection as an
implicit input, because a body of references is frequently contradictory —
three competing onboarding flows, two incompatible tones — and silently
averaging them is not a decision anyone made. A skill invocation cites a
collection explicitly (`references: [{ collection, ids }]`), and what was
cited is pinned by the collection's revision and recorded in the result's
provenance, so `silver trace` can answer "what did this look at" with the
same fidelity it answers "what artifacts did this use."
