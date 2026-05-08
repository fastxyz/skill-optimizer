---
description: Review UI code for Vercel Web Interface Guidelines compliance
argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review these files for compliance: $ARGUMENTS

Read files, check against rules below. Output concise but comprehensive—sacrifice grammar for brevity. High signal-to-noise.

## Review workflow

Do BOTH passes. Pass 2 is what catches most real bugs.

**Pass 1 — visible anti-patterns.** Scan for literal patterns: `<div onClick>` for actions, `transition: all`, `outline-none` className, `onPaste={(e) => e.preventDefault()}`, three-dots `"..."`, straight `"..."` quotes, etc. One finding per match against the rules below.

**Pass 2 — absences (per-element checklist).** Walk every `<img>`, `<input>`, `<button>`, `<form>`, list-render, animation, and interactive element once and run the checklist in **"Per-element review"** below. Report every attribute or behavior that should be present but isn't. This pass catches "what's missing" rules that are easy to overlook.

## Rules

### Accessibility

- Icon-only buttons need `aria-label`
- Form controls need `<label>` or `aria-label`
- Interactive elements need keyboard handlers (`onKeyDown`/`onKeyUp`)
- `<button>` for actions, `<a>`/`<Link>` for navigation (not `<div onClick>`)
- Images need `alt` (or `alt=""` if decorative)
- Decorative icons need `aria-hidden="true"`
- Async updates (toasts, validation) need `aria-live="polite"`
- Use semantic HTML (`<button>`, `<a>`, `<label>`, `<table>`) before ARIA
- Headings hierarchical `<h1>`–`<h6>`; include skip link for main content
- `scroll-margin-top` on heading anchors

### Focus States

- Interactive elements need visible focus: `focus-visible:ring-*` or equivalent
- Never `outline-none` / `outline: none` without focus replacement
- Use `:focus-visible` over `:focus` (avoid focus ring on click)
- Group focus with `:focus-within` for compound controls

### Forms

- Inputs need `autocomplete` and meaningful `name`
- Use correct `type` (`email`, `tel`, `url`, `number`) and `inputmode`
- Never block paste (`onPaste` + `preventDefault`)
- Labels clickable (`htmlFor` or wrapping control)
- Disable spellcheck on emails, codes, usernames (`spellCheck={false}`)
- Checkboxes/radios: label + control share single hit target (no dead zones)
- Submit button stays enabled until request starts; spinner during request
- Errors inline next to fields; focus first error on submit
- Placeholders end with `…` and show example pattern
- `autocomplete="off"` on non-auth fields to avoid password manager triggers
- Warn before navigation with unsaved changes (`beforeunload` or router guard)

### Animation

- Honor `prefers-reduced-motion` (provide reduced variant or disable)
- Animate `transform`/`opacity` only (compositor-friendly)
- Never `transition: all`—list properties explicitly
- Set correct `transform-origin`
- SVG: transforms on `<g>` wrapper with `transform-box: fill-box; transform-origin: center`
- Animations interruptible—respond to user input mid-animation

### Typography

- `…` not `...`
- Curly quotes `"` `"` not straight `"`
- Non-breaking spaces: `10&nbsp;MB`, `⌘&nbsp;K`, brand names
- Loading states end with `…`: `"Loading…"`, `"Saving…"`
- `font-variant-numeric: tabular-nums` for number columns/comparisons
- Use `text-wrap: balance` or `text-pretty` on headings (prevents widows)

### Content Handling

- Text containers handle long content: `truncate`, `line-clamp-*`, or `break-words`
- Flex children need `min-w-0` to allow text truncation
- Handle empty states—don't render broken UI for empty strings/arrays
- User-generated content: anticipate short, average, and very long inputs

### Images

- `<img>` needs explicit `width` and `height` (prevents CLS)
- Below-fold images: `loading="lazy"`
- Above-fold critical images: `priority` or `fetchpriority="high"`

### Performance

- Large lists (>50 items): virtualize (`virtua`, `content-visibility: auto`)
- No layout reads in render (`getBoundingClientRect`, `offsetHeight`, `offsetWidth`, `scrollTop`)
- Batch DOM reads/writes; avoid interleaving
- Prefer uncontrolled inputs; controlled inputs must be cheap per keystroke
- Add `<link rel="preconnect">` for CDN/asset domains
- Critical fonts: `<link rel="preload" as="font">` with `font-display: swap`

### Navigation & State

- URL reflects state—filters, tabs, pagination, expanded panels in query params
- Links use `<a>`/`<Link>` (Cmd/Ctrl+click, middle-click support)
- Deep-link all stateful UI (if uses `useState`, consider URL sync via nuqs or similar)
- Destructive actions need confirmation modal or undo window—never immediate

### Touch & Interaction

- `touch-action: manipulation` (prevents double-tap zoom delay)
- `-webkit-tap-highlight-color` set intentionally
- `overscroll-behavior: contain` in modals/drawers/sheets
- During drag: disable text selection, `inert` on dragged elements
- `autoFocus` sparingly—desktop only, single primary input; avoid on mobile

### Safe Areas & Layout

- Full-bleed layouts need `env(safe-area-inset-*)` for notches
- Avoid unwanted scrollbars: `overflow-x-hidden` on containers, fix content overflow
- Flex/grid over JS measurement for layout

### Dark Mode & Theming

- `color-scheme: dark` on `<html>` for dark themes (fixes scrollbar, inputs)
- `<meta name="theme-color">` matches page background
- Native `<select>`: explicit `background-color` and `color` (Windows dark mode)

### Locale & i18n

- Dates/times: use `Intl.DateTimeFormat` not hardcoded formats
- Numbers/currency: use `Intl.NumberFormat` not hardcoded formats
- Detect language via `Accept-Language` / `navigator.languages`, not IP
- Brand names, code tokens, identifiers: wrap with `translate="no"` to prevent garbled auto-translation

### Hydration Safety

- Inputs with `value` need `onChange` (or use `defaultValue` for uncontrolled)
- Date/time rendering: guard against hydration mismatch (server vs client)
- `suppressHydrationWarning` only where truly needed

### Hover & Interactive States

- Buttons/links need `hover:` state (visual feedback)
- Interactive states increase contrast: hover/active/focus more prominent than rest

### Content & Copy

- Active voice: "Install the CLI" not "The CLI will be installed"
- Title Case for headings/buttons (Chicago style)
- Numerals for counts: "8 deployments" not "eight"
- Specific button labels: "Save API Key" not "Continue"
- Error messages include fix/next step, not just problem
- Second person; avoid first person
- `&` over "and" where space-constrained

### Anti-patterns (flag these)

- `user-scalable=no` or `maximum-scale=1` disabling zoom
- `onPaste` with `preventDefault`
- `transition: all`
- `outline-none` without focus-visible replacement
- Inline `onClick` navigation without `<a>`
- `<div>` or `<span>` with click handlers (should be `<button>`)
- Images without dimensions
- Large arrays `.map()` without virtualization
- Form inputs without labels
- Icon buttons without `aria-label`
- Hardcoded date/number formats (use `Intl.*`)
- `autoFocus` without clear justification

## Per-element review (Pass 2 checklist)

For each element in the file, walk the relevant checklist and flag every
attribute or behavior that should be present but isn't.

**Every `<img>`:**

- explicit `width` AND `height` (prevents CLS)
- above-fold critical → `priority` or `fetchpriority="high"` (LCP)
- below-fold → `loading="lazy"`
- decorative → `alt=""`, meaningful → descriptive `alt`

**Every `<input>`:**

- `autoComplete` set (use `"off"` for non-auth fields where you actively don't want autofill, but always set it)
- meaningful `name`
- correct `type` (`email`, `tel`, `url`, `number`) — never `text` for typed data
- `inputMode` for mobile keyboards
- `<label htmlFor>` or wrapping `<label>`
- NO `onPaste={(e) => e.preventDefault()}`
- emails / codes / usernames → `spellCheck={false}`

**Every `<button>` (any type):**

- visible focus style (`focus-visible:ring-*` — NOT `focus:ring-*`, which fires on click)
- `hover:` state for visual feedback (`hover:bg-*` or equivalent)
- `type="button"` if not a form submit (default `submit` causes accidental form submits)

**Every `<button type="submit">`:** (in addition to the above)

- stays enabled until the request starts; spinner during the request
- NEVER `disabled={!form.valid}` style — causes input-flicker and races with paste/autofill

**Every `<form>`:**

- errors inline next to fields, not just at top
- focus first error on submit
- warn before navigation with unsaved changes (`beforeunload` / router guard)

**Every list / array render (`.map(...)`):**

- empty-state branch (don't render broken UI for `[]`)
- > 50 expected items → virtualize

**Every interactive element:**

- visible focus (`focus-visible:ring-*` or equivalent)
- no `outline-none` / `outline: none` without a replacement focus style
- keyboard handler if not a native interactive element

**Every animation / transition:**

- honors `prefers-reduced-motion`
- animates `transform` / `opacity` only — NEVER `transition: all`
- interruptible

**Every modal / dialog / drawer / sheet:**

- `overscroll-behavior: contain` (prevent scroll bleed to page behind)
- `touch-action: manipulation` (no double-tap zoom delay)
- `env(safe-area-inset-*)` for notch-aware bottom action bars
- `autoFocus` only when there's a single primary input on desktop; avoid on mobile

**Every native `<select>` (when supporting dark mode):**

- explicit `background-color` AND `color` (Windows dark mode requires both)

**Every heading `<h1>`–`<h6>`:**

- `text-wrap: balance` or `text-pretty` (prevents widows)
- hierarchical levels — never skip (`<h1>` → `<h3>` is wrong; insert `<h2>`)
- `scroll-margin-top` on heading anchors that scroll-into-view

**Every brand name / code identifier in copy:**

- `translate="no"` to prevent garbled auto-translation

## Common-miss examples

These are the rules most often overlooked. The bad pattern looks idiomatic, which is why models (and humans) skip them.

**Submit button stays enabled until request starts.**

```jsx
// BAD: button disables based on form state. User types → deletes a char →
// button flickers off → autofill/paste race with state.
<button type="submit" disabled={!email}>Submit</button>

// GOOD: stays enabled. Spinner appears during the request.
<button type="submit" disabled={submitting}>
  {submitting ? <Spinner /> : 'Submit'}
</button>
```

**Never block paste.**

```jsx
// BAD: blocking paste — breaks password managers, accessibility tools,
// and users who copy from another tab.
<input onPaste={(e) => e.preventDefault()} />

// GOOD: allow paste; validate or normalize after if needed.
<input onPaste={(e) => { /* allow; optionally normalize value */ }} />
```

**Inputs need `autoComplete`.**

```jsx
// BAD: no autoComplete → browser can't fill, password managers stall.
<input type="email" name="email" />

// GOOD: explicit hint. Use `"off"` only for non-auth fields where you
// actively don't want autofill.
<input type="email" name="email" autoComplete="email" />
```

**Above-fold critical images need a priority hint.**

```jsx
// BAD: hero image with no priority. Browser de-prioritizes; LCP suffers.
<img src="/hero.jpg" alt="..." width={1200} height={600} />

// GOOD: hint that this image is critical for LCP.
<Image src="/hero.jpg" alt="..." width={1200} height={600} priority />
// or for plain <img>:
<img src="/hero.jpg" alt="..." width={1200} height={600} fetchpriority="high" />
```

**Handle empty states.**

```jsx
// BAD: empty list silently renders broken UI (empty <ul>, no message).
<ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>

// GOOD: explicit empty-state branch.
{items.length === 0 ? (
  <p className="text-muted">No items yet.</p>
) : (
  <ul>{items.map((i) => <li key={i.id}>{i.name}</li>)}</ul>
)}
```

**Use `focus-visible:`, not `focus:`.**

```jsx
// BAD: focus ring shows on mouse click too — visually noisy for non-keyboard users.
<button className="focus:ring-2 focus:ring-blue-500">Save</button>

// GOOD: focus ring only on keyboard navigation.
<button className="focus-visible:ring-2 focus-visible:ring-blue-500">Save</button>
```

**Brand names and code identifiers need `translate="no"`.**

```jsx
// BAD: machine translators garble brand names and code tokens
// ("Acme Cloud" might become "Cumulus de Acme" in another locale).
<h1>Welcome to Acme Cloud</h1>
<code>npm install acme-sdk</code>

// GOOD: tell auto-translation to leave these alone.
<h1>Welcome to <span translate="no">Acme Cloud</span></h1>
<code translate="no">npm install acme-sdk</code>
```

## Output Format

Group by file. Use `file:line` format (VS Code clickable). Terse findings.

```text
## src/Button.tsx

src/Button.tsx:42 - icon button missing aria-label
src/Button.tsx:18 - input lacks label
src/Button.tsx:55 - animation missing prefers-reduced-motion
src/Button.tsx:67 - transition: all → list properties

## src/Modal.tsx

src/Modal.tsx:12 - missing overscroll-behavior: contain
src/Modal.tsx:34 - "..." → "…"

## src/Card.tsx

✓ pass
```

State issue + location. Skip explanation unless fix non-obvious. No preamble.
