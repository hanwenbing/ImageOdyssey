---
name: update-codex-plugin-catalog
description: Update this repository's Chinese Markdown catalog of Codex official plugins from the local Codex official marketplace cache, then report missing Chinese profiles or source problems.
---

# Update Codex Plugin Catalog

Use this skill when the user asks to update, refresh, regenerate, or verify the Codex official plugin catalog in this repository.

## Workflow

1. Run the non-mutating check from the repository root:

```bash
python3 tools/update_codex_plugin_catalog.py --check
```

2. If the check reports missing Chinese profiles, inspect the new plugin slugs in the local marketplace cache first. Use official OpenAI pages, the plugin's `.app.json` / `.mcp.json`, the user's screenshots, or the vendor's own site only to fill `data/codex-plugins/plugins.zh.json`.

3. Regenerate the Markdown catalog:

```bash
python3 tools/update_codex_plugin_catalog.py
```

4. Review the diff:

```bash
git diff -- docs/codex-plugins data/codex-plugins .agents/skills tools
```

5. Report the plugin count, category counts, missing profile status, and the files changed.

## Notes

- The source of truth for the first catalog scope is `/Users/godw/.codex/.tmp/plugins/.agents/plugins/marketplace.json`.
- `box` and `google-drive` are category-corrected to `Productivity` in `data/codex-plugins/plugins.zh.json` because the local marketplace cache has blank categories for those entries.
- Do not add plugins found only by web search unless they also appear in the local Codex official marketplace cache.
