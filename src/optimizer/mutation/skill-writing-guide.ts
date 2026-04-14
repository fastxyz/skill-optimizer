/**
 * Curated guidance for writing effective SKILL.md files.
 *
 * Sourced from https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
 * Sections extracted: Skill Writing Guide, Writing Style, How to think about improvements.
 * Eval/iteration/viewer infrastructure sections omitted — not relevant to mutation.
 */
export const SKILL_WRITING_GUIDE = `
---BEGIN SKILL WRITING GUIDE (source: anthropics/skills skill-creator)---

## Write the SKILL.md

Based on the benchmark feedback, update these components:

- **name**: Skill identifier (do not change)
- **description**: When to trigger, what it does. This is the primary triggering mechanism — include
  both what the skill does AND specific contexts for when to use it. All "when to use" info goes
  here, not in the body. Note: Claude has a tendency to "undertrigger" skills. To combat this,
  make the description a little bit "pushy". For instance, instead of "How to use the fast CLI
  tool", write "How to use the fast CLI tool. Use this skill whenever the user mentions sending
  tokens, checking balances, managing accounts, or working with blockchain transactions — even if
  they don't explicitly ask for the fast CLI."
- **the rest of the skill**: markdown instructions that guide the model

## Skill Writing Guide

### Anatomy of a Skill

\`\`\`
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic/repetitive tasks
    ├── references/ - Docs loaded into context as needed
    └── assets/     - Files used in output (templates, icons, fonts)
\`\`\`

### Progressive Disclosure

Skills use a three-level loading system:
1. **Metadata** (name + description) — Always in context (~100 words)
2. **SKILL.md body** — In context whenever skill triggers (<500 lines ideal)
3. **Bundled resources** — As needed (unlimited, scripts can execute without loading)

Key patterns:
- Keep SKILL.md under 500 lines; if approaching this limit, add hierarchy with clear pointers
- Reference files clearly from SKILL.md with guidance on when to read them
- For large reference files (>300 lines), include a table of contents

### Writing Patterns

Prefer using the imperative form in instructions.

**Defining output formats:**
\`\`\`markdown
## Report structure
ALWAYS use this exact template:
# [Title]
## Executive summary
## Key findings
## Recommendations
\`\`\`

**Examples pattern — include concrete examples of correct call patterns:**
\`\`\`markdown
## Send tokens
**Example:** Send 0.01 ETH from Base to Ethereum
fast send 0x1234...abcd 0.01 --token ETH --from-chain base --to-chain ethereum
\`\`\`

### Writing Style

Try to explain to the model *why* things are important in lieu of heavy-handed MUSTs. Use theory
of mind and try to make the skill general and not super-narrow to specific examples. Start by
writing a draft and then look at it with fresh eyes and improve it.

## How to think about improvements

1. **Generalize from the feedback.** We're trying to create skills that work across many different
   prompts, not just the benchmark tasks. Rather than adding narrow rules for each failing case,
   find the underlying confusion and address the root cause with clearer conceptual framing. Avoid
   fiddly overfitty changes and oppressively constrictive MUSTs.

2. **Keep the prompt lean.** Remove things that aren't pulling their weight. Every line the model
   reads takes attention. If guidance doesn't change model behavior in practice, cut it.

3. **Explain the why.** Try hard to explain the *why* behind everything you're asking the model to
   do. Today's LLMs are smart — when given good reasoning they apply it intelligently to novel
   situations. If you find yourself writing ALWAYS or NEVER in all caps, or using super rigid
   structures, that's a yellow flag — reframe and explain the reasoning instead. That's a more
   humane, powerful, and effective approach.

4. **Surface the non-obvious.** Gotchas and pre-conditions that a model wouldn't infer from tool
   names are the highest-value content. Things like required ordering, mutually exclusive options,
   cases where a flag has no effect, and default behaviors that surprise users.

5. **Be explicit about parameters.** Models frequently hallucinate argument names or invent values.
   For each important command/method/tool: name the required parameters, list valid values or
   formats, and clarify which parameters are optional and their defaults.

---END SKILL WRITING GUIDE---
`.trim();
