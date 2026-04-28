---
name: pdf
description: Use this skill when a task requires reading, creating, splitting, merging, or otherwise manipulating PDF files.
---

# PDF Skill Demo

Use Python packages installed in `/work/.venv` for PDF work. Common choices:

- `pypdf` for reading, splitting, and writing pages
- `pdfplumber` for extracting text from PDFs
- `reportlab` for creating new PDFs

Example text extraction:

```python
from pypdf import PdfReader

reader = PdfReader("input.pdf")
text = "\n".join(page.extract_text() or "" for page in reader.pages)
print(text)
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
