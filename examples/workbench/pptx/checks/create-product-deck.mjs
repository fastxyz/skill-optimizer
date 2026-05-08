/**
 * Grader for create-product-deck case.
 *
 * Checks that deck.pptx:
 *   1. Exists and is a valid ZIP/PPTX
 *   2. Contains all 5 required content strings in slide XML text nodes
 *
 * Required strings (must be present verbatim):
 *   - "NovaSoft Analytics"          (company name, title slide)
 *   - "Smarter Business Decisions"  (title slide subtitle)
 *   - "Key Features"                (features slide heading)
 *   - "40%"                         (proven results statistic)
 *   - "novasoft.io"                 (call-to-action URL, closing slide)
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const WORK = process.env.WORK ?? '/work';
const filePath = join(WORK, 'deck.pptx');

function emitResult(pass, score, evidence) {
  console.log(JSON.stringify({ pass, score, evidence }));
  process.exit(pass ? 0 : 1);
}

if (!existsSync(filePath)) {
  emitResult(false, 0, ['deck.pptx was not created']);
}

// Validate it is a ZIP (all PPTX files are ZIP archives)
try {
  execSync(`unzip -t "${filePath}"`, { stdio: 'pipe' });
} catch {
  emitResult(false, 0, ['deck.pptx is not a valid ZIP/PPTX file']);
}

// Extract slides to a temp directory
const tmpDir = `/tmp/pptx-check-deck-${Date.now()}`;
try {
  mkdirSync(tmpDir, { recursive: true });
  execSync(`unzip -q "${filePath}" -d "${tmpDir}"`, { stdio: 'pipe' });
} catch {
  // unzip exits 1 on warnings but may still extract — continue
}

// Collect all text from slide XML files
let allXml = '';
try {
  allXml = execSync(
    `find "${tmpDir}/ppt/slides" -name "*.xml" -not -path "*/_rels/*" -exec cat {} \\;`,
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] },
  );
} catch {
  allXml = '';
}

// Cleanup temp dir
try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

// Extract text content from <a:t> elements.
// pptxgenjs sometimes splits styled headings across multiple runs in the same
// paragraph (e.g. "Key" bold + " Features" normal = two <a:t> nodes). Trim
// each run and join with a single space so adjacent runs reconstruct the full
// visible text. — G3: per-finding-line keyword matching lesson.
const textLines = allXml
  .split(/<a:t[^>]*>/)
  .slice(1)
  .map((chunk) => chunk.split('</a:t>')[0].trim())
  .filter(Boolean);
const extractedText = textLines.join(' ');

const required = [
  { id: 'company-name',    term: 'NovaSoft Analytics',         desc: 'company name (title slide)' },
  { id: 'title-subtitle',  term: 'Smarter Business Decisions',  desc: 'subtitle (title slide)' },
  { id: 'features-heading', term: 'Key Features',               desc: 'features slide heading' },
  { id: 'stat-40pct',      term: '40%',                        desc: 'proven-results statistic' },
  { id: 'cta-url',         term: 'novasoft.io',                 desc: 'call-to-action URL (closing slide)' },
];

const found   = required.filter((r) => extractedText.includes(r.term));
const missing = required.filter((r) => !extractedText.includes(r.term));
const pass    = found.length === required.length;

emitResult(pass, found.length / required.length, [
  `${found.length}/${required.length} required content items found in deck.pptx`,
  ...found.map((r)   => `+ ${r.id}: "${r.term}"`),
  ...missing.map((r) => `- ${r.id}: missing "${r.term}" (${r.desc})`),
]);
