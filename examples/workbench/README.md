# Workbench Examples

These examples are small, demoable suites that exercise the Docker workbench end to end.

See `../../docs/workbench.md` for the full workbench model, including cases, suites, graders, reference solutions, Docker phases, and result files.

## PDF Skill Demo

```bash
npx tsx src/cli.ts verify-suite examples/workbench/pdf/suite.yml
npx tsx src/cli.ts run-suite examples/workbench/pdf/suite.yml --trials 1
```

`verify-suite` runs known-good `solution.sh` files through setup and graders without calling a model. It is a host-side preflight, not a Docker model trial. It prints the result to stdout without writing `.results`; use it first to prove fixtures, reference solutions, and graders are wired correctly.

`run-suite` runs the configured model matrix and writes `trace.jsonl`, `result.json`, and failed workspaces under `examples/workbench/pdf/.results/<run-id>/`.

## MCP Calculator Demo

```bash
npx tsx src/cli.ts verify-suite examples/workbench/mcp/suite.yml
npx tsx src/cli.ts run-suite examples/workbench/mcp/suite.yml --trials 1
```

The MCP demo starts a local calculator MCP server as a separate hidden Docker service and exposes it through the workbench `mcp` command. The server has `add`, `subtract`, `multiply`, and `divide`; the grader checks both `answer.json` and `trace.jsonl` for MCP usage.
