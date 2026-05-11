---
skill: anthropics/skills/pptx
status: success
classification: document-producer
baseline_rule_coverage: 0.85
final_rule_coverage: 0.85
modifications_tried: 0
total_cost_usd: 0.64
---

# Auto-pilot run for `anthropics/skills/pptx`

- Classified as **document-producer**: the skill guides agents to produce PPTX files via `pptxgenjs` (scratch) or unpack/edit/pack XML workflow (templates), and read them via `python -m markitdown`.
- Three eval cases: `extract-pptx-facts` (read a 4-slide deck → answer.json), `create-product-deck` (create deck.pptx from scratch with 5 required content strings), `no-pptx-skill-needed` (control case, skill must not be read unnecessarily).
- Setup uses `bash -c "source /work/.venv/bin/activate && pip install --no-cache-dir ..."` to work around `PIP_REQUIRE_VIRTUALENV=1` and `XDG_CACHE_HOME=/work/.cache` in the workbench Docker image.
- **Grader iteration 0 (not counted):** discovered that pptxgenjs renders styled headings as separate `<a:t>` runs (e.g. "Key" bold + "Features" normal). Fixed grader to trim and join runs with a space instead of newlines. This lifted `create-product-deck` from 5/9 to 8/9 pass.
- **Baseline after calibration:** 23/27 = 0.85 overall. Remaining failure: `gpt-4o-mini` on `extract-pptx-facts` (0/3) — the model never reads `pptx/SKILL.md`, never uses `markitdown`, and cannot parse the binary PPTX. Claude and Gemini pass 3/3 on both creation and extraction cases.
- No upstream skill modifications proposed: baseline already ≥ 0.85 and the gpt-4o-mini failure is a model-capability gap (does not follow appendSystemPrompt guidance), not a gap in the skill text itself.
