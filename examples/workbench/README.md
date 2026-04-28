# Workbench Examples

These examples are small, demoable suites that exercise the Docker workbench end to end.

## PDF Skill Demo

```bash
npx tsx src/cli.ts verify-suite examples/workbench/pdf/suite.yml
npx tsx src/cli.ts run-suite examples/workbench/pdf/suite.yml --trials 1
```

`verify-suite` runs known-good `solution.sh` files through the graders without calling a model. It prints the preflight result to stdout without writing `.results`; use it first to prove the suite and graders are wired correctly.

`run-suite` runs the configured model matrix and writes `trace.jsonl`, `result.json`, and failed workspaces under `examples/workbench/pdf/.results/<run-id>/`.
