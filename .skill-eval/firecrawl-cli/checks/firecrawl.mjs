import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const caseName = process.argv[2];
const criterionName = process.argv[3];
const criteria = buildCriteria();

if (!caseName || !criteria[caseName]) {
  finish(false, [`Unknown case: ${caseName ?? '(missing)'}`]);
}

if (criterionName) {
  const criterion = criteria[caseName][criterionName];
  if (!criterion) {
    finish(false, [`Unknown criterion: ${caseName} ${criterionName}`]);
  }
  runCriterion(criterion);
} else {
  const results = Object.values(criteria[caseName]).map((criterion) => evaluateCriterion(criterion));
  finish(results.every((result) => result.pass), results.flatMap((result) => result.evidence));
}

function runCriterion(criterion) {
  const result = evaluateCriterion(criterion);
  finish(result.pass, result.evidence);
}

function evaluateCriterion(criterion) {
  const calls = readCalls();
  const pass = criterion.pass(calls);
  return { pass, evidence: [pass ? criterion.passEvidence : criterion.failEvidence] };
}

function buildCriteria() {
  return {
    'search-with-scrape': {
      'uses-search': criterion(
        (calls) => Boolean(findCall(calls, 'search')),
        'uses firecrawl search',
        'missing firecrawl search call',
      ),
      'search-scrapes-results': criterion(
        (calls) => Boolean(findCall(calls, 'search') && hasFlag(findCall(calls, 'search').args, '--scrape')),
        'scrapes search results directly',
        'search did not use --scrape',
      ),
      'search-json-output': criterion(
        (calls) => Boolean(findCall(calls, 'search') && hasFlag(findCall(calls, 'search').args, '--json')),
        'requests JSON search output',
        'search did not request --json output',
      ),
      'saves-search-output': criterion(
        (calls) => Boolean(findCall(calls, 'search') && hasOutput(findCall(calls, 'search').args)),
        'saves search output under .firecrawl',
        'search output was not saved under .firecrawl',
      ),
      'avoids-redundant-scrape': criterion(
        (calls) => !findCall(calls, 'scrape'),
        'does not redundantly scrape search results',
        'called scrape after search --scrape should have been sufficient',
      ),
    },
    'scrape-known-url': {
      'uses-scrape': criterion(
        (calls) => Boolean(findCall(calls, 'scrape')),
        'uses firecrawl scrape',
        'missing firecrawl scrape call',
      ),
      'scrapes-requested-url': criterion(
        (calls) => Boolean(findCall(calls, 'scrape')?.args.includes('https://example.com/docs?tab=api&lang=ts')),
        'scrapes the requested URL',
        'scrape did not target the requested URL',
      ),
      'saves-markdown-output': criterion(
        (calls) => Boolean(findCall(calls, 'scrape') && hasOutput(findCall(calls, 'scrape').args)),
        'saves scraped markdown under .firecrawl',
        'scrape output was not saved under .firecrawl',
      ),
      'avoids-known-url-search': criterion(
        (calls) => !findCall(calls, 'search'),
        'does not search for a known URL',
        'searched even though the URL was already known',
      ),
    },
    'map-site-for-auth': {
      'uses-map': criterion(
        (calls) => Boolean(findCall(calls, 'map')),
        'uses firecrawl map',
        'missing firecrawl map call',
      ),
      'maps-docs-site': criterion(
        (calls) => Boolean(findCall(calls, 'map')?.args.includes('https://docs.example.com')),
        'maps the known docs site',
        'map did not target https://docs.example.com',
      ),
      'filters-for-auth': criterion(
        (calls) => Boolean(flagValue(findCall(calls, 'map')?.args ?? [], '--search')?.toLowerCase().includes('auth')),
        'filters map results for auth',
        'map did not use --search with auth intent',
      ),
      'saves-map-output': criterion(
        (calls) => Boolean(findCall(calls, 'map') && hasOutput(findCall(calls, 'map').args)),
        'saves map output under .firecrawl',
        'map output was not saved under .firecrawl',
      ),
    },
    'crawl-docs-section': {
      'uses-crawl': criterion(
        (calls) => Boolean(findCall(calls, 'crawl')),
        'uses firecrawl crawl',
        'missing firecrawl crawl call',
      ),
      'crawls-docs-host': criterion(
        (calls) => Boolean(findCall(calls, 'crawl')?.args.includes('https://docs.example.com')),
        'crawls the requested docs host',
        'crawl did not target https://docs.example.com',
      ),
      'scopes-to-docs': criterion(
        (calls) => flagValue(findCall(calls, 'crawl')?.args ?? [], '--include-paths') === '/docs',
        'scopes crawl to /docs',
        'crawl did not use --include-paths /docs',
      ),
      'waits-for-results': criterion(
        (calls) => Boolean(findCall(calls, 'crawl') && hasFlag(findCall(calls, 'crawl').args, '--wait')),
        'waits for crawl results',
        'crawl did not use --wait',
      ),
      'bounds-page-limit': criterion(
        (calls) => boundedLimit(findCall(calls, 'crawl')?.args ?? [], 50),
        'uses a bounded page limit',
        'crawl did not use a positive --limit at or below 50',
      ),
      'saves-crawl-output': criterion(
        (calls) => Boolean(findCall(calls, 'crawl') && hasOutput(findCall(calls, 'crawl').args)),
        'saves crawl output under .firecrawl',
        'crawl output was not saved under .firecrawl',
      ),
    },
    'parse-local-pdf': {
      'uses-parse': criterion(
        (calls) => Boolean(findCall(calls, 'parse')),
        'uses firecrawl parse',
        'missing firecrawl parse call',
      ),
      'parses-local-path': criterion(
        (calls) => isReportPdf(findCall(calls, 'parse')?.args ?? []),
        'parses the local PDF path',
        'parse did not target /work/docs/report.pdf',
      ),
      'saves-parse-output': criterion(
        (calls) => Boolean(findCall(calls, 'parse') && hasOutput(findCall(calls, 'parse').args)),
        'saves parsed markdown under .firecrawl',
        'parse output was not saved under .firecrawl',
      ),
      'avoids-local-file-scrape': criterion(
        (calls) => !findCall(calls, 'scrape'),
        'does not scrape a local file',
        'called scrape for a local file instead of parse',
      ),
    },
  };
}

function criterion(pass, passEvidence, failEvidence) {
  return { pass, passEvidence, failEvidence };
}

function readCalls() {
  const logPath = join(process.env.WORK, 'firecrawl-calls.ndjson');
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function findCall(calls, command) {
  return calls.find((call) => call.args[0] === command);
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function flagValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasOutput(args) {
  const output = flagValue(args, '-o') || flagValue(args, '--output');
  return Boolean(output?.startsWith('.firecrawl/') || output?.startsWith('/work/.firecrawl/'));
}

function boundedLimit(args, max) {
  const value = Number(flagValue(args, '--limit'));
  return Number.isFinite(value) && value > 0 && value <= max;
}

function isReportPdf(args) {
  return args.includes('/work/docs/report.pdf') || args.includes('docs/report.pdf') || args.includes('./docs/report.pdf');
}

function finish(pass, evidence) {
  console.log(JSON.stringify({ pass, score: pass ? 1 : 0, evidence }));
  process.exit(pass ? 0 : 1);
}
