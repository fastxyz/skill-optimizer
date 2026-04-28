# firecrawl crawl

Bulk extract content from a website or site section.

```bash
firecrawl crawl "https://docs.example.com" --include-paths /docs --limit 50 --wait -o .firecrawl/crawl.json
```

Use `--wait` when you need results immediately. Use `--include-paths` to avoid crawling the whole site.
