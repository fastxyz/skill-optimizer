---
name: firecrawl
description: |
  Search, scrape, and interact with the web via the Firecrawl CLI. Use this skill whenever the user wants to search the web, find articles, research a topic, look something up online, scrape a webpage, grab content from a URL, get data from a website, crawl documentation, download a site, or interact with pages that need clicks or logins. Do NOT trigger for local file operations, git commands, deployments, or code editing tasks.
allowed-tools:
  - Bash(firecrawl *)
  - Bash(npx firecrawl *)
---

# Firecrawl CLI

Search, scrape, and interact with the web. Returns clean markdown optimized for LLM context windows.

Run `firecrawl --help` or `firecrawl <command> --help` for full option details.

## Prerequisites

Must be installed and authenticated. Check with `firecrawl --status`.

## Workflow

Follow this escalation pattern:

1. **Search** - No specific URL yet. Find pages, answer questions, discover sources.
2. **Scrape** - Have a URL. Extract its content directly.
3. **Map + Scrape** - Large site or need a specific subpage. Use `map --search` to find the right URL, then scrape it.
4. **Crawl** - Need bulk content from an entire site section (e.g., all /docs/).
5. **Interact** - Scrape first, then interact with the page.

| Need | Command | When |
| --- | --- | --- |
| Find pages on a topic | `search` | No specific URL yet |
| Get a page's content | `scrape` | Have a URL |
| Find URLs within a site | `map` | Need to locate a specific subpage |
| Bulk extract a site section | `crawl` | Need many pages |
| Download a site to files | `download` | Save an entire site as local files |
| Parse a local file | `parse` | File on disk (PDF, DOCX, XLSX, etc.) - not a URL |

**Avoid redundant fetches:**

- `search --scrape` already fetches full page content. Do not re-scrape those URLs.
- Check `.firecrawl/` for existing data before fetching again.

## Output & Organization

Unless the user specifies to return in context, write results to `.firecrawl/` with `-o`. Add `.firecrawl/` to `.gitignore`. Always quote URLs - shell interprets `?` and `&` as special characters.

```bash
firecrawl search "react hooks" --scrape --limit 3 --json -o .firecrawl/search-react-hooks.json
firecrawl scrape "<url>" -o .firecrawl/page.md
```

Never read entire output files at once. Use grep, head, or incremental reads.
