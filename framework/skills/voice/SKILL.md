---
name: voice
description: Define or revise product tone, voice, terminology, and context-specific content guidance. Use for voice principles, terminology, message examples, error tone, or canonical voice guidance.
---

# Define voice

## Workflow

1. Read brand and product context relevant to the requested communication.
2. Define durable voice traits separately from situational tone.
3. Establish preferred terms, avoided terms, and representative examples.
4. Request approval before changing voice.md.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's permission, guardrail, and output checks.

## Done

- Satisfy: voice-distinct-from-tone, terminology-consistent, examples-contextual.
- Evaluate quality: Guidance includes usable examples and context-specific variation without contradiction.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Do not invent legal, policy, or product claims.
- Do not force one emotional tone across every context.
