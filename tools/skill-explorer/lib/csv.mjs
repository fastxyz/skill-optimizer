import { readFileSync } from 'node:fs';
import Papa from 'papaparse';

export function parseRegistriesCsv(path) {
  const text = readFileSync(path, 'utf-8');
  const { data, errors } = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (errors.length > 0) {
    throw new Error(`CSV parse errors in ${path}: ${JSON.stringify(errors.slice(0, 3))}`);
  }
  return data.map((row, idx) => ({
    id: slugify(row.source_name) || `registry-${idx}`,
    name: row.source_name ?? '',
    operator: row.operator ?? '',
    type: row.type ?? '',
    description: row.description ?? '',
    url: row.url ?? '',
    skill_count_estimate: row.skill_count_estimate ?? '',
    notes: row.notes ?? '',
  }));
}

export function emitSkillsCsv(skills) {
  const rows = skills.map((s) => ({
    name: s.name ?? '',
    author: s.author ?? '',
    popularity: s.popularity ?? '',
    description: s.description ?? '',
    sources: Array.isArray(s.sources) ? s.sources.join('|') : (s.sources ?? ''),
    url: s.url ?? '',
    notes: s.notes ?? '',
  }));
  return Papa.unparse(rows, { header: true, newline: '\n' });
}

function slugify(str) {
  return String(str ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
