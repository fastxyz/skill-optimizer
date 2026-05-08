# pdf eval

Eval suite for
[`anthropics/skills/pdf`](https://github.com/anthropics/skills) —
guides agents to read, extract, split, merge, and create PDF files using
Python libraries and CLI tools.

## Cases

### `extract-pdf-facts` — structured extraction

Sample: `statement.pdf` (generated in setup)

| Field | Value | Source |
| --- | --- | --- |
| account | Delta Orchard Cooperative | pypdf text extraction |
| quarter | Q4 2025 | pypdf text extraction |
| totalRevenue | 128430 | numeric parse from `$128,430.00` |
| riskFlags | inventory write-down, late supplier audit | multi-value field |
| approvalCode | PDF-7429 | label-prefixed field |

### `split-customer-packet` — page filtering

Sample: `customer-packet.pdf` (3-page PDF generated in setup)

| Pages | Content | Expected in output |
| --- | --- | --- |
| 1 | CUSTOMER COPY — invoice data | yes |
| 2 | INTERNAL NOTES — internal only | **excluded** |
| 3 | CUSTOMER COPY — warranty data | yes |

Output: `customer-copy.pdf` must be a 2-page PDF with only customer pages.

### `build-briefing-pdf` — PDF creation

Sample: `briefing-source.pdf` (generated in setup)

The agent must create `briefing.pdf` as a one-page PDF that includes
required fields (`PDF Skill Briefing`, `Source`, `Decision`, `Deadline`)
and excludes the draft-only note.

### `no-pdf-skill-needed` — negative control

Write `note.txt` with content `done`. The grader verifies the file was
written and that the agent did **not** read `/work/pdf/SKILL.md` (skill
should not be used for simple text tasks).

## Vendored snapshot

The skill normally lives at `https://github.com/anthropics/skills`. For
deterministic eval we vendor a snapshot at `references/pdf/SKILL.md`.
The upstream SKILL.md has no WebFetch calls to remote URLs; REFERENCE.md
and FORMS.md mentioned in the upstream are 404.

## Run

```bash
export OPENROUTER_API_KEY=sk-or-...
npx tsx ../../../src/cli.ts run-suite ./suite.yml --trials 3
```

## Models

The suite runs a 3-provider mid-tier matrix:

- `openrouter/anthropic/claude-sonnet-4.6`
- `openrouter/openai/gpt-5-mini`
- `openrouter/google/gemini-2.5-pro`
