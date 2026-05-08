// Grader for review-scrape-integration case.
// Checks that findings.txt identifies the 5 deliberate violations in
// workspace/ScrapeService.ts against the firecrawl-build-scrape skill rules.

import { join } from 'node:path';
import {
  gradeFindings,
  looseRange,
  fuzzyKeyword,
  tolerantKeyword,
} from './_grader-utils.mjs';

const findingsPath = join(process.env.WORK, 'findings.txt');

// ScrapeService.ts violation map (line numbers verified against workspace/ScrapeService.ts):
//
//  V1 (line ~10): scrapeArticle — missing onlyMainContent for article-like page
//  V2 (line ~18): scrapeCompanyPage — uses 'html' format instead of markdown default
//  V3 (line ~27): scrapeNews — unnecessary waitFor: 5000 on a static news site
//  V4 (line ~34): findAndScrapeCompany — passes query string instead of URL (should escalate to search)
//  V5 (line ~43): scrapeDocPage — requests too many formats; violates narrow-contract rule

const expected = [
  {
    id: 'V1-missing-onlyMainContent',
    // Absence violation: looseRange with wider tolerance so function-level references match
    lines: looseRange(10, 10),
    keywords: [
      tolerantKeyword('onlyMainContent'),
      fuzzyKeyword('main content'),
      tolerantKeyword('article'),
      tolerantKeyword('nav'),
      tolerantKeyword('noise'),
    ],
  },
  {
    id: 'V2-html-format',
    lines: looseRange(18, 8),
    keywords: [
      tolerantKeyword('html'),
      tolerantKeyword('format'),
      tolerantKeyword('markdown'),
    ],
  },
  {
    id: 'V3-unnecessary-waitFor',
    lines: looseRange(27, 8),
    keywords: [
      tolerantKeyword('waitFor'),
      tolerantKeyword('wait'),
      tolerantKeyword('render'),
      tolerantKeyword('static'),
      tolerantKeyword('unnecessar'),
    ],
  },
  {
    id: 'V4-query-not-url',
    // Escalation violation: model may reference function declaration or scrape call
    lines: looseRange(34, 10),
    keywords: [
      tolerantKeyword('search'),
      tolerantKeyword('escalat'),
      fuzzyKeyword('search skill'),
      tolerantKeyword('URL'),
      tolerantKeyword('query'),
    ],
  },
  {
    id: 'V5-too-broad-contract',
    lines: looseRange(43, 10),
    keywords: [
      tolerantKeyword('narrow'),
      tolerantKeyword('screenshot'),
      fuzzyKeyword('multiple format'),
      tolerantKeyword('contract'),
      tolerantKeyword('broad'),
      tolerantKeyword('format'),
    ],
  },
];

gradeFindings({
  findingsPath,
  file: 'ScrapeService.ts',
  expected,
});
