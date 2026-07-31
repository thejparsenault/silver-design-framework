---
name: silver-practice-review
description: Review accepted work for a reusable personal lesson and produce a sanitized proposal without modifying My Practice.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Review your practice

1. Inspect accepted results and evidence for a recurring method-level lesson.
2. Separate the reusable lesson from product, customer, company, and repository details.
3. Record what was removed during sanitization.
4. Produce a `practice-change` proposal and request review.

Applying the proposal is a separate administrative action. This skill never
writes outside the product workspace or silently changes My Practice.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold practice-review .
.silver/bin/silver invoke practice-review <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.
