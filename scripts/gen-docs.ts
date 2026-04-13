#!/usr/bin/env tsx
// scripts/gen-docs.ts — auto-generates docs/reference/ from code artifacts.
// Run via: npm run gen-docs
// Hooked into: npm run build

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ERRORS } from '../src/errors.js';
import { ProjectConfigSchema } from '../src/project/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const refDir = resolve(__dirname, '../docs/reference');
mkdirSync(refDir, { recursive: true });

const GENERATED_HEADER = '<!-- AUTO-GENERATED — do not edit. Run `npm run gen-docs` to regenerate. -->\n\n';

// ── errors.md ─────────────────────────────────────────────────────────────────

function generateErrorsMd(): string {
  const entries = Object.values(ERRORS);
  const lines: string[] = [
    GENERATED_HEADER,
    '# Error Reference',
    '',
    'Every `skill-optimizer` error has a code, a short message, and a fix list.',
    'The catch-all `E_UNEXPECTED` appears if an error slips past the known list.',
    '',
    '## Summary',
    '',
    '| Code | Description | Quick fix |',
    '|---|---|---|',
  ];

  for (const def of entries) {
    const msg = def.message.replace(/\|/g, '\\|');
    const quickFix = (def.fix[0] ?? '').replace(/\|/g, '\\|');
    lines.push(`| \`${def.code}\` | ${msg} | ${quickFix} |`);
  }

  lines.push('', '## Details', '');

  for (const def of entries) {
    lines.push(`### \`${def.code}\``);
    lines.push('');
    lines.push(`**${def.message}**`);
    lines.push('');
    lines.push('**How to fix:**');
    for (const step of def.fix) {
      lines.push(`- ${step}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── config-schema.md ──────────────────────────────────────────────────────────

interface JsonSchemaNode {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
  $ref?: string;
  $defs?: Record<string, JsonSchemaNode>;
  definitions?: Record<string, JsonSchemaNode>;
}

function typeLabel(node: JsonSchemaNode): string {
  if (node.enum) return node.enum.map(v => `"${v}"`).join(' | ');
  if (node.anyOf) return node.anyOf.map(typeLabel).filter(Boolean).join(' | ');
  if (node.type === 'array') {
    const itemLabel = node.items ? typeLabel(node.items) : 'any';
    return `${itemLabel}[]`;
  }
  return node.type ?? '';
}

function flattenSchema(
  node: JsonSchemaNode,
  prefix: string,
  rows: Array<{ path: string; type: string; default: string; description: string }>,
  defs: Record<string, JsonSchemaNode>,
): void {
  if (!node.properties) return;

  for (const [key, child] of Object.entries(node.properties)) {
    const path = prefix ? `${prefix}.${key}` : key;
    let resolved = child;

    // Resolve $ref
    if (child.$ref) {
      const refKey = child.$ref.replace(/^#\/\$defs\//, '').replace(/^#\/definitions\//, '');
      resolved = defs[refKey] ?? child;
    }

    // If it has nested properties, recurse without adding a row for the parent
    if (resolved.properties) {
      flattenSchema(resolved, path, rows, defs);
    } else {
      rows.push({
        path,
        type: typeLabel(resolved),
        default: resolved.default !== undefined ? JSON.stringify(resolved.default) : '—',
        description: resolved.description ?? '',
      });
    }
  }
}

function generateConfigSchemaMd(): string {
  const jsonSchema = zodToJsonSchema(ProjectConfigSchema, {
    name: 'ProjectConfig',
    $refStrategy: 'none',
  }) as JsonSchemaNode;

  const defs: Record<string, JsonSchemaNode> = {
    ...(jsonSchema.$defs ?? {}),
    ...(jsonSchema.definitions ?? {}),
  };

  // Resolve a top-level $ref if the named schema strategy wrapped everything in one
  let root = jsonSchema;
  if (jsonSchema.$ref && !jsonSchema.properties) {
    const refKey = jsonSchema.$ref.replace(/^#\/\$defs\//, '').replace(/^#\/definitions\//, '');
    root = defs[refKey] ?? jsonSchema;
  }

  const rows: Array<{ path: string; type: string; default: string; description: string }> = [];
  flattenSchema(root, '', rows, defs);

  const lines: string[] = [
    GENERATED_HEADER,
    '# Config Schema Reference',
    '',
    'All configuration lives in a single `skill-optimizer.json` file.',
    'Paths in the config are relative to the config file location.',
    '',
    '| Field | Type | Default | Description |',
    '|---|---|---|---|',
  ];

  for (const row of rows) {
    const desc = row.description.replace(/\|/g, '\\|');
    lines.push(`| \`${row.path}\` | \`${row.type}\` | ${row.default} | ${desc} |`);
  }

  lines.push('');
  return lines.join('\n');
}

// ── Write files ────────────────────────────────────────────────────────────────

const errorsPath = resolve(refDir, 'errors.md');
writeFileSync(errorsPath, generateErrorsMd(), 'utf-8');
console.log(`[gen-docs] Written: ${errorsPath}`);

const schemaPath = resolve(refDir, 'config-schema.md');
writeFileSync(schemaPath, generateConfigSchemaMd(), 'utf-8');
console.log(`[gen-docs] Written: ${schemaPath}`);
