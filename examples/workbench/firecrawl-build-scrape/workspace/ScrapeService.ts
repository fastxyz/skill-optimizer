import FirecrawlApp from '@mendable/firecrawl-js';

const client = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY,
});

// Scrape a blog article and return its content.
export async function scrapeArticle(url: string): Promise<string> {
  const doc = await client.scrape(url, {
    formats: ['markdown'],
  });
  return doc.markdown ?? '';
}

// Scrape a company's homepage for CRM enrichment data.
export async function scrapeCompanyPage(url: string): Promise<string> {
  const doc = await client.scrape(url, {
    formats: ['html'],
  });
  return doc.html ?? '';
}

// Scrape a news article for content monitoring.
export async function scrapeNews(url: string): Promise<string> {
  const doc = await client.scrape(url, {
    formats: ['markdown'],
    waitFor: 5000,
  });
  return doc.markdown ?? '';
}

// Find and scrape a company's page given a search query.
export async function findAndScrapeCompany(query: string): Promise<string> {
  const doc = await client.scrape(query, {
    formats: ['markdown'],
  });
  return doc.markdown ?? '';
}

// Scrape a documentation page with all available output formats.
export async function scrapeDocPage(url: string) {
  const doc = await client.scrape(url, {
    formats: ['markdown', 'html', 'links', 'screenshot'],
    onlyMainContent: false,
  });
  return {
    markdown: doc.markdown,
    html: doc.html,
    links: doc.links,
    screenshot: doc.screenshot,
  };
}
