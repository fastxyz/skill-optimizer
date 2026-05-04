---
name: pdf
description: Use this skill when a task requires reading, creating, splitting, merging, or otherwise manipulating PDF files.
---

# PDF Skill Demo

Use Python packages installed in `/work/.venv` for PDF work. Common choices:

- `pypdf` for reading, splitting, and writing pages
- `pdfplumber` for extracting text from PDFs
- `reportlab` for creating new PDFs

Always inspect the extracted text before writing parsing regexes. Do not guess labels or field formats from the task prompt.

Example text extraction:

```python
from pypdf import PdfReader

reader = PdfReader("input.pdf")
text = "\n".join(page.extract_text() or "" for page in reader.pages)
print(text)
```

Example structured extraction after inspecting text:

```python
from pypdf import PdfReader
import json

reader = PdfReader("statement.pdf")
text = "\n".join(page.extract_text() or "" for page in reader.pages)
lines = [line.strip() for line in text.splitlines() if line.strip()]

answer = {"riskFlags": []}
for line in lines:
    if line.startswith("Account:"):
        answer["account"] = line.split(":", 1)[1].strip()
    elif line.startswith("Quarter:"):
        answer["quarter"] = line.split(":", 1)[1].strip()
    elif line.startswith("Total Revenue:"):
        raw = line.split(":", 1)[1].strip().replace("$", "").replace(",", "")
        answer["totalRevenue"] = float(raw)
    elif line.startswith("Risk Flag:"):
        answer["riskFlags"].append(line.split(":", 1)[1].strip())
    elif line.startswith("Approval Code:"):
        answer["approvalCode"] = line.split(":", 1)[1].strip()

with open("answer.json", "w") as output:
    json.dump(answer, output, indent=2)
```

Example page filtering:

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
writer = PdfWriter()
writer.add_page(reader.pages[0])

with open("output.pdf", "wb") as output:
    writer.write(output)
```

Example page filtering by extracted page text:

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("customer-packet.pdf")
writer = PdfWriter()

for page in reader.pages:
    text = page.extract_text() or ""
    if "CUSTOMER COPY" in text and "INTERNAL NOTES" not in text:
        writer.add_page(page)

with open("customer-copy.pdf", "wb") as output:
    writer.write(output)
```
