# firecrawl map

Discover URLs on a site. Use `--search` when the site is known but the exact page is not.

```bash
firecrawl map "https://docs.example.com" --search "authentication" -o .firecrawl/auth-urls.txt
firecrawl map "https://docs.example.com" --limit 500 --json -o .firecrawl/urls.json
```
