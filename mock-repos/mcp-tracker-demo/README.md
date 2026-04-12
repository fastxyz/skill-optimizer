# mcp-tracker-demo

A minimal MCP server used to demonstrate `skill-optimizer` end-to-end.

## What this shows

- How to configure `skill-optimizer.json` for an MCP surface
- Task generation, benchmarking, and optimization against a small tool set

## Quickstart

```bash
# From the skill-optimizer repo root:
export OPENROUTER_API_KEY=sk-or-...

# Preview the surface without any LLM calls:
npx skill-optimizer --dry-run --config mock-repos/mcp-tracker-demo/skill-optimizer.json

# Run the benchmark only:
npx skill-optimizer run --config mock-repos/mcp-tracker-demo/skill-optimizer.json

# Run the full optimization loop:
npx skill-optimizer optimize --config mock-repos/mcp-tracker-demo/skill-optimizer.json
```

## Files

- `SKILL.md` — the guidance document being evaluated and improved
- `tools.json` — MCP tool definitions (used for manifest discovery)
- `src/server.ts` — the actual server implementation (used for code-first discovery)
- `skill-optimizer.json` — benchmark + optimizer config
