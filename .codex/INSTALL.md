# Installing skill-optimizer for Codex

Use `skill-optimizer` in Codex as either a plugin or a native skill.

## Plugin Install

Register this repository as a plugin marketplace:

```bash
codex plugin marketplace add fastxyz/skill-optimizer
```

Open `/plugins`, select the `skill-optimizer` marketplace, and install the `skill-optimizer` plugin.

The marketplace file is `.agents/plugins/marketplace.json`. It exposes the repository root as the plugin source so Codex can load `.codex-plugin/plugin.json` and the bundled `skills/` directory.

To pin a Git ref while installing the marketplace:

```bash
codex plugin marketplace add fastxyz/skill-optimizer --ref main
```

## Skill-Only Install

Install the canonical skill with the open skills CLI:

```bash
npx skills add fastxyz/skill-optimizer --skill skill-optimizer -a codex -y
```

Restart Codex if the skill does not appear immediately.
