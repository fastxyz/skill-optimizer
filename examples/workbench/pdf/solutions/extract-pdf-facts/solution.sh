#!/bin/sh
set -eu

cat > answer.json <<'JSON'
{
  "account": "Delta Orchard Cooperative",
  "quarter": "Q4 2025",
  "totalRevenue": 128430,
  "riskFlags": ["inventory write-down", "late supplier audit"],
  "approvalCode": "PDF-7429"
}
JSON
