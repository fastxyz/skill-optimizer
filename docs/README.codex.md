# Codex Install

`skill-optimizer` can be used in Codex as either a plugin or a plain Agent Skill.

## Plugin Install

Register this repository as a plugin marketplace:

```bash
codex plugin marketplace add fastxyz/skill-optimizer
```

Open `/plugins`, select the `skill-optimizer` marketplace, and install the `skill-optimizer` plugin.

The plugin manifest is `.codex-plugin/plugin.json`; bundled skills are read from `skills/`.

## Skill-Only Install

Install only the skill files with the open skills CLI:

```bash
npx skills add fastxyz/skill-optimizer --skill skill-optimizer -a codex -y
```

Restart Codex if the skill does not appear immediately. The canonical skill path is `skills/skill-optimizer/SKILL.md`.
