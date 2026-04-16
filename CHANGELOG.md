# Changelog

## Unreleased

### Added
- **prompt surface type** — benchmark and optimize prompt templates, Claude Code skills, and agent instructions. Discovers phases and capabilities from markdown, evaluates output quality with content-based criteria.

### Fixed

- **benchmark:** Strip provider prefix from model ID when using direct `anthropic` or `openai` formats. Previously, `anthropic/claude-sonnet-4-6` was sent as-is to the Anthropic API, which expects `claude-sonnet-4-6`. The `pi` format is unaffected.

## 1.0.0 — 2026-04-14

First public release.
