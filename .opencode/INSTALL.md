# Installing skill-optimizer for OpenCode

Add the plugin to `opencode.json` at user or project scope:

```json
{
  "plugin": ["skill-optimizer@git+https://github.com/fastxyz/skill-optimizer.git"]
}
```

Restart OpenCode. The plugin registers the repository `skills/` directory so the native `skill` tool can load `skill-optimizer`.

Verify with the skill tool by listing skills or loading `skill-optimizer`.

To pin a version, append a tag or commit ref:

```json
{
  "plugin": ["skill-optimizer@git+https://github.com/fastxyz/skill-optimizer.git#v2.0.0"]
}
```
