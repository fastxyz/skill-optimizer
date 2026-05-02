import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateSync } from 'node:zlib';

function escapePdfLiteral(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function unescapePdfLiteral(value) {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== '\\') {
      output += char;
      continue;
    }

    const next = value[index + 1];
    if (next === undefined) {
      output += '\\';
      continue;
    }

    if (/[0-7]/.test(next)) {
      const match = value.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] ?? next;
      output += String.fromCharCode(Number.parseInt(match, 8));
      index += match.length;
      continue;
    }

    index += 1;
    if (next === 'n') output += '\n';
    else if (next === 'r') output += '\r';
    else if (next === 't') output += '\t';
    else if (next === 'b') output += '\b';
    else if (next === 'f') output += '\f';
    else if (next === '\n' || next === '\r') output += '';
    else output += next;
  }
  return output;
}

function contentStreamForPage(pageText) {
  const lines = String(pageText).split(/\r?\n/);
  return [
    'BT',
    '/F1 12 Tf',
    '72 720 Td',
    ...lines.flatMap((line, index) => [
      index === 0 ? null : '0 -18 Td',
      `(${escapePdfLiteral(line)}) Tj`,
    ]).filter(Boolean),
    'ET',
  ].join('\n');
}

export function createPdf(filePath, pages) {
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error('createPdf requires at least one page');
  }

  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  const contentObjectIds = pages.map((_, index) => 5 + index * 2);
  const objects = new Map();

  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  for (let index = 0; index < pages.length; index += 1) {
    const pageObjectId = pageObjectIds[index];
    const contentObjectId = contentObjectIds[index];
    const stream = contentStreamForPage(pages[index]);
    objects.set(pageObjectId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.set(contentObjectId, `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`);
  }

  const maxObjectId = Math.max(...objects.keys());
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    const body = objects.get(objectId);
    if (!body) {
      throw new Error(`missing PDF object ${objectId}`);
    }
    offsets[objectId] = Buffer.byteLength(pdf, 'ascii');
    pdf += `${objectId} 0 obj\n${body}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${maxObjectId + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
    pdf += `${String(offsets[objectId]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, pdf, 'ascii');
}

export function readTextFile(filePath) {
  return readFileSync(filePath, 'latin1');
}

export function isPdfFile(filePath) {
  const raw = readTextFile(filePath);
  return raw.startsWith('%PDF-') && raw.includes('%%EOF');
}

export function countPdfPages(filePath) {
  const raw = readTextFile(filePath);
  return [...raw.matchAll(/\/Type\s*\/Page\b/g)].length;
}

function readFilters(dictionary) {
  const match = dictionary.match(/\/Filter\s*(\[[^\]]+\]|\/\w+)/);
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/\/(\w+)/g)].map((filter) => filter[1]);
}

function ascii85Decode(buffer) {
  const input = buffer.toString('latin1').replace(/\s+/g, '').replace(/^<~/, '').replace(/~>$/, '');
  const bytes = [];
  let group = [];

  const flush = (values, outputLength) => {
    let value = 0;
    for (const digit of values) {
      value = value * 85 + digit;
    }
    const decoded = [
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ];
    bytes.push(...decoded.slice(0, outputLength));
  };

  for (const char of input) {
    if (char === 'z' && group.length === 0) {
      bytes.push(0, 0, 0, 0);
      continue;
    }
    group.push(char.charCodeAt(0) - 33);
    if (group.length === 5) {
      flush(group, 4);
      group = [];
    }
  }

  if (group.length > 0) {
    const outputLength = group.length - 1;
    while (group.length < 5) group.push(84);
    flush(group, outputLength);
  }

  return Buffer.from(bytes);
}

function decodeStream(filters, streamContent) {
  let buffer = Buffer.from(streamContent, 'latin1');
  for (const filter of filters) {
    if (filter === 'ASCII85Decode' || filter === 'A85') {
      buffer = ascii85Decode(buffer);
    } else if (filter === 'FlateDecode' || filter === 'Fl') {
      buffer = inflateSync(buffer);
    }
  }
  return buffer.toString('latin1');
}

function decodedContentStreams(raw) {
  const streams = [raw];
  const pattern = /(<<[\s\S]*?>>)\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    const filters = readFilters(match[1]);
    try {
      streams.push(decodeStream(filters, match[2]));
    } catch {
      streams.push(match[2]);
    }
  }
  return streams;
}

function extractPdfStringLiterals(value) {
  const texts = [];
  const literalPattern = /\(((?:\\.|[^\\)])*)\)/g;
  let match;
  while ((match = literalPattern.exec(value)) !== null) {
    texts.push(unescapePdfLiteral(match[1]));
  }
  return texts;
}

export function extractSimplePdfText(filePath) {
  const raw = readTextFile(filePath);
  const texts = [];

  for (const stream of decodedContentStreams(raw)) {
    const tjPattern = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjPattern.exec(stream)) !== null) {
      texts.push(unescapePdfLiteral(tjMatch[1]));
    }

    const tjArrayPattern = /\[([\s\S]*?)\]\s*TJ/g;
    let arrayMatch;
    while ((arrayMatch = tjArrayPattern.exec(stream)) !== null) {
      texts.push(extractPdfStringLiterals(arrayMatch[1]).join(''));
    }
  }

  return texts.join('\n');
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export function result(pass, evidence, score = pass ? 1 : 0) {
  return {
    pass,
    score,
    evidence: Array.isArray(evidence) ? evidence : [String(evidence)],
  };
}

export function printResult(passOrResult, evidence, score) {
  const output = typeof passOrResult === 'object' && passOrResult !== null
    ? passOrResult
    : result(passOrResult, evidence, score);
  console.log(JSON.stringify(output));
  process.exit(output.pass ? 0 : 1);
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    printResult(false, `${name} env var is required`);
  }
  return value;
}

export function missingStrings(text, expected) {
  return expected.filter((value) => !text.includes(value));
}

export function writeInputPdfs(rootDir) {
  createPdf(join(rootDir, 'statement.pdf'), [
    [
      'Quarterly Statement',
      'Account: Delta Orchard Cooperative',
      'Quarter: Q4 2025',
      'Total Revenue: $128,430.00',
      'Risk Flag: inventory write-down',
      'Risk Flag: late supplier audit',
      'Approval Code: PDF-7429',
    ].join('\n'),
  ]);

  createPdf(join(rootDir, 'customer-packet.pdf'), [
    [
      'CUSTOMER COPY',
      'Invoice: C-204',
      'Status: PAID',
      'Customer: Northwind Labs',
    ].join('\n'),
    [
      'INTERNAL NOTES',
      'Do not share with customer.',
      'Margin review pending.',
    ].join('\n'),
    [
      'CUSTOMER COPY',
      'Warranty Code: W-8832',
      'Support Tier: Priority',
    ].join('\n'),
  ]);

  createPdf(join(rootDir, 'briefing-source.pdf'), [
    [
      'Renewal Source Notes',
      'Source: Alpine Sensors',
      'Decision: approve expedited renewal',
      'Deadline: 2026-05-14',
      'draft-only note: internal discount floor is 18 percent',
    ].join('\n'),
  ]);
}

if (process.argv[1] === new URL(import.meta.url).pathname && process.argv[2] === 'write-inputs') {
  const outputDir = process.argv[3];
  if (!outputDir) {
    throw new Error('Usage: node _pdf.mjs write-inputs <output-dir>');
  }
  writeInputPdfs(outputDir);
}
