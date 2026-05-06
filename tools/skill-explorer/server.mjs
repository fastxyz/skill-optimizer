import express from 'express';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.mjs';
import { fetchAndCache } from './lib/playwright-fetch.mjs';
import { parseRegistriesCsv, emitSkillsCsv } from './lib/csv.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const REGISTRIES_CSV = join(REPO_ROOT, 'docs/superpowers/skill-registries.csv');
const STATE_DIR = join(REPO_ROOT, '.superpowers/explorer');
const PORT = Number(process.env.PORT ?? 3030);

const store = new Store(STATE_DIR);
const registries = parseRegistriesCsv(REGISTRIES_CSV);
let inFlightRegistryId = null;

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(join(__dirname, 'public')));

app.get('/api/registries', (_req, res) => {
  res.json(
    registries.map((r) => {
      const skills = store.allSkills();
      const skillCount = skills.filter((s) => (s.sources ?? []).includes(r.id)).length;
      return { ...r, ...store.registryStatus(r.id), skill_count: skillCount };
    }),
  );
});

app.post('/api/explore', async (req, res) => {
  const { registry_id } = req.body ?? {};
  if (typeof registry_id !== 'string') {
    return res.status(400).json({ error: 'registry_id (string) required' });
  }
  if (inFlightRegistryId) {
    return res.status(409).json({ error: `another exploration in flight: ${inFlightRegistryId}` });
  }
  const registry = registries.find((r) => r.id === registry_id);
  if (!registry) {
    return res.status(404).json({ error: `unknown registry_id: ${registry_id}` });
  }

  inFlightRegistryId = registry_id;
  store.setRegistryStatus(registry_id, 'in_flight');
  try {
    const cache = await fetchAndCache({ url: registry.url, cacheRoot: store.cacheDir });
    const requestId = store.enqueueRequest({
      action: 'list-skills',
      registry: { id: registry.id, name: registry.name, url: registry.url },
      cache: {
        dom_path: cache.dom_path,
        text_path: cache.text_path,
        screenshot_path: cache.screenshot_path,
      },
    });
    res.json({ request_id: requestId, status: 'queued' });
  } catch (err) {
    inFlightRegistryId = null;
    const message = err instanceof Error ? err.message : String(err);
    store.setRegistryStatus(registry_id, 'error', message);
    res.status(500).json({ error: message });
  }
});

app.get('/api/queue/pending', (_req, res) => {
  res.json(store.pendingRequests());
});

app.post('/api/responses', (req, res) => {
  const response = req.body ?? {};
  if (typeof response.id !== 'string') {
    return res.status(400).json({ error: 'response.id (string) required' });
  }
  store.ingestResponse(response.id, response);
  if (response.registry_id) {
    const newStatus = response.status === 'ok' ? 'done' : 'error';
    store.setRegistryStatus(response.registry_id, newStatus, response.error);
    if (inFlightRegistryId === response.registry_id) inFlightRegistryId = null;
  }
  res.json({ ok: true });
});

app.get('/api/status', (_req, res) => {
  res.json({
    in_flight: inFlightRegistryId,
    skills_count: store.allSkills().length,
    registries: Object.fromEntries(
      registries.map((r) => [r.id, store.registryStatus(r.id)]),
    ),
  });
});

app.get('/api/skills', (_req, res) => {
  res.json(store.allSkills());
});

app.post('/api/skills/notes', (req, res) => {
  const { key, note } = req.body ?? {};
  if (typeof key !== 'string' || typeof note !== 'string') {
    return res.status(400).json({ error: 'key and note (strings) required' });
  }
  store.setSkillNote(key, note);
  res.json({ ok: true });
});

app.get('/api/export.csv', (_req, res) => {
  const csv = emitSkillsCsv(store.allSkills());
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="skills-export-${stamp}.csv"`);
  res.send(csv);
});

app.get('/api/cache/:hash/screenshot', (req, res) => {
  const hash = req.params.hash;
  if (!/^[a-f0-9]{16}$/.test(hash)) return res.status(400).end();
  res.sendFile(join(store.cacheDir, hash, 'screenshot.png'));
});

app.get('/api/cache/:hash/text', (req, res) => {
  const hash = req.params.hash;
  if (!/^[a-f0-9]{16}$/.test(hash)) return res.status(400).end();
  res.sendFile(join(store.cacheDir, hash, 'text.md'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Skill Explorer listening on http://localhost:${PORT}`);
  console.log(`State dir: ${STATE_DIR}`);
  console.log(`Registries: ${registries.length}`);
});
