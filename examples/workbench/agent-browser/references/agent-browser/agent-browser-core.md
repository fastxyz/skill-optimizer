# agent-browser — Core Workflow

This is the core usage guide for the `agent-browser` CLI.

## Pre-flight

The CLI is pre-installed at `/work/bin/agent-browser`. Verify with
`which agent-browser` before starting. **Do not** `npm install` it;
**do not** fall back to `curl` or `wget` for HTTP fetches.

## Navigation

Navigate to a URL to start or reuse a browser session:

```
agent-browser navigate <url>
```

Example: `agent-browser navigate https://example.com`

## Snapshot

Take an accessibility-tree snapshot of the current page. Always snapshot
after navigating before deciding what to interact with:

```
agent-browser snapshot
```

The snapshot output lists interactive elements with compact `@eN` refs
(e.g., `button @e1 "Submit"`, `textbox @e2 "Email"`). Always re-snapshot
after a navigation or interaction — refs may be reassigned.

## Screenshot

Save a screenshot of the current page:

```
agent-browser screenshot [path]
```

Default path: `/work/screenshot.png`

Example: `agent-browser screenshot /work/capture.png`

## Interaction

Always pass element refs in the `@eN` form taken directly from the most
recent `snapshot` output. Never substitute a CSS selector or XPath — the
CLI only accepts accessibility-tree refs.

Click an element by `@eN` ref:

```
agent-browser click @eN
```

Type text into an element:

```
agent-browser type @eN "text to type"
```

## Typical workflow

1. `agent-browser navigate https://example.com`
2. `agent-browser snapshot`           — understand page structure
3. `agent-browser click @eN`          — click an element (use ref from snapshot)
4. `agent-browser snapshot`           — re-snapshot after interaction
5. `agent-browser screenshot /work/result.png`  — capture final state

## Sessions

Sessions persist across commands in the same agent run. The CLI connects
to the running Chrome/Chromium instance via CDP. If no session exists,
`navigate` starts one automatically.

## Common patterns

**Extract page title:**
After `snapshot`, the root line shows the page title:
`RootWebArea "Page Title"`

**Find a heading:**
Look for `heading @eN "text" level=1` in snapshot output.

**Fill a form:**
1. `snapshot` to identify input `@eN` refs
2. `type @eN "value"` for each field
3. `click @eN` on the submit button (use the ref reported by snapshot, not
   `#submit` or any CSS selector)

## Troubleshooting

- If `navigate` hangs: the page may have a heavy JS bundle. Try again.
- If an `@eN` ref is stale: re-snapshot and use the new ref.
- If `screenshot` shows a blank page: navigate first.
