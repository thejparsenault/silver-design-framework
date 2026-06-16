# Field — HTML Contract

## Purpose

A complete form field: label, input (or textarea/select), optional hint, and optional error message. `ds-field` is the wrapper that provides correct layout and spacing. `ds-input` is the input element class.

## Anatomy

```
[ label ]  [ (optional) ]
[ input                  ]
[ hint text              ]
```

## Canonical Markup — Text Input

```html
<div class="ds-field">
  <label class="ds-field-label" for="email">Email address</label>
  <input class="ds-input" id="email" name="email" type="email" autocomplete="email" />
</div>
```

## With Hint

```html
<div class="ds-field">
  <label class="ds-field-label" for="email">Email address</label>
  <input class="ds-input" id="email" name="email" type="email" aria-describedby="email-hint" />
  <p class="ds-field-hint" id="email-hint">Use your work email. We'll send a verification link.</p>
</div>
```

## Required Field

```html
<div class="ds-field">
  <label class="ds-field-label" data-required for="name">Full name</label>
  <input class="ds-input" id="name" name="name" type="text" required aria-required="true" />
</div>
```

## Optional Field

```html
<div class="ds-field">
  <label class="ds-field-label" data-optional for="bio">Bio</label>
  <textarea class="ds-input" id="bio" name="bio"></textarea>
</div>
```

## Error State

```html
<div class="ds-field" data-state="error">
  <label class="ds-field-label" for="email">Email address</label>
  <input
    class="ds-input"
    id="email"
    name="email"
    type="email"
    aria-invalid="true"
    aria-describedby="email-error"
    value="notanemail"
  />
  <p class="ds-field-error" id="email-error" role="alert">Enter a valid email address.</p>
</div>
```

## Success State

```html
<div class="ds-field" data-state="success">
  <label class="ds-field-label" for="username">Username</label>
  <input class="ds-input" id="username" name="username" type="text" value="jp" />
  <p class="ds-field-hint">✓ Username is available.</p>
</div>
```

## Textarea

```html
<div class="ds-field">
  <label class="ds-field-label" for="message">Message</label>
  <textarea class="ds-input" id="message" name="message" rows="4"></textarea>
</div>
```

## Disabled

```html
<div class="ds-field">
  <label class="ds-field-label" for="readonly-field">Account ID</label>
  <input class="ds-input" id="readonly-field" type="text" value="ACC-00421" disabled />
</div>
```

## Input Sizes

```html
<!-- Small — dense tables, inline filters -->
<input class="ds-input" data-size="sm" type="text" />

<!-- Default -->
<input class="ds-input" type="text" />

<!-- Large — prominent search, primary CTA forms -->
<input class="ds-input" data-size="lg" type="text" />
```

## Input Group (Input + Button)

```html
<div class="ds-field">
  <label class="ds-field-label" for="invite-email">Invite by email</label>
  <div class="ds-input-group">
    <input class="ds-input" id="invite-email" type="email" placeholder="colleague@company.com" />
    <button class="ds-button" data-variant="primary" type="submit">Send invite</button>
  </div>
</div>
```

## Stacked Form

```html
<form>
  <div class="ds-field">
    <label class="ds-field-label" for="first-name">First name</label>
    <input class="ds-input" id="first-name" name="first-name" type="text" />
  </div>
  <div class="ds-field">
    <label class="ds-field-label" for="last-name">Last name</label>
    <input class="ds-input" id="last-name" name="last-name" type="text" />
  </div>
  <div class="ds-field">
    <label class="ds-field-label" for="email">Email</label>
    <input class="ds-input" id="email" name="email" type="email" />
  </div>
  <button class="ds-button" data-variant="primary" data-layout="full-width" type="submit">
    Create account
  </button>
</form>
```

## `data-state` Values

| Value | When to use |
|---|---|
| `error` | Validation failed; show `ds-field-error` |
| `success` | Value confirmed valid (e.g., username available) |

## Accessibility

- `<label>` must have `for` matching the input `id`. Never use placeholder as a substitute for a label.
- Hint and error text must be linked via `aria-describedby` pointing to the element's `id`.
- Error messages must have `role="alert"` so screen readers announce them immediately.
- `aria-invalid="true"` signals the error state to assistive technology.
- `aria-required="true"` supplements `required` for assistive technology compatibility.
- Disabled inputs should include a visible reason or use `readonly` if the value may be needed by the user.

## Anti-Patterns

```html
<!-- ✗ Never use placeholder alone as a label -->
<input class="ds-input" placeholder="Email address" />

<!-- ✗ Don't wire errors without aria-describedby -->
<input class="ds-input" aria-invalid="true" />
<p class="ds-field-error">Enter a valid email.</p>

<!-- ✗ Don't use data-state without a visible error message -->
<div class="ds-field" data-state="error">
  <input class="ds-input" /> <!-- user won't know what's wrong -->
</div>

<!-- ✗ Don't nest ds-field inside ds-field -->
<div class="ds-field">
  <div class="ds-field">...</div>
</div>
```

## Related Patterns

- `FormSection` — titled group of fields with a horizontal rule
- `SettingsPanel` — labeled section with fields and a save action
- `FilterBar` — inline fields for filtering a table or list
