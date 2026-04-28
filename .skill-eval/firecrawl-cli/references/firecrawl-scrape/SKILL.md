# firecrawl scrape

Scrape one or more known URLs. Use when you have a specific URL and want its content.

```bash
firecrawl scrape "<url>" -o .firecrawl/page.md
firecrawl scrape "<url>" --only-main-content -o .firecrawl/page.md
```

Always quote URLs, especially URLs containing `?` or `&`.
