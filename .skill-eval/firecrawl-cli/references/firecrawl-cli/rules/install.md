# Firecrawl CLI Installation

Check status first:

```bash
firecrawl --status
```

If the CLI is missing, run:

```bash
npx -y firecrawl-cli@1.14.8 -y
```

Then verify with one small output-saving request:

```bash
mkdir -p .firecrawl
firecrawl scrape "https://firecrawl.dev" -o .firecrawl/install-check.md
```
