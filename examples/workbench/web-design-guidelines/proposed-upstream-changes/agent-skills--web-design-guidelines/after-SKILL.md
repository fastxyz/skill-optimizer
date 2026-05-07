---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.1.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Fetch the latest guidelines from the source URL below.
2. Read the specified files (or prompt user for files/pattern).
3. Review each file in **TWO passes** — both passes are required.
4. Output findings in the terse `file:line <issue>` format.

### Pass 1 — Visible anti-patterns

Scan each file for literal patterns that appear in the code: `<div onClick>` for actions, `transition: all`, `outline-none` className, `onPaste={(e) => e.preventDefault()}`, `"..."` (three dots), straight `"..."` quotes, etc. The full list is in the fetched guidelines. One finding per match.

### Pass 2 — Absences (per-element checklist)

The most-missed rules are about *what's missing*. After Pass 1, walk each `<img>`, `<input>`, `<button>`, and `<form>` once and run the checklist in the **"Per-element review"** section of the fetched guidelines. Report every attribute or behavior that should be present but isn't.

Pass 2 is the difference between a 70% review and a 95% review. Do not skip it.

## Guidelines Source

Fetch fresh guidelines before each review:

```text
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use WebFetch to retrieve the latest rules. The fetched content contains all the rules, the per-element Pass 2 checklist, and output format instructions.

## Usage

When a user provides a file or pattern argument:

1. Fetch guidelines from the source URL above.
2. Read the specified files.
3. Run Pass 1 (visible anti-patterns).
4. Run Pass 2 (per-element absence checklist).
5. Output findings using the format specified in the guidelines.

If no files specified, ask the user which files to review.
