# shadcn/ui eval

Eval suite for
[`google-labs-code/stitch-skills/shadcn-ui`](https://github.com/google-labs-code/stitch-skills) —
Expert guidance for integrating and building applications with shadcn/ui components, including
component discovery, installation, customization, and best practices.

## Cases

### `review-usercard` — file structure, cn(), theming, ARIA

Sample: `workspace/UserCard.tsx`

| Line | Violation | Rule |
|---|---|---|
| 1  | Custom composed component placed in `components/ui/` instead of `components/` | Extending Components — "Create wrapper components in `components/` (not `components/ui/`)" |
| 18 | Class string built via `+` concatenation instead of `cn()` | The `cn()` Utility — "All shadcn components use the `cn()` helper for class merging" |
| 26 | Hard-coded Tailwind colors (`bg-blue-600`, etc.) instead of CSS design-token variables | Theme Customization — use `--primary`, `--foreground`, and other CSS variables |
| 42 | `aria-pressed={undefined}` and `aria-expanded={undefined}` explicitly strip ARIA props | Accessibility — "Keep ARIA attributes" when customizing |

### `review-statusbadge` — cva, cn(), interactive a11y, file structure

Sample: `workspace/StatusBadge.tsx`

| Line | Violation | Rule |
|---|---|---|
| 1  | Custom composed component placed in `components/ui/` instead of `components/` | Extending Components — "Create wrapper components in `components/` (not `components/ui/`)" |
| 17 | Variant logic via if/else conditionals instead of `cva` from class-variance-authority | Component Variants — "Use `class-variance-authority` (cva) for variant logic" |
| 26 | Class string built via `+` concatenation instead of `cn()` | The `cn()` Utility — "All shadcn components use the `cn()` helper for class merging" |
| 33 | `<div onClick>` without `role="button"` or keyboard handler | Accessibility — "Preserve keyboard handlers", "Keep ARIA attributes" |

## Vendored snapshot

The skill is self-contained (no remote WebFetch calls). The upstream SKILL.md is vendored
verbatim at `references/shadcn-ui/SKILL.md`. Diff vs upstream: none (no local-path tweak needed).

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4-6`
- `openrouter/openai/gpt-4o-mini`
- `openrouter/google/gemini-2.5-pro`
