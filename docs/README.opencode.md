# skill-optimizer for OpenCode

Use `skill-optimizer` in OpenCode through the bundled OpenCode plugin.

## Installation

Add the plugin to `opencode.json` at user or project scope:

```json
{
  "plugin": ["skill-optimizer@git+https://github.com/fastxyz/skill-optimizer.git"]
}
```

Restart OpenCode. The plugin registers this repository's `skills/` directory so OpenCode can discover `skill-optimizer` without symlinks.

## Verify

Use OpenCode's native `skill` tool to list skills or load `skill-optimizer`.

## Updating

OpenCode reinstalls git plugins when it starts. To pin a tag or commit, append a ref:

```json
{
  "plugin": ["skill-optimizer@git+https://github.com/fastxyz/skill-optimizer.git#v1.1.0"]
}
```

## How It Works

The plugin exposes `.opencode/plugins/skill-optimizer.js` and adds the repository `skills/` directory to `config.skills.paths`.

The canonical skill is `skills/skill-optimizer/SKILL.md`.
