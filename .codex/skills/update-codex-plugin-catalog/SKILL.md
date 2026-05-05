---
name: update-codex-plugin-catalog
description: Update this repository's Chinese Markdown catalog of Codex official plugins from the local Codex official marketplace cache, then report missing Chinese profiles or source problems.
---

# Update Codex Plugin Catalog

Use this skill when the user asks to update, refresh, regenerate, verify, or weekly-scan the Codex official plugin catalog in this repository.

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

4. For weekly maintenance, update the catalog plus snapshot, weekly update index, dated report, and local discovery timeline:

```bash
python3 tools/update_codex_plugin_catalog.py --weekly
```

This writes:

- `docs/codex-plugins/weekly-updates.md` as the stable index page
- `docs/codex-plugins/weekly-updates/<scan-time>.md` as the dated scan report
- `docs/codex-plugins/timeline.md`
- `data/codex-plugins/plugin-snapshots.json`

5. Review the diff:

```bash
git diff -- docs/codex-plugins data/codex-plugins .codex/skills tools
```

6. Report the plugin count, category counts, missing profile status, weekly new/removed plugin counts, and the files changed.

## Notes

- The source of truth for the first catalog scope is `/Users/godw/.codex/.tmp/plugins/.agents/plugins/marketplace.json`.
- `box` and `google-drive` are category-corrected to `Productivity` in `data/codex-plugins/plugins.zh.json` because the local marketplace cache has blank categories for those entries.
- Do not add plugins found only by web search unless they also appear in the local Codex official marketplace cache.
- `timeline.md` records the repository's first automated scan discovery date, not the OpenAI official plugin launch date.
- The first weekly scan establishes a baseline and does not treat every existing plugin as newly added that week.
- Weekly history is preserved in dated Markdown files under `docs/codex-plugins/weekly-updates/`; do not collapse old reports back into the index page.
