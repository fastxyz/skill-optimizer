cat > answer.json <<'JSON'
{
  "expression": "((17 + 25) * 3 - 18) / 6",
  "result": 18
}
JSON

cat > "$RESULTS/trace.jsonl" <<'JSONL'
{"type":"trace_start","schemaVersion":1,"caseName":"use-calculator-mcp","model":"reference","startedAt":"2026-05-01T00:00:00.000Z","endedAt":"2026-05-01T00:00:01.000Z"}
{"type":"tool_call","name":"bash","arguments":{"command":"mcp call calculator.add a=17 b=25"}}
{"type":"tool_call","name":"bash","arguments":{"command":"mcp call calculator.multiply a=42 b=3"}}
{"type":"tool_call","name":"bash","arguments":{"command":"mcp call calculator.subtract a=126 b=18"}}
{"type":"tool_call","name":"bash","arguments":{"command":"mcp call calculator.divide a=108 b=6"}}
JSONL
