---
name: prototype
description: Create or revise an open-ended product prototype, including revisions from research or testing feedback, while enforcing the workspace’s explicit constraint profile. Use when a user asks to prototype a screen or flow, explore component behavior, build wireframes, revise a prototype from feedback, or test an interaction before production.
---

# Build or revise a prototype

Prototypes may introduce new component structures and product compositions, but
they are non-authoritative and constrained unless the user explicitly says
otherwise.

## Workflow

1. Read `design/INDEX.md` and `design/manifest.yaml`. Load only the product,
   brand, system, component, research, or testing artifacts needed for the
   request.
2. Select the workspace’s existing implementation profile for this output
   class. Reuse it unless the requested output is materially different.
3. Determine the constraint profile:
   - `constrained` is always the default;
   - `partial` requires an explicit user instruction and named suspended
     constraints;
   - `suspended` requires an explicit user instruction.
4. Initialize new prototype metadata with
   `scripts/init-prototype.mjs`. Pass `--confirm-override` only after an
   explicit request for `partial` or `suspended`.

   ```sh
   node .skills/prototype/scripts/init-prototype.mjs \
     --id campaign-flow \
     --title "Campaign flow" \
     --question "Can a marketer understand the setup sequence?"
   ```

   For `partial`, also pass `--profile partial`, one or more `--suspend`
   values, an `--override-reason`, and `--confirm-override`.
5. Define the question the prototype should answer, its essential states, and
   the shortest useful interaction path. Do not impose a lifecycle stage.
6. Build inside a declared prototype root. Under `constrained`, reuse semantic
   styles and approved components while allowing local component experiments.
   Under `partial`, suspend only the recorded constraints. Under `suspended`,
   retain semantic HTML, accessibility, privacy, and runtime safety.
7. When revising from feedback, distinguish observations, interpretations, and
   accepted changes. Preserve useful prior behavior unless the feedback
   invalidates it.
8. Run available static and browser checks appropriate to the selected profile.
   Report missing coverage as `not-run`.
9. Recommend whether to refine, test, retain, discard, or deliberately promote
   the work. Never promote or delete it automatically.

## Boundaries

- Do not change canonical tokens or system guidance as a side effect. Propose
  that change and request permission through the appropriate task.
- Do not infer lo-fi work as permission to invent visual values; use the
  workspace’s restricted subset.
- Do not move prototype code into production wholesale.
