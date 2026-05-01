# MCP Calculator Workbench Example

This example shows a local MCP server started as a separate hidden Docker service beside the agent container. The agent sees the `calculator` MCP URL through the workbench `mcp` command, but it cannot read the server source file. The server exposes calculator tools: `add`, `subtract`, `multiply`, and `divide`.

Run a model trial:

```bash
npx tsx src/cli.ts run-suite examples/workbench/mcp/suite.yml --trials 1
```

The case asks the agent to compute the expression and write `answer.json`. The grader checks the computed answer and verifies that the trace contains separate bash calls to `mcp call calculator.add`, `calculator.multiply`, `calculator.subtract`, and `calculator.divide`.
