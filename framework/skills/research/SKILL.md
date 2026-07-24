---
name: research
description: Define research questions and methods, participant criteria, scripts, evidence handling, and sanitized observation plans. Use to plan product research or evaluation recruitment without implying the planned research was conducted.
---

# Plan research

## Workflow

1. Define the decision the research must inform and the evidence needed.
2. Choose a proportionate method, participant criteria, tasks, and script.
3. Define consent, minimization, sanitation, retention, and evidence labeling.
4. Mark the artifact as a plan until observed evidence is actually captured.

Run the guarded file operation with `node scripts/invoke.mjs <request.json>` when durable outputs are ready. The request must pin inputs and pass the skill's permission, guardrail, and output checks.

## Done

- Satisfy: question-method-aligned, participant-criteria-explicit, planned-not-conducted.
- Evaluate quality: The plan can answer the declared question while minimizing sensitive data collection.
- Emit a valid `silver/skill-result/v2` record separating execution, acceptance, and downstream readiness.
- Recommend follow-up skills; never start them automatically.

## Boundaries

- Never claim planned sessions, participants, or observations occurred.
- Do not place sensitive raw participant data in the repository.
