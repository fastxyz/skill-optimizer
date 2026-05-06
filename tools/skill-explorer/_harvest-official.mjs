// Harvest skills.sh /official: 89 vendor orgs × 407 repos × 4,342 skills.
// POST to explorer with registry_id="skills-sh-official". Skills already in the
// top-1212 leaderboard get a second source tag ("skills-sh-official"); new ones
// get added as fresh records.
//
// Optionally enrich each via detail RSC for description + repo URL.

import https from 'node:https';
import http from 'node:http';
import { writeFileSync, readFileSync } from 'node:fs';

const HOST = 'skills.sh';
const CONCURRENCY = 16;

function getJson(path) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: HOST, path }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(body)) : reject(new Error(`HTTP ${res.statusCode}`)));
    }).on('error', reject);
  });
}
function getRsc(path) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: HOST, path, headers: { 'rsc': '1', 'accept': 'text/x-component' } }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => res.statusCode === 200 ? resolve(body) : reject(new Error(`HTTP ${res.statusCode}`)));
    }).on('error', reject);
  });
}

function stripTags(html) {
  return html
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}
function extractRscChunks(body) {
  const chunks = new Map();
  let cur = null, parts = [];
  const flush = () => { if (cur !== null) chunks.set(cur, parts.join('\n')); };
  for (const line of body.split('\n')) {
    const m = line.match(/^([0-9a-f]+):(.*)$/);
    if (m) { flush(); cur = m[1]; parts = [m[2]]; }
    else if (cur !== null) parts.push(line);
  }
  flush();
  return chunks;
}
function parseDetail(body, source) {
  const out = { github_url: `https://github.com/${source}`, weekly_installs: null, description: '' };
  for (const m of body.matchAll(/"(https:\/\/github\.com\/[^"]+)"/g)) {
    const u = m[1];
    if (u === `https://github.com/${source}` || u.startsWith(`https://github.com/${source}/`)) {
      out.github_url = u; break;
    }
  }
  const wi = body.match(/Weekly Installs[\s\S]{0,400}?"children":"([^"]+)"/);
  if (wi) out.weekly_installs = wi[1];
  const ref = body.match(/"dangerouslySetInnerHTML":\{"__html":"\$([0-9a-f]+)"\}/);
  if (ref) {
    const chunk = extractRscChunks(body).get(ref[1]);
    if (chunk) {
      let html;
      try { html = JSON.parse(chunk); } catch { html = chunk; }
      const firstP = html.match(/<p[^>]*>([\s\S]{1,2000}?)<\/p>/);
      out.description = (firstP ? stripTags(firstP[1]) : stripTags(html)).slice(0, 250);
    }
  }
  return out;
}

async function withConcurrency(items, n, worker) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await worker(items[i]); }
      catch (e) { results[i] = { ...items[i], _detail_error: e.message }; }
      done++;
      if (done % 100 === 0 || done === items.length) {
        process.stderr.write(`\r  enriched ${done}/${items.length}`);
      }
    }
  }));
  process.stderr.write('\n');
  return results;
}

function postToExplorer(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const r = http.request({
      hostname: '127.0.0.1', port: 3030, path: '/api/responses', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let b = '';
      res.on('data', (c) => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject);
    r.write(data); r.end();
  });
}

function formatPop(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
function slugify(s) {
  return String(s).toLowerCase().replace(/\s+/g, '-');
}

(async () => {
  console.error('Step 1: fetch /official RSC');
  const rsc = await getRsc('/official?_rsc=h' + Date.now());
  const idx = rsc.indexOf('"owners":[');
  if (idx < 0) throw new Error('owners array not found in /official');
  let depth = 0, start = idx + '"owners":'.length, end = -1;
  for (let i = start; i < rsc.length; i++) {
    if (rsc[i] === '[') depth++;
    else if (rsc[i] === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const owners = JSON.parse(rsc.slice(start, end));
  const flat = [];
  for (const o of owners) {
    for (const r of o.repos) {
      for (const sk of r.skills) {
        flat.push({
          owner: o.owner,
          source: r.repo,
          name: sk.name,
          skillId: slugify(sk.name),
          installs: sk.installs,
        });
      }
    }
  }
  console.error(`  ${owners.length} owners, ${flat.length} skills`);

  console.error(`\nStep 2: enrich each via detail RSC (concurrency=${CONCURRENCY})`);
  const t0 = Date.now();
  const enriched = await withConcurrency(flat, CONCURRENCY, async (s) => ({
    ...s,
    ...(await getRsc(`/${s.source}/${s.skillId}?_rsc=o${Date.now() % 1000000}`).then((b) => parseDetail(b, s.source))),
  }));
  console.error(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const errs = enriched.filter((e) => e._detail_error).length;
  console.error(`  detail errors (preserved leaderboard data): ${errs}`);
  writeFileSync('/tmp/official-enriched.json', JSON.stringify(enriched, null, 2));

  console.error('\nStep 3: POST to explorer with registry_id="skills-sh-official"');
  const payload = {
    id: `official-${Date.now()}`,
    completedAt: new Date().toISOString(),
    status: 'ok',
    registry_id: 'skills-sh-official',
    notes: `${enriched.length} skills from skills.sh /official across ${owners.length} vendor orgs. These are vendor-published; pre-existing top-1212 leaderboard skills will gain a second source tag for the intersection set.`,
    skills: enriched.map((s) => ({
      name: s.name,
      author: s.source,
      description: [
        s.description ?? '',
        s.weekly_installs ? `[Weekly: ${s.weekly_installs}]` : '',
        `[official org: ${s.owner}]`,
      ].filter(Boolean).join(' ').slice(0, 500),
      popularity: formatPop(s.installs),
      url: s.github_url || `https://github.com/${s.source}`,
    })),
  };
  const res = await postToExplorer(payload);
  console.error(`  POST → HTTP ${res.status} ${res.body}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
