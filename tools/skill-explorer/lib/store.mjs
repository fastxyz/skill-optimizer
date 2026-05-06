import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { customAlphabet } from 'nanoid';

const idGen = customAlphabet('ABCDEFGHJKMNPQRSTVWXYZ23456789', 5);

export class Store {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.cacheDir = join(rootDir, 'cache');
    this.requestsDir = join(rootDir, 'requests');
    this.responsesDir = join(rootDir, 'responses');
    this.statePath = join(rootDir, 'state.json');
    for (const dir of [this.cacheDir, this.requestsDir, this.responsesDir]) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.statePath)) {
      this._writeState({ registries: {}, skills: [] });
    }
  }

  _readState() {
    return JSON.parse(readFileSync(this.statePath, 'utf-8'));
  }

  _writeState(state) {
    writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  registryStatus(id) {
    const s = this._readState();
    return s.registries[id] ?? { status: 'pending' };
  }

  setRegistryStatus(id, status, error) {
    const s = this._readState();
    s.registries[id] = error ? { status, error } : { status };
    this._writeState(s);
  }

  enqueueRequest(payload) {
    const id = `req-${Date.now()}-${idGen()}`;
    const file = join(this.requestsDir, `${id}.json`);
    writeFileSync(
      file,
      JSON.stringify({ id, createdAt: new Date().toISOString(), ...payload }, null, 2),
      'utf-8',
    );
    return id;
  }

  pendingRequests() {
    const reqIds = new Set(this._listJsonIds(this.requestsDir));
    const respIds = new Set(this._listJsonIds(this.responsesDir));
    return [...reqIds]
      .filter((id) => !respIds.has(id))
      .map((id) => JSON.parse(readFileSync(join(this.requestsDir, `${id}.json`), 'utf-8')));
  }

  ingestResponse(id, response) {
    const file = join(this.responsesDir, `${id}.json`);
    writeFileSync(file, JSON.stringify(response, null, 2), 'utf-8');
    if (response.status === 'ok' && Array.isArray(response.skills)) {
      this._mergeSkills(response.skills, response.registry_id);
    }
  }

  _mergeSkills(newSkills, sourceRegistryId) {
    const s = this._readState();
    const indexByKey = new Map(s.skills.map((sk, i) => [skillKey(sk), i]));
    for (const incoming of newSkills) {
      const key = skillKey(incoming);
      const existingIdx = indexByKey.get(key);
      if (existingIdx !== undefined) {
        const sources = new Set(s.skills[existingIdx].sources ?? []);
        if (sourceRegistryId) sources.add(sourceRegistryId);
        s.skills[existingIdx].sources = [...sources];
      } else {
        s.skills.push({
          name: incoming.name ?? '',
          author: incoming.author ?? '',
          description: incoming.description ?? '',
          popularity: incoming.popularity ?? null,
          url: incoming.url ?? '',
          sources: sourceRegistryId ? [sourceRegistryId] : [],
          notes: '',
        });
        indexByKey.set(key, s.skills.length - 1);
      }
    }
    this._writeState(s);
  }

  allSkills() {
    return this._readState().skills;
  }

  setSkillNote(key, note) {
    const s = this._readState();
    const idx = s.skills.findIndex((sk) => skillKey(sk) === key);
    if (idx >= 0) {
      s.skills[idx].notes = note;
      this._writeState(s);
    }
  }

  _listJsonIds(dir) {
    return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  }
}

export function skillKey(skill) {
  return `${(skill.name ?? '').toLowerCase()}::${(skill.author ?? '').toLowerCase()}`;
}
