# Evidence

Observed claims about this product and its users — feedback, session
observations, evaluation findings, change-case impact — stored here as
`silver/working-artifact/v2` documents so `synthesize` and `map` can read
them and `silver trace` can pin what a finding rests on. This directory
starts empty; an artifact is written the first time `collect` or `evaluate`
produces one.

Every `kind: evidence` artifact must declare a `payload.source_pin`: where it
came from, what was asked of it, when it was retrieved, and whether it has
been sanitized. The `evidence-provenance` check enforces this, along with
required sources on findings, sanitization on observations, and evidence on
evaluations.

**This is not where captured material lives.** Competitor screenshots, prior
art, and scraped inspiration belong in `design/references/` instead — that
directory is never loaded implicitly, is rights-constrained rather than
provenance-constrained, and answers a different question ("what did we look
at") from evidence's ("what did we learn").
