#!/bin/sh
set -eu

node --input-type=module <<'NODE'
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { createPdf } = await import(pathToFileURL(join(process.env.CASE, 'checks', '_pdf.mjs')));

createPdf(join(process.env.WORK, 'briefing.pdf'), [
  [
    'PDF Skill Briefing',
    'Source: Alpine Sensors',
    'Decision: approve expedited renewal',
    'Deadline: 2026-05-14',
  ].join('\n'),
]);
NODE
