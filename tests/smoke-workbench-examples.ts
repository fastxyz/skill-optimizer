import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';

import { extractSimplePdfText } from '../examples/workbench/pdf/checks/_pdf.mjs';
import { noReadPath } from '../examples/workbench/pdf/checks/_trace.mjs';

function writeCompressedTextPdf(filePath: string, streamText: string): void {
  const compressed = deflateSync(Buffer.from(streamText, 'latin1'));
  const header = Buffer.from([
    '%PDF-1.4',
    '1 0 obj',
    '<< /Type /Catalog /Pages 2 0 R >>',
    'endobj',
    '2 0 obj',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    'endobj',
    '3 0 obj',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>',
    'endobj',
    '4 0 obj',
    `<< /Length ${compressed.length} /Filter /FlateDecode >>`,
    'stream',
  ].join('\n') + '\n', 'latin1');
  const footer = Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1');

  writeFileSync(filePath, Buffer.concat([header, compressed, footer]));
}

test('PDF example text extractor reads compressed Tj and TJ text streams', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-example-pdf-'));
  try {
    const pdfPath = join(root, 'reportlab-like.pdf');
    writeCompressedTextPdf(pdfPath, [
      'BT',
      '(PDF Skill Briefing) Tj',
      '[(Decision: approve) 120 ( expedited renewal)] TJ',
      'ET',
    ].join('\n'));

    const text = extractSimplePdfText(pdfPath);

    assert.match(text, /PDF Skill Briefing/);
    assert.match(text, /Decision: approve expedited renewal/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PDF trace helper fails when agent reads the PDF skill file', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-example-trace-'));
  try {
    const tracePath = join(root, 'trace.jsonl');
    writeFileSync(tracePath, [
      JSON.stringify({ type: 'trace_start', caseName: 'negative-pdf', model: 'openrouter/test/model' }),
      JSON.stringify({ type: 'tool_call', name: 'read', arguments: { path: '/work/pdf-skill/SKILL.md' } }),
    ].join('\n') + '\n', 'utf-8');

    const result = noReadPath(tracePath, /\/pdf-skill\/SKILL\.md$/);

    assert.equal(result.pass, false);
    assert.equal(result.score, 0);
    assert.deepEqual(result.evidence, ['forbidden read path: /work/pdf-skill/SKILL.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('PDF trace helper passes when trace does not read the PDF skill file', () => {
  const root = mkdtempSync(join(tmpdir(), 'skill-opt-example-trace-pass-'));
  try {
    const tracePath = join(root, 'trace.jsonl');
    writeFileSync(tracePath, [
      JSON.stringify({ type: 'trace_start', caseName: 'negative-pdf', model: 'openrouter/test/model' }),
      JSON.stringify({ type: 'tool_call', name: 'bash', arguments: { command: 'python script.py' } }),
    ].join('\n') + '\n', 'utf-8');

    const result = noReadPath(tracePath, /\/pdf-skill\/SKILL\.md$/);

    assert.equal(result.pass, true);
    assert.equal(result.score, 1);
    assert.deepEqual(result.evidence, ['no forbidden read paths found']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
