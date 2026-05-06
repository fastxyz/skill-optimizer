
# Skill Explorer

Internal localhost tool. Walks the registries listed in `docs/superpowers/skill-registries.csv`, lets the agent harvest each registry's skills via Playwright-rendered fetch + filesystem queue, accumulates the harvested skills in a second tab, and exports as CSV.

Not published. Not merged back to `development`. Lives only on branch `tools/skill-explorer`.

## Setup

```bash
cd tools/skill-explorer
npm install        # installs deps + chromium (~150 MB one-time)
npm start          # starts server at http://localhost:3030
```

Open http://localhost:3030 in a browser.

## Usage

1. Click "Explore" on a registry row.
2. Wait for the in-flight indicator to clear (server-side Playwright fetch takes a few seconds).
3. Tell the agent in chat: "process queue".
4. The agent reads the cached rendered DOM, extracts the skills, and POSTs them back. The Skills tab updates.
5. Repeat for each registry.
6. Click "Export CSV" when satisfied.

## Filesystem state

All runtime data lives at `<repo-root>/.superpowers/explorer/` (gitignored). Inspect or delete that directory at will.
