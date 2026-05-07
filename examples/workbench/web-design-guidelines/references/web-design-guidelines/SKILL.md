---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.1.0-eval"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the bundled `command.md` (next to this SKILL.md) for the rules.
2. Read the specified files (or prompt user for files/pattern).
3. Review each file in **TWO passes** — both passes are required.
4. Output findings in the terse `file:line <issue>` format.

### Pass 1 — Visible anti-patterns

Scan each file for literal patterns that appear in the code: `<div onClick>` for actions, `transition: all`, `outline-none` className, `onPaste={(e) => e.preventDefault()}`, `"..."` (three dots), straight `"..."` quotes, etc. The full list is in `command.md`'s rule sections. One finding per match.

### Pass 2 — Absences (per-element checklist)

The most-missed rules are about *what's missing*. After Pass 1, walk each `<img>`, `<input>`, `<button>`, and `<form>` once and run the checklist in `command.md`'s **"Per-element review"** section. Report every attribute or behavior that should be present but isn't.

Pass 2 is the difference between a 70% review and a 95% review. Do not skip it.

## Usage

When a user provides a file or pattern argument:

1. Read `command.md` to load the rules.
2. Read the specified files.
3. Run Pass 1 (visible anti-patterns).
4. Run Pass 2 (per-element absence checklist).
5. Output findings using the format specified in `command.md`.

If no files specified, ask the user which files to review.
