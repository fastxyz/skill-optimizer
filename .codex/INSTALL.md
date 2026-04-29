# Installing skill-optimizer for Codex

Use `skill-optimizer` in Codex as either a plugin or a native skill.

## Plugin Install

Register this repository as a plugin marketplace:

```bash
codex plugin marketplace add fastxyz/skill-optimizer
```

Open `/plugins`, select the `skill-optimizer` marketplace, and install the `skill-optimizer` plugin.

## Skill-Only Install

Install the canonical skill with the open skills CLI:

```bash
npx skills add fastxyz/skill-optimizer --skill skill-optimizer -a codex -y
```

Restart Codex if the skill does not appear immediately.
