---
name: theme
description: Explore, render, apply, or validate a product’s visual theme, including color ramps, semantic roles, typography, modes, schemes, and component expression. Use when a user asks for theme ideas, brand-to-visual translation, theme application, token changes, a new semantic mode, or visual-system refinement.
---

# Develop theme

Support both exploration and application through one memorable task. Keep the
active design system constraining by default.

## Workflow

1. Read `design/INDEX.md` and resolve the mapped brand, design-system, token,
   and component artifacts from `design/manifest.yaml`.
2. Classify the request:
   - **explore** — propose and render alternatives without changing canonical
     sources;
   - **apply** — update approved canonical sources and implementation outputs;
   - **validate** — evaluate an existing theme without redesigning it.
3. Preserve the value chain:
   primitive values → semantic roles → optional component tokens → components.
   Components and production-facing work must consume semantic or component
   roles, not primitive visual values.
4. Explain any proposed new token, style, mode, or scheme and ask before adding
   it. Reuse or remap existing semantic roles when they already express the
   intended meaning.
5. Render representative states when a configured browser or design-file
   provider is available. Include light/dark, responsive, interactive, and
   feedback states relevant to the change.
6. Before applying, show the affected canonical artifacts and implementation
   paths. Resolve permissions for canonical or production writes.
7. Update sources before generated outputs, run the declared build, and record
   a design decision for a material system change.
8. Run applicable independent checks. Report unavailable render coverage as
   `not-run`, then recommend next actions without starting them.

## Boundaries

- Do not silently introduce arbitrary values or primitive color utilities.
- Do not infer a partial or suspended prototype constraint profile.
- Do not change the workspace’s selected implementation profile merely because
  another framework would be convenient.
- Do not modify an external design file unless the resolved provider and
  permission policy allow it.
