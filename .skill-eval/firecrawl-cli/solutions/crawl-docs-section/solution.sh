mkdir -p .firecrawl
firecrawl crawl "https://docs.example.com" --include-paths /docs --limit 20 --wait -o .firecrawl/docs-crawl.json
