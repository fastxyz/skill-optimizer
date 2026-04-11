# MCP Tracker Demo Mock Repo

This template is a richer MCP optimizer target for issue-tracker style workflows.

The MCP tool schema now lives in code at `src/server.ts` and is discovered statically from exported literals.

The tool names and argument shapes are intentionally awkward, so benchmark quality depends on both:

- the discovered callable surface in `src/server.ts`
- the guidance in `SKILL.md`

`src/server.ts` is the primary discovery source for this template.

Use these files together:
- `skill-benchmark.json` for the unified benchmark + optimizer flow
- `src/server.ts` for the primary MCP surface definition used by discovery
- `benchmark.config.json` and `optimize.config.json` are legacy transitional files

This template now uses `optimize.mode: "surface-changing"` and allows edits to:

- `src/`
- `SKILL.md`
- `README.md`

So the orchestrator can rename or clarify the real MCP surface, not just rewrite docs. If a tool rename is accepted, the optimize loop starts a new benchmark epoch with a rediscovered surface and regenerated tasks.
