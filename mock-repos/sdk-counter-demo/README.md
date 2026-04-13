# sdk-counter-demo

A minimal TypeScript SDK used to demonstrate `skill-optimizer` end-to-end.

The bundled `SKILL.md` intentionally omits the `amount` parameter, the `reset` method, and the `start` option — so the first benchmark run fails, then the optimizer proposes improvements.

## Quickstart

```bash
# From the skill-optimizer repo root:
export OPENROUTER_API_KEY=sk-or-...

# Preview the surface without any LLM calls:
npx skill-optimizer --dry-run --config mock-repos/sdk-counter-demo/skill-optimizer.json

# Run the benchmark only:
npx skill-optimizer run --config mock-repos/sdk-counter-demo/skill-optimizer.json

# Run the full optimization loop:
npx skill-optimizer optimize --config mock-repos/sdk-counter-demo/skill-optimizer.json
```

## Files

- `SKILL.md` — the guidance document being evaluated and improved
- `src/counter.ts` — the SDK source (used for code-first discovery)
- `skill-optimizer.json` — benchmark + optimizer config
