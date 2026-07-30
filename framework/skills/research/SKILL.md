---
name: research
description: Define research questions and methods, participant criteria, scripts, evidence handling, and sanitized observation plans. Use to plan product research or evaluation recruitment without implying the planned research was conducted.
allowed-tools: Bash(.silver/bin/silver:*), Bash(${CLAUDE_PROJECT_DIR}/.silver/bin/silver:*)
---

# Plan research

## Workflow

1. Define the decision the research must inform and the evidence needed.
2. Choose a proportionate method, participant criteria, tasks, and script.
3. Define consent, minimization, sanitation, retention, and evidence labeling.
4. Mark the artifact as a plan until observed evidence is actually captured.

Run the guarded file operation through the CLI when durable outputs are ready:

```sh
.silver/bin/silver invoke --scaffold research .
.silver/bin/silver invoke research <request.json> .
```

The scaffold prefills timestamps, provenance, pinned context, required checks, and
`expected_integrity`. Replace every `silver-scaffold-placeholder` before invoking;
the CLI refuses a request that still contains one.

## Done

- Satisfy: question-method-aligned, participant-criteria-explicit, planned-not-conducted.
- Evaluate quality: The plan can answer the declared question while minimizing sensitive data collection.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Never claim planned sessions, participants, or observations occurred.
- Do not place sensitive raw participant data in the repository.
