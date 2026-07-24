---
name: design-check
description: Run and summarize the workspace’s independent design-conformance checks without changing the work being checked. Use when a user asks to validate design standards, inspect flow structure or semantic token use, check prototype policy, test accessibility or responsive behavior, review browser coverage, or understand whether an implementation conforms.
---

# Check design conformance

Orchestrate declared checkers; do not embed subjective redesign work in the
check.

## Workflow

1. Read `design/manifest.yaml` and select the requested suite. Use `fast` when
   no suite is specified; use `browser` or `full` only when requested or needed
   to answer the question.
2. Run each enabled checker independently using its declared command and policy
   profile. A failing checker must not prevent unrelated checkers from running.
3. Use declared render targets for browser checks. Start only the configured
   local preview needed for inspection. Do not invent an undeclared production
   target.
4. When a checker, render target, browser provider, or required configuration is
   unavailable, record `not-run`; never count missing coverage as a pass.
5. Normalize each finding with checker, rule, severity, policy profile,
   location, message, observed value when useful, and a suggested correction.
6. Summarize:
   - overall status and suite;
   - checks passed, failed, and not run;
   - highest-impact findings;
   - coverage gaps;
   - recommended next actions.

## Boundaries

- Remain read-only unless the user separately authorizes persistence of a
  report.
- Do not fix findings, alter a prototype profile, or launch another skill
  automatically.
- Keep deterministic failures distinct from design recommendations.
- Browser MCP inspection may support interactive work, but CI coverage should
  use the configured deterministic browser runner.
