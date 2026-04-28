# firecrawl search

Web search with optional content scraping. Use when you do not have a specific URL yet.

```bash
firecrawl search "your query" -o .firecrawl/result.json --json
firecrawl search "your query" --scrape --limit 3 -o .firecrawl/scraped.json --json
```

Tips:

- `--scrape` fetches full content. Do not re-scrape URLs from search results.
- Always write results to `.firecrawl/` with `-o`.
- Use `--json` when saving search results for later analysis.
