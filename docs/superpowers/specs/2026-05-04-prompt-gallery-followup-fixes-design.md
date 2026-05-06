# Prompt Gallery Follow-up Fixes Design

## Context

The upstream Prompt Gallery Studio PR has been merged. A manual review found six follow-up issues in the merged web app:

1. The page has browser-level vertical scrolling. Only the Gallery area should scroll.
2. The bottom Prompt area should behave like a drawer, and the rewrite button should align with the prompt text area.
3. Some prompt text is stored and displayed as JSON-like text instead of natural language.
4. AI recommend and rewrite are not reliably usable and need clearer failure diagnostics.
5. The two upload panels include helper copy that should be removed.
6. Gallery card hover should use one transparent overlay panel instead of duplicated bottom information.

This follow-up will be developed from the latest `upstream/main` on a new branch and submitted as a PR. It will not push directly to `main`.

## Scope

This PR will fix all six reviewed issues in one pass.

It will also include two agreed extensions:

- A lightweight Supabase-backed workflow diagnostics log.
- A root-level Windows startup script, `run-web-dev.cmd`, for local development.

The Prompt JSON-like cleanup is in scope for the same PR. Supabase currently has 352 prompt cases, and 93 of them are JSON-like by the check `btrim(prompt_text) like '{%' or '['`. Because the import script reads prompt fences from `gallery*.md` as-is, the cleanup must update the local gallery source files and then re-import to Supabase. Updating only the database would be overwritten by the next import.

Out of scope:

- Implementing GPT Image 2 API calls.
- Adding a frontend diagnostics page.
- Allowing the browser to write directly to sensitive Supabase tables.
- Deleting `index.md`, `gallery*.md`, or `assets/`.
- Cleaning or archiving old gallery files beyond the prompt text edits required here.

## Branch And PR Flow

The work starts from `upstream/main` on:

```text
codex/prompt-gallery-followup-fixes
```

The final PR will target:

```text
353055619/ImageOdyssey:main
```

The PR body will include:

- Which reviewed issues were fixed.
- The workflow diagnostics table and what it records.
- Prompt JSON-like cleanup method and validation result.
- Windows startup script usage.
- Automated and manual validation results.

## Workflow Diagnostics

Add a Supabase table named `workflow_events`.

Proposed columns:

```text
id uuid primary key default gen_random_uuid()
request_id text not null
workflow text not null
stage text not null
status text not null
message text null
request_payload jsonb null
response_payload jsonb null
error_payload jsonb null
metadata jsonb null
created_at timestamptz not null default now()
```

Indexes:

```text
created_at desc
request_id
workflow + created_at desc
status + created_at desc
```

RLS:

- Enable RLS.
- Do not add `anon` or `authenticated` insert/select policies.
- Local server writes through the service role client.
- Developers inspect logs in Supabase Dashboard or through service role queries.

Retention:

- No automatic cleanup for this practice project.

Recorded data:

- Full business request and response payloads for local API diagnostics.
- Prompt text, Codex stdout/stderr, storage paths, status, error context, and metadata.
- Do not intentionally record service role keys, environment variables, or image binaries.

Server implementation:

- Add `web/server/workflowEvents.ts`.
- Add a helper to create request ids and write events.
- Log started/succeeded/failed events for:
  - `/api/recommend`
  - `/api/rewrite`
  - `/api/experiment-images`
  - `/api/experiments`
- Add `/api/workflow-events` for selected frontend-only events. The route validates payloads and writes through service role.

Frontend-only events:

- Recommend clicked while not actionable.
- Rewrite clicked while not actionable.
- Result upload clicked while not actionable.
- API failure summary captured by the frontend.

Do not log search typing, hover, scrolling, drawer open/close, or normal case selection.

## AI Recommend And Rewrite

The machine API may return JSON envelopes where needed, but all user-visible prompt text must be natural language.

Recommend:

- `/api/recommend` returns a machine-readable recommendation list.
- It must return exactly 6 unique recommendations.
- Each `case_number` must come from the request cases.
- Each reason must be non-empty.
- The recommendation response is not user-copyable prompt text, so JSON is acceptable here.

Rewrite:

- `/api/rewrite` may return an outer JSON object for program parsing.
- `rewritten_prompt_text` must be natural-language Chinese prompt text.
- It must not be JSON-like prompt content, a Markdown code fence, or a key-value object.
- The Codex prompt should explicitly require natural-language Chinese prompt text inside `rewritten_prompt_text`.

Error behavior:

- Server errors should identify the failing stage where practical:
  - source image cache
  - Codex exec
  - JSON parse
  - recommendation validation
  - rewrite validation
  - Supabase insert/upload
- Frontend should show the server error message.
- Local API connection failures should be translated into an actionable message:

```text
本地 API 未连接。请运行 run-web-dev.cmd 或 npm -C web run dev:all。
```

Button behavior:

- For key actions, use an actionable click handler even when visually disabled.
- If recommend/rewrite/result upload cannot proceed, show a clear reason and write a frontend workflow event.
- Do not silently ignore blocked clicks.

## UI Layout

Desktop layout:

- Root page uses a fixed viewport layout like `h-screen overflow-hidden`.
- Browser-level vertical scrolling should not appear.
- Left rail has fixed width and contains Source Image and Result Image panels.
- Source and Result panels split the available left rail height.
- Right side contains filters/search/actions and the Gallery grid.
- Only the Gallery grid list scrolls internally.
- Ancestors of the scrollable Gallery must use `min-h-0` and clear height constraints.

Prompt drawer:

- Bottom Prompt area becomes a fixed drawer.
- Drawer overlays content instead of pushing page height.
- No page-level scroll should appear when it opens.
- Default behavior:
  - No selected case: drawer collapsed.
  - Selecting a case: drawer opens automatically.
  - Successful rewrite: drawer stays open and switches to the rewrite tab.
- Collapsed state shows only the title, selected case status, and open control.
- Expanded state shows original/rewrite tabs, prompt text area, and rewrite button.
- Rewrite button aligns visually with the prompt text area, preferably bottom-aligned on desktop.
- On mobile, controls may wrap naturally but must not cover text.

Upload panels:

- Remove these helper strings from the UI:
  - `上传参考图，推荐和改写都会围绕它展开`
  - `完成改写后上传生成结果，系统会自动保存实验记录`
- `ImageUploadPanel` helper text should be optional and should render no `<p>` when omitted.

Gallery hover:

- Non-hover state should keep the card image dominant.
- Hover state should show one semi-transparent overlay over the card or main image area.
- The overlay shows:
  - Case number
  - Title
  - Category
  - Recommended marker when applicable
  - Click-to-select hint
- Do not render both a persistent bottom information block and a hover information block.
- Selected and recommended states must remain visually distinguishable.

## Prompt JSON-like Cleanup

Confirmed data issue:

- Supabase has 93 JSON-like `prompt_cases.prompt_text` rows out of 352.
- The issue is data-source level, not just frontend stringification.
- Local `gallery*.md` prompt fences need to be updated so future imports do not reintroduce JSON-like prompt text.

Cleanup strategy:

1. Scan local `gallery*.md` files for JSON-like prompt fences.
2. Classify structures enough to choose 5 sample cases:
   - Simple object
   - Nested object
   - Array structure
   - Mixed Chinese/English or non-strict JSON punctuation
   - Complex parameter placeholders
3. Use `gpt-5.4-mini` subagents to rewrite the 5 samples into Chinese natural-language prompt text.
4. Show the 5 samples in chat only. Do not write files or update the database before user approval.
5. After sample approval, batch rewrite all 93 JSON-like prompts.
6. Update the corresponding prompt fences in `gallery*.md`.
7. Re-run the import script to update Supabase.
8. Validate local and Supabase prompt text no longer starts with JSON-like `{` or `[` unless a specific exception is documented.

Rewrite rules:

- Preserve original semantic requirements, visual style, composition, layout, text requirements, and parameter placeholders.
- Convert structure into natural Chinese prompt prose.
- Keep useful placeholders such as `{argument name="..." default="..."}` if they are part of the prompt workflow.
- Do not add new subjects, styles, scenes, or requirements.
- Do not output JSON, Markdown code fences, tables, or structured key-value objects.

## Windows Startup Script

Add root-level `run-web-dev.cmd`.

Behavior:

1. Prefer official Node.js npm:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web run dev:all
```

2. If that file does not exist, fall back to `npm.cmd` from `PATH`.
3. If neither exists, print a clear message asking the user to install official Node.js LTS.
4. Keep the command window open on failure so Windows users can read the error.

This script is only for local developer convenience.

## Tests And Verification

Automated verification:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test
"C:\Program Files\nodejs\npm.cmd" -C web run lint
"C:\Program Files\nodejs\npm.cmd" -C web run build
"C:\Program Files\nodejs\npm.cmd" -C web run validate:gallery
```

Additional data checks:

- Local JSON-like prompt scan.
- Supabase JSON-like prompt scan.
- Supabase `workflow_events` table exists with RLS enabled and no anon/authenticated policies.

Manual browser verification:

1. Run `run-web-dev.cmd`.
2. Open `http://127.0.0.1:5173/`.
3. Upload a Source Image.
4. Click Recommend.
5. Confirm 6 recommendations appear, are marked, and are sorted to the top.
6. Select a case and confirm the Prompt drawer opens.
7. Click Rewrite.
8. Confirm the rewrite tab shows natural-language prompt text.
9. Upload a Result Image and confirm the experiment record saves.
10. Confirm `workflow_events` contains the corresponding server and frontend diagnostic events.
11. Confirm no browser-level vertical scrollbar appears on desktop.
12. Confirm only the Gallery grid scrolls.
13. Confirm the Gallery hover overlay appears only on the hovered card and does not duplicate information.

## Implementation Order

1. Create the migration and workflow event logging helper.
2. Wire workflow logging into server routes and selected frontend events.
3. Improve AI route errors and rewrite prompt validation.
4. Fix layout, drawer, upload copy, and hover UI.
5. Add `run-web-dev.cmd`.
6. Scan JSON-like prompts and generate 5 sample rewrites for user approval.
7. After user approval, batch rewrite local prompt source files.
8. Re-import Supabase data.
9. Run automated and manual validation.
10. Commit and open a PR.

## Open Decisions

None. The user has confirmed:

- One PR handles all reviewed issues.
- JSON-like prompts are rewritten with `gpt-5.4-mini` subagents.
- Five samples are shown in chat before bulk rewrite.
- Workflow diagnostics are database-backed and include full practical debugging context.
- No automatic log cleanup.
- Frontend critical blocked events go through `/api/workflow-events`.
- Windows startup script is root-level `run-web-dev.cmd`.
- Drawer overlays content, selecting a case opens it, and successful rewrite switches to the rewrite tab.
- Gallery hover uses concise overlay information.
