# Prompt Gallery Web App Design

Date: 2026-05-02

## Purpose

Build a local Prompt Gallery web app that turns the current `get-image-prompt` workflow into a visual, self-directed workspace.

The user uploads a source image, browses or asks for recommendations from the existing Gallery, selects one prompt case, asks Codex CLI to rewrite that prompt around the uploaded image subject, manually uses the rewritten prompt in ChatGPT, then uploads the generated result image back into the app. The result upload automatically saves a complete experiment record.

This is a personal local tool. It is not a public website, multi-user product, or GPT Image 2 API client.

## First-Version Scope

In scope:

- Create the formal app under `web/`.
- Use React, Vite, Tailwind CSS, Supabase, and a thin local Node API.
- Store Gallery metadata, full prompt text, Gallery example images, uploaded source images, uploaded result images, and experiment records in Supabase.
- Provide a two-pane workspace with a bottom prompt bar.
- Support AI recommendation from a source image plus natural-language request.
- Support AI prompt rewriting from a source image plus selected Gallery prompt.
- Save an experiment automatically when the result image upload succeeds.

Out of scope:

- GPT Image 2 API integration.
- Public deployment.
- Authentication and multi-user accounts.
- Manual experiment save button.
- Re-recommend button.
- Complex prompt editing or versioning.
- General-purpose command execution through the local API.

## User Workflow

1. Upload `Source Image`.
2. Search or enter a natural-language request in the Gallery search box.
3. Click `推荐` to get six recommended Gallery cases, or browse by category.
4. Click a Gallery card.
5. The bottom prompt bar shows the selected case's original prompt.
6. Click `改写`.
7. The Local Codex Bridge calls Codex CLI with the source image and original prompt.
8. The bottom prompt bar shows the rewritten prompt in the `改写 Prompt` tab.
9. The user manually copies the rewritten prompt into ChatGPT and generates an image.
10. Upload `Result Image`.
11. The app automatically saves an experiment record.

## Interface Design

The app uses `Two-Pane Studio + bottom prompt bar`.

Main area:

- Left workspace:
  - `Source Image` upload panel.
  - `Result Image` upload panel.
- Right Gallery:
  - Search / natural-language request input.
  - `推荐` button.
  - Category filter chips.
  - Gallery card grid.

Bottom prompt bar:

- Fixed horizontal bar across the browser width.
- `原始 Prompt` tab.
- `改写 Prompt` tab.
- Current selected case number and title.
- `改写` button.

Gallery card behavior:

- Default state shows the example image.
- Hover shows only case number, title, category, and a click-to-select affordance.
- Prompt previews are not shown on hover.
- Clicking a card selects it and loads the original prompt into the bottom prompt bar.
- Recommended cases are displayed in the same card grid as normal Gallery cases.

## Interaction States

No source image:

- `推荐` disabled.
- `改写` disabled.
- `Result Image` upload disabled.

Source image uploaded, no selected case:

- `推荐` enabled.
- `改写` disabled.
- `Result Image` upload disabled.

Source image uploaded and case selected:

- `推荐` enabled.
- `改写` enabled.
- `Result Image` upload disabled.
- `原始 Prompt` tab displays the selected case prompt.

Source image uploaded, case selected, rewritten prompt generated:

- `推荐` enabled.
- `改写` enabled.
- `Result Image` upload enabled.
- `改写 Prompt` tab displays the rewritten prompt.

Result image uploaded:

- Upload succeeds to Supabase Storage.
- Experiment record is inserted automatically.
- No manual save button is shown.

## Supabase Data Model

Supabase is the runtime data source. Existing Markdown and local assets are only import sources.

### Tables

`categories`

- `id`
- `slug`
- `name`
- `sort_order`
- `source_gallery_file`

`prompt_cases`

- `id`
- `case_number`
- `title`
- `category_id`
- `prompt_text`
- `image_storage_path`
- `image_public_url`
- `summary`
- `tags`
- `source_gallery_file`
- `created_at`
- `updated_at`

`experiments`

- `id`
- `source_image_storage_path`
- `result_image_storage_path`
- `prompt_case_id`
- `original_prompt_text`
- `rewritten_prompt_text`
- `recommendation_query`
- `created_at`

### Storage

`gallery-images`

- Stores migrated `assets/case<n>.jpg` example images.

`experiment-images`

- Stores uploaded source images and result images.

### Access Model

The first version is a personal local tool without login.

- `categories` and `prompt_cases` are readable by the frontend.
- `experiments` can be inserted and read by the local frontend.
- Gallery images are readable by the frontend.
- Experiment images are uploadable and readable by the local tool.
- No Supabase secret key is exposed in browser code.
- Management import scripts may use privileged environment variables locally.

RLS remains enabled for exposed tables, with policies that match this local-tool access model.

## Gallery Import

The import process converts the existing repository content into Supabase data.

Input sources:

- `index.md`
- `gallery*.md`
- `assets/case*.jpg`

Import steps:

1. Parse Gallery category metadata from `index.md` and `gallery*.md`.
2. Extract case number, title, full Chinese prompt, source Gallery file, and local image path.
3. Upload each example image to `gallery-images`.
4. Insert or upsert `categories`.
5. Insert or upsert `prompt_cases`.
6. Validate case counts, duplicate case numbers, missing images, and known missing prompt entries.

Known missing prompt entry numbers `12`, `169`, and `170` remain known gaps. The import must not invent prompts for them.

The runtime app reads Supabase, not Markdown files.

## AI Recommendation

The `推荐` action requires a source image.

Input:

- Source image.
- User request text.
- Optional category filter.
- Lightweight case index from Supabase.

Output:

- Exactly six recommended Gallery cases.
- Each recommendation includes a case number and short reason.

The app does not send all full prompt text to Codex for recommendation. It sends a lightweight index containing:

- `case_number`
- `title`
- `category`
- `summary`
- `tags`
- prompt excerpt
- image path or URL reference

If recommendations are not useful, the user edits the request text and clicks `推荐` again. There is no separate `重新推荐` button.

## AI Prompt Rewrite

The `改写` action requires:

- Source image uploaded.
- Gallery case selected.
- Original prompt loaded.

The rewrite follows the existing `get-image-prompt` rules:

- Use only the uploaded image as the subject reference.
- Preserve the selected prompt's target scene, style, structure, composition, lighting, text, and core visual setup.
- Do not rewrite the uploaded image's background, selfie quality, unrelated people, stickers, room details, or other incidental content into the final prompt.
- Modify only the subject anchor, explicit placeholders, and direct conflicts between the selected prompt and uploaded subject.
- Output Chinese only.

The result populates the `改写 Prompt` tab.

## Local Codex Bridge

The app includes a thin local Node API under `web/`, called Local Codex Bridge.

It is not a general backend. It only bridges the React app to fixed Codex CLI tasks.

Endpoints:

`POST /api/recommend`

- Accepts source image reference, user query, optional category filter, and lightweight case index.
- Calls `codex exec`.
- Returns six case numbers with short reasons.

`POST /api/rewrite`

- Accepts source image reference, case number, and original prompt text.
- Calls `codex exec`.
- Returns rewritten prompt text plus preserved and changed parts.

Codex CLI is called non-interactively, for example:

```bash
codex exec \
  --ephemeral \
  --sandbox read-only \
  -C /Users/godw/Code/Python/ImageOdyssey \
  -i <source-image-file> \
  "<fixed task prompt>"
```

Bridge constraints:

- The frontend cannot pass arbitrary shell commands.
- The bridge only invokes fixed `codex exec` tasks.
- The bridge must not use `danger-full-access`.
- Images must come from app-managed uploads or an app-managed local cache.
- Codex output is requested as JSON and parsed strictly.
- Failures return user-readable errors such as Codex failure, invalid JSON, missing source image, or missing selected prompt.

## Project Structure

Formal app location:

```text
web/
```

Suggested structure:

```text
web/
- package.json
- vite.config.ts
- src/
  - app/
  - components/
  - lib/
  - api-client/
  - types/
- server/
  - codexBridge.ts
  - routes.ts
- scripts/
  - import-gallery.ts
  - validate-gallery-import.ts
- supabase/
  - migrations/
  - schema.sql
```

The existing `learn/my-app` is not used as the base for the formal app.

## Cleanup Plan

During implementation and migration, keep the existing Gallery files as source material:

- `gallery*.md`
- `assets/case*.jpg`
- `index.md`

After Supabase import and app verification pass:

1. Create an archive such as `archive/prompt-gallery-source-2026-05-02.zip`.
2. Verify the archive can list expected files.
3. Present a deletion list for user confirmation.
4. After confirmation, remove old runtime-unneeded source files such as `gallery*.md`, `assets/case*.jpg`, `learn/`, and confirmed obsolete experiment files.

No deletion happens without an explicit final confirmation.

## Verification

Data import verification:

- Category count matches the Gallery index.
- Prompt case count matches Markdown case count.
- Gallery image upload count matches available assets.
- Duplicate case numbers are reported.
- Known missing prompt entries `12`, `169`, and `170` are preserved as known gaps.

Frontend verification:

- Categories and Gallery cards load from Supabase.
- Source image upload enables `推荐`.
- `推荐` returns six cases.
- Clicking a case shows the original prompt in the bottom prompt bar.
- `改写` produces a rewritten Chinese prompt.
- Result image upload is disabled before rewrite.
- Result image upload is enabled after rewrite.
- Result image upload automatically inserts an experiment record.

Bridge verification:

- `/api/recommend` returns exactly six structured recommendations.
- `/api/rewrite` returns valid structured JSON and Chinese prompt text.
- Codex CLI failures are surfaced clearly in the UI.

Build and quality verification:

- TypeScript build passes.
- Lint passes if configured.
- Browser smoke test covers the main workflow.
- Supabase import validation script passes.
