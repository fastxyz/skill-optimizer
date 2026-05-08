# Proposed upstream changes for `anthropics/skills/pdf`

## Result

No changes proposed. The upstream skill already guides models to
100% pass rate on the eval suite (36/36 trials, 4 cases, 3 models).

## Evidence

| Case | Pass rate |
| --- | --- |
| extract-pdf-facts | 9/9 |
| split-customer-packet | 9/9 |
| build-briefing-pdf | 9/9 |
| no-pdf-skill-needed | 9/9 |

Models tested: `claude-sonnet-4.6`, `gpt-5-mini`, `gemini-2.5-pro`
(3 trials each).

## Eval suite

The eval suite is at `examples/workbench/pdf/`. To reproduce:

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx src/cli.ts run-suite examples/workbench/pdf/suite.yml --trials 3
```

## Diff vs upstream

`before-SKILL.md` and `after-SKILL.md` are identical — no changes
were needed. The diff between upstream and the vendored eval copy
removes references to `REFERENCE.md` and `FORMS.md` (both 404 upstream)
but that is an eval-only convenience, not a proposed upstream change.
