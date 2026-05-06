// Top 1000 skills by all-time installs, enriched with detail-page metadata.
//
// Source: skills.sh's internal /api/skills/all-time/<page> endpoint
//   - 200 skills per page, 0-indexed
//   - pages 0-4 = ranks 1-1000 strictly by installs descending
//   - no auth, no observed rate limit on these
//
// For each skill, we fetch its detail RSC (https://skills.sh/<source>/<skillId>?_rsc)
// and extract: github_url, weekly_installs, skill_md_html, first-paragraph description,
// opengraph_image, meta_description.

import https from 'node:https';
import http from 'node:http';
import { writeFileSync } from 'node:fs';

const HOST = 'skills.sh';
const PAGES = [0, 1, 2, 3, 4, 5, 6]; // pages 0-6 cover everything with installs >= 5K (1212 skills)
const MIN_INSTALLS = 5000;
const CONCURRENCY = 12;

function getJson(path) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: HOST, path, headers: { 'user-agent': 'skill-explorer-harvester/3' } }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${path}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function getRsc(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: HOST, path,
      headers: { 'rsc': '1', 'accept': 'text/x-component', 'user-agent': 'skill-explorer-harvester/3' },
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => res.statusCode === 200 ? resolve(body) : reject(new Error(`HTTP ${res.statusCode} for ${path}`)));
    }).on('error', reject);
  });
}

function stripTags(html) {
  return html
    .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function extractRscChunks(body) {
  const chunks = new Map();
  let curId = null;
  let curParts = [];
  const flush = () => { if (curId !== null) chunks.set(curId, curParts.join('\n')); };
  for (const line of body.split('\n')) {
    const m = line.match(/^([0-9a-f]+):(.*)$/);
    if (m) { flush(); curId = m[1]; curParts = [m[2]]; }
    else if (curId !== null) curParts.push(line);
  }
  flush();
  return chunks;
}

function parseDetail(body, source) {
  const out = {
    github_url: `https://github.com/${source}`,
    weekly_installs: null,
    skill_md_html: '',
    description: '',
    meta_description: '',
    opengraph_image: '',
  };

  for (const m of body.matchAll(/"(https:\/\/github\.com\/[^"]+)"/g)) {
    const u = m[1];
    if (u === `https://github.com/${source}` || u.startsWith(`https://github.com/${source}/`)) {
      out.github_url = u; break;
    }
  }
  const wi = body.match(/Weekly Installs[\s\S]{0,400}?"children":"([^"]+)"/);
  if (wi) out.weekly_installs = wi[1];
  const md = body.match(/"name":"description","content":"([^"]+)"/);
  if (md) out.meta_description = md[1];
  const og = body.match(/"property":"og:image","content":"([^"]+)"/);
  if (og) out.opengraph_image = og[1];

  const ref = body.match(/"dangerouslySetInnerHTML":\{"__html":"\$([0-9a-f]+)"\}/);
  if (ref) {
    const chunk = extractRscChunks(body).get(ref[1]);
    if (chunk) {
      try { out.skill_md_html = JSON.parse(chunk); }
      catch { out.skill_md_html = chunk; }
    }
  }
  if (out.skill_md_html) {
    const firstP = out.skill_md_html.match(/<p[^>]*>([\s\S]{1,2000}?)<\/p>/);
    out.description = (firstP ? stripTags(firstP[1]) : stripTags(out.skill_md_html)).slice(0, 250);
  }
  return out;
}

async function withConcurrency(items, n, worker) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        // Preserve the original record; just attach an error marker.
        results[i] = { ...items[i], _detail_error: e.message };
      }
      done++;
      if (done % 50 === 0 || done === items.length) {
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
    r.write(data);
    r.end();
  });
}

function formatPop(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

(async () => {
  console.error('Step 1: paginated leaderboard via /api/skills/all-time/<page>');
  const all = [];
  for (const p of PAGES) {
    const data = await getJson(`/api/skills/all-time/${p}`);
    console.error(`  page ${p}: ${data.skills.length} skills, hasMore=${data.hasMore}, total=${data.total}`);
    all.push(...data.skills);
  }
  // Sanity: must be sorted desc by installs already
  for (let i = 1; i < all.length; i++) {
    if (all[i].installs > all[i - 1].installs) {
      console.error(`  WARN: order break at index ${i}: ${all[i - 1].installs} → ${all[i].installs}`);
    }
  }
  // Trim at the popularity threshold
  const beforeCount = all.length;
  while (all.length && all[all.length - 1].installs < MIN_INSTALLS) all.pop();
  console.error(`  fetched ${beforeCount}, kept ${all.length} with installs >= ${MIN_INSTALLS}`);
  console.error(`  install range ${all[0].installs} → ${all[all.length - 1].installs}`);

  console.error(`\nStep 2: enrich each via detail RSC (concurrency=${CONCURRENCY})`);
  const t0 = Date.now();
  const enriched = await withConcurrency(all, CONCURRENCY, async (s) => ({
    ...s,
    ...(await getRsc(`/${s.source}/${s.skillId}?_rsc=h${Date.now() % 1000000}`).then((b) => parseDetail(b, s.source))),
  }));
  console.error(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const errs = enriched.filter((e) => e._detail_error);
  console.error(`  detail errors: ${errs.length}`);
  if (errs.length) console.error(`  first: ${errs[0]._detail_error} (${errs[0].source}/${errs[0].skillId})`);

  writeFileSync('/tmp/skills-top-1000-enriched.json', JSON.stringify(enriched, null, 2));
  console.error('  raw enriched saved to /tmp/skills-top-1000-enriched.json');

  // Audit
  const valid = enriched.filter((s) => typeof s.installs === 'number');
  const below5k = valid.filter((s) => s.installs < 5000).length;
  console.error(`  audit: ${valid.length}/${enriched.length} have installs; ${below5k} below 5K (should be 0 since min is ~6.3K)`);

  console.error('\nStep 3: POST to explorer (replaces skills-sh data)');
  const payload = {
    id: `rsc-enriched-v3-${Date.now()}`,
    completedAt: new Date().toISOString(),
    status: 'ok',
    registry_id: 'skills-sh',
    notes: `${enriched.length} skills with installs >= ${MIN_INSTALLS} from /api/skills/all-time/{0..6}, enriched with detail-page RSC. Range ${enriched[0].installs} → ${enriched[enriched.length - 1].installs}.`,
    skills: enriched.map((s) => ({
      name: s.name,
      author: s.source,
      description: [
        s.description,
        s.weekly_installs ? `[Weekly: ${s.weekly_installs}]` : '',
      ].filter(Boolean).join(' ').slice(0, 500),
      popularity: formatPop(s.installs),
      url: s.github_url || `https://github.com/${s.source}`,
    })),
  };

  const res = await postToExplorer(payload);
  console.error(`  POST → HTTP ${res.status} ${res.body}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
