// Skill Explorer client
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const STATE = {
  registries: [],
  skills: [],
  inFlight: null,
  filter: '',
  sort: { col: 'popularity', dir: 'desc' },
};

function tabSwitch(tab) {
  $$('.tab').forEach((t) => {
    const active = t.id === `tab-${tab}`;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $$('.panel').forEach((p) => {
    const active = p.id === `panel-${tab}`;
    p.classList.toggle('active', active);
    p.toggleAttribute('hidden', !active);
  });
}

$('#tab-registries').addEventListener('click', () => tabSwitch('registries'));
$('#tab-skills').addEventListener('click', () => tabSwitch('skills'));

function setBanner(html) {
  const b = $('#banner');
  if (!html) { b.hidden = true; b.innerHTML = ''; return; }
  b.innerHTML = html;
  b.hidden = false;
}

function setGlobalStatus(text) {
  $('#global-status').textContent = text;
}

async function loadRegistries() {
  const res = await fetch('/api/registries');
  STATE.registries = await res.json();
  renderRegistries();
}

async function loadSkills() {
  const res = await fetch('/api/skills');
  STATE.skills = await res.json();
  renderSkills();
}

async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    STATE.inFlight = data.in_flight;
    // refresh registry rows from /api/registries (carries skill_count too)
    const rRes = await fetch('/api/registries');
    STATE.registries = await rRes.json();
    if (data.skills_count !== STATE.skills.length) {
      await loadSkills();
    }
    renderRegistries();
    renderSkills();
    setGlobalStatus(STATE.inFlight ? `in flight: ${STATE.inFlight}` : 'idle');
  } catch (err) {
    setGlobalStatus(`status poll failed: ${err.message}`);
  }
}

function renderRegistries() {
  const tbody = $('#registries-table tbody');
  tbody.innerHTML = '';
  for (const r of STATE.registries) {
    const tr = document.createElement('tr');
    tr.classList.add(r.status ?? 'pending');
    tr.innerHTML = `
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.operator)}</td>
      <td>${escapeHtml(r.type)}</td>
      <td title="${escapeHtml(r.description)}">${escapeHtml(truncate(r.description, 90))}</td>
      <td><span class="row-status ${r.status ?? 'pending'}" ${r.error ? `title="${escapeHtml(r.error)}"` : ''}>${labelStatus(r)}</span></td>
      <td style="text-align:right">${r.skill_count ?? 0}</td>
      <td></td>
    `;
    const actionTd = tr.lastElementChild;
    const exploreBtn = document.createElement('button');
    exploreBtn.textContent = r.status === 'done' ? 're-explore' : 'explore';
    exploreBtn.disabled = STATE.inFlight !== null;
    exploreBtn.addEventListener('click', () => onExplore(r));
    actionTd.appendChild(exploreBtn);

    if (r.status === 'done' || r.status === 'error') {
      const viewBtn = document.createElement('button');
      viewBtn.textContent = 'view';
      viewBtn.style.marginLeft = '6px';
      viewBtn.addEventListener('click', () => openModal(r));
      actionTd.appendChild(viewBtn);
    }
    tbody.appendChild(tr);
  }
  $('#badge-registries').textContent = STATE.registries.length;
}

function labelStatus(r) {
  switch (r.status) {
    case 'in_flight': return '⏳ in flight';
    case 'done': return '✓ done';
    case 'error': return `✗ ${truncate(r.error ?? 'error', 30)}`;
    default: return '— pending';
  }
}

async function onExplore(registry) {
  if (STATE.inFlight) return;
  setBanner(`Fetching ${escapeHtml(registry.name)} via Playwright…`);
  const res = await fetch('/api/explore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registry_id: registry.id }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    setBanner(`Explore failed: ${escapeHtml(body.error || res.statusText)}`);
    setTimeout(() => setBanner(null), 5000);
    return;
  }
  setBanner(`Request queued. Tell Claude: <code>process queue</code>`);
  await pollStatus();
}

function openModal(registry) {
  // The cache hash comes from the URL; reproduce sha1 client-side via SubtleCrypto.
  hashUrl(registry.url).then((hash) => {
    $('#modal-title').textContent = registry.name;
    $('#modal-screenshot').src = `/api/cache/${hash}/screenshot`;
    fetch(`/api/cache/${hash}/text`)
      .then((r) => r.ok ? r.text() : 'No cached text')
      .then((t) => { $('#modal-text').textContent = t; });
    $('#modal').hidden = false;
  });
}

async function hashUrl(url) {
  const enc = new TextEncoder().encode(url);
  const buf = await crypto.subtle.digest('SHA-1', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

$('#modal-close').addEventListener('click', () => { $('#modal').hidden = true; });
$('#modal').addEventListener('click', (e) => {
  if (e.target === $('#modal')) $('#modal').hidden = true;
});

function renderSkills() {
  const filter = STATE.filter.toLowerCase();
  let rows = STATE.skills;
  if (filter) {
    rows = rows.filter((s) =>
      [s.name, s.author, s.description].some((v) => (v ?? '').toLowerCase().includes(filter)),
    );
  }
  rows = [...rows].sort((a, b) => sortCmp(a, b, STATE.sort));

  const tbody = $('#skills-table tbody');
  tbody.innerHTML = '';
  for (const s of rows) {
    const tr = document.createElement('tr');
    const key = `${(s.name ?? '').toLowerCase()}::${(s.author ?? '').toLowerCase()}`;
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.author)}</td>
      <td>${escapeHtml(s.popularity ?? '')}</td>
      <td>${escapeHtml(truncate(s.description ?? '', 120))}</td>
      <td>${escapeHtml((s.sources ?? []).join(', '))}</td>
      <td></td>
    `;
    const noteTd = tr.lastElementChild;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = s.notes ?? '';
    inp.addEventListener('blur', () => saveNote(key, inp.value));
    noteTd.appendChild(inp);
    tbody.appendChild(tr);
  }
  $('#badge-skills').textContent = STATE.skills.length;
}

async function saveNote(key, note) {
  await fetch('/api/skills/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, note }),
  });
}

function sortCmp(a, b, sort) {
  const av = a[sort.col] ?? '';
  const bv = b[sort.col] ?? '';
  if (sort.col === 'popularity') {
    return parsePop(bv) - parsePop(av); // desc by default; matches typical leaderboard
  }
  const cmp = String(av).localeCompare(String(bv));
  return sort.dir === 'asc' ? cmp : -cmp;
}

function parsePop(v) {
  if (typeof v === 'number') return v;
  const m = String(v ?? '').match(/^([\d.]+)\s*([KMB])?/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mul = { K: 1e3, M: 1e6, B: 1e9 }[m[2]] ?? 1;
  return n * mul;
}

$$('#skills-table th[data-sort]').forEach((th) => {
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (STATE.sort.col === col) {
      STATE.sort.dir = STATE.sort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      STATE.sort = { col, dir: 'asc' };
    }
    renderSkills();
  });
});

$('#skill-filter').addEventListener('input', (e) => {
  STATE.filter = e.target.value;
  renderSkills();
});

$('#export-csv').addEventListener('click', () => {
  window.location.href = '/api/export.csv';
});

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

(async function init() {
  await loadRegistries();
  await loadSkills();
  setGlobalStatus('idle');
  setInterval(pollStatus, 2000);
})();
