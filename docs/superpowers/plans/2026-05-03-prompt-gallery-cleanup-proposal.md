# Prompt Gallery Cleanup Proposal

Deletion is blocked until the user confirms an exact cleanup list.

## Verified Current Runtime Sources

- `web/` is now the formal Prompt Gallery Studio app.
- Supabase is the runtime source for Gallery metadata and migrated Gallery images.
- `gallery-images` is public and contains 352 Gallery image objects.
- `experiment-images` is private.
- `categories` has 13 rows.
- `prompt_cases` has 352 rows.
- Known missing prompt numbers remain `[12, 169, 170]`.

## Keep

- `web/`
- `web/supabase/`
- `docs/superpowers/specs/2026-05-02-prompt-gallery-web-design.md`
- `docs/superpowers/plans/2026-05-02-prompt-gallery-web-implementation.md`
- `.codex/skills/`
- `tools/update_codex_plugin_catalog.py`
- `data/codex-plugins/`
- `docs/codex-plugins/`

## Candidate Archive Before Deletion

- `index.md`
- `gallery1.md` through `gallery13.md`
- `assets/case*.jpg`

## Candidate Cleanup After Explicit Confirmation

- `gallery1.md` through `gallery13.md`
- `assets/case*.jpg`
- `learn/` if the user confirms it is unrelated to current work

## Do Not Delete Without A Separate Review

- `index.md`, because it is still the human-readable entry point for the original prompt corpus.
- `assets/`, because it is still the local source of truth for Gallery image re-imports.
- Any Codex plugin catalog files, because they are a separate project track in this repository.
