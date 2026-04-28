# firecrawl parse

Turn a local document into clean markdown on disk. Use for PDF, DOCX, XLSX, HTML, and similar local files. Use `scrape` for URLs, not local files.

```bash
mkdir -p .firecrawl
firecrawl parse ./paper.pdf -o .firecrawl/paper.md
```

Always save parsed docs with `-o` under `.firecrawl/`.
