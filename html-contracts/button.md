# Button — HTML Contract

## Purpose

Triggers an action or submits a form. Use `<a class="ds-button">` only when the element navigates to a URL — semantics drive element choice, not appearance.

## Anatomy

```
[ icon? ] [ label ] [ icon? ]
```

## Canonical Markup

```html
<button class="ds-button" data-variant="primary" data-size="md" type="button">
  Save
</button>
```

## Element Choice

| Use case | Element |
|---|---|
| Triggers JS action | `<button type="button">` |
| Submits a form | `<button type="submit">` |
| Navigates to URL | `<a class="ds-button" href="/path">` |
| Disabled but accessible | `<button aria-disabled="true">` — prefer over `disabled` when keeping in tab order |

## Supported `data-variant` Values

| Value | When to use |
|---|---|
| `primary` (default) | The single most important action on a surface |
| `secondary` | Alternate actions alongside primary |
| `ghost` | Low-emphasis actions, toolbars, table row controls |
| `destructive` | Irreversible or dangerous actions |

Do not invent new variants. If a visual need isn't covered, use a composed component or `data-usage`.

## Supported `data-size` Values

| Value | Height | Use case |
|---|---|---|
| `sm` | 28px | Dense UIs, table row actions, toolbars |
| `md` (default) | 36px | Standard form controls, dialogs |
| `lg` | 44px | Call to action, mobile-first touch targets |

## Supported `data-layout` Values

| Value | Effect |
|---|---|
| `full-width` | Button fills its container — forms, mobile |

## With Icon (left)

```html
<button class="ds-button" data-variant="primary" type="button">
  <svg aria-hidden="true" ...>...</svg>
  Save
</button>
```

Icons must have `aria-hidden="true"`. The label provides the accessible name. Never use an icon-only button without `aria-label`.

## Icon-Only Button

```html
<button class="ds-button" data-variant="ghost" data-size="sm" type="button" aria-label="Delete item">
  <svg aria-hidden="true" ...>...</svg>
</button>
```

## Disabled

```html
<!-- Removes from tab order — use when the action is fully unavailable -->
<button class="ds-button" data-variant="primary" disabled type="button">Save</button>

<!-- Stays in tab order — use with a tooltip explaining why it's unavailable -->
<button class="ds-button" data-variant="primary" aria-disabled="true" type="button">Save</button>
```

## Loading State

```html
<button class="ds-button" data-variant="primary" aria-busy="true" aria-disabled="true" type="button">
  <svg aria-hidden="true" class="ds-spinner" ...>...</svg>
  Saving…
</button>
```

## Accessibility

- The button's accessible name is its text content. Do not rely on icons alone.
- `type="button"` prevents accidental form submission in browsers that default to `type="submit"`.
- `aria-disabled="true"` (not `disabled`) keeps the element in focus order, useful with a tooltip.
- Focus ring is provided by `:focus-visible` in `button.css` — do not remove it.
- Minimum touch target 44×44px is met at `data-size="lg"`. For `sm` and `md` in touch contexts, add `padding` via a wrapper rather than resizing the button.

## Theming

Button colors resolve from semantic action tokens. To change the primary action color for a section:

```html
<section data-mode="marketing">
  <!-- --ds-action-primary-bg is overridden for this scope -->
  <button class="ds-button" data-variant="primary">Get started</button>
</section>
```

## Anti-Patterns

```html
<!-- ✗ Don't use arbitrary color classes -->
<button class="ds-button bg-blue-600 rounded-[7px]">Save</button>

<!-- ✗ Don't use <div> or <span> as buttons -->
<div class="ds-button">Save</div>

<!-- ✗ Don't put block-level content inside buttons -->
<button class="ds-button"><p>Save</p></button>

<!-- ✗ Don't invent variants -->
<button class="ds-button" data-variant="dashboard-special">Save</button>

<!-- ✗ Don't nest interactive elements -->
<button class="ds-button"><a href="/save">Save</a></button>
```

## Composed Components That Use Button

- `SplitButton` — primary action + dropdown alternatives
- `ButtonGroup` — related actions in a row
- `ConfirmDialog` — dialog with destructive + cancel pair

## Related Patterns

- Field action: `<button data-usage="field-action">` inside an input group
- Table row action: `<button data-variant="ghost" data-size="sm" data-usage="table-row-action">`
- Form submit: always `type="submit"` on the primary button in a `<form>`
