#!/bin/sh
set -eu

node --input-type=module <<'NODE'
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { createPdf } = await import(pathToFileURL(join(process.env.CASE, 'checks', '_pdf.mjs')));

createPdf(join(process.env.WORK, 'customer-copy.pdf'), [
  [
    'CUSTOMER COPY',
    'Invoice: C-204',
    'Status: PAID',
    'Customer: Northwind Labs',
  ].join('\n'),
  [
    'CUSTOMER COPY',
    'Warranty Code: W-8832',
    'Support Tier: Priority',
  ].join('\n'),
]);
NODE
