# PDF Workbench Demo

This suite demonstrates the main workbench features with a PDF skill:

- `models`: suite-owned model matrix
- `env`: API key forwarding into the agent container
- `appendSystemPrompt`: suite-wide prompt additions
- `setup`: input generation before the agent starts
- `graders`: deterministic post-run checks
- trace grading: the negative case checks `trace.jsonl` for forbidden skill reads

## Run The Demo

```bash
npx tsx src/cli.ts run-suite examples/workbench/pdf/suite.yml --trials 1
```

`run-suite` runs each case against the suite models. Results are written to:

```text
examples/workbench/pdf/.results/<run-id>/
  suite-result.json
  trials/<case>--<model>--001/result.json
  trials/<case>--<model>--001/trace.jsonl
```

Failed trials also preserve `workspace/` so you can inspect exactly what the agent wrote.

## Cases

- `extract-pdf-facts`: reads `statement.pdf` and writes exact structured JSON.
- `split-customer-packet`: keeps only customer-copy pages from a packet PDF.
- `build-briefing-pdf`: creates a valid one-page briefing PDF.
- `no-pdf-skill-needed`: writes a text file and fails if the agent reads `/work/pdf-skill/SKILL.md`.

The example skill under `references/pdf-skill/` is intentionally small and demo-safe. Replace it with a real skill to evaluate production PDF guidance.
