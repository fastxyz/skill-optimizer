import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const checkName = process.argv[2];

if (checkName === 'bundle-dynamic-imports') {
  const filePath = join(process.env.WORK, 'app', 'code-panel.tsx');
  if (!existsSync(filePath)) finish(false, ['missing app/code-panel.tsx']);
  const source = readFileSync(filePath, 'utf-8');
  const hasDynamic = /dynamic\s*\(\s*\(\)\s*=>\s*import\(/s.test(source) || /dynamic\s*\(\s*async\s*\(\)\s*=>\s*import\(/s.test(source);
  const hasStaticMonacoImport = /^\s*import\s+.+['"].*monaco.*['"]/m.test(source);
  finish(hasDynamic && !hasStaticMonacoImport, [
    hasDynamic ? 'uses dynamic import' : 'missing dynamic import',
    hasStaticMonacoImport ? 'still has static Monaco import' : 'no static Monaco import remains',
  ]);
}

if (checkName === 'async-parallel') {
  const filePath = join(process.env.WORK, 'src', 'loadDashboard.ts');
  if (!existsSync(filePath)) finish(false, ['missing src/loadDashboard.ts']);
  const source = readFileSync(filePath, 'utf-8');
  const hasPromiseAll = /\bPromise\.all\s*\(/.test(source);
  const hasAllFetches = [
    '/api/user',
    '/api/projects',
    '/api/alerts',
  ].every((endpoint) => source.includes(endpoint));
  const hasSequentialFetches = (source.match(/\bconst\s+\w+\s*=\s*await\s+fetch\s*\(/g) ?? []).length > 1;
  finish(hasPromiseAll && hasAllFetches && !hasSequentialFetches, [
    hasPromiseAll ? 'uses Promise.all' : 'missing Promise.all',
    hasAllFetches ? 'keeps all dashboard fetches' : 'missing one or more dashboard fetches',
    hasSequentialFetches ? 'still awaits dashboard fetches sequentially' : 'does not await dashboard fetches sequentially',
  ]);
}

if (checkName === 'rerender-derived-state') {
  const filePath = join(process.env.WORK, 'src', 'ProfileForm.tsx');
  if (!existsSync(filePath)) finish(false, ['missing src/ProfileForm.tsx']);
  const source = readFileSync(filePath, 'utf-8');
  const usesState = /\buseState\b/.test(source);
  const usesEffect = /\buseEffect\b/.test(source);
  const writesFullNameState = /\bsetFullName\b/.test(source);
  const usesNames = /\bfirstName\b/.test(source) && /\blastName\b/.test(source);
  finish(usesNames && !usesState && !usesEffect && !writesFullNameState, [
    usesNames ? 'uses firstName and lastName' : 'does not use both name props',
    usesState ? 'still uses useState' : 'does not use useState',
    usesEffect ? 'still uses useEffect' : 'does not use useEffect',
    writesFullNameState ? 'still writes fullName state' : 'does not write fullName state',
  ]);
}

finish(false, [`Unknown React check: ${checkName}`]);

function finish(pass, evidence) {
  console.log(JSON.stringify({ pass, score: pass ? 1 : 0, evidence }));
  process.exit(pass ? 0 : 1);
}
