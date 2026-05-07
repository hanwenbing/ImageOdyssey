# Prompt Gallery Web Handoff

Date: 2026-05-03

This document hands off the current Prompt Gallery web app work for continued
development after the repository is forked from GitHub.

## Source Documents

- Product design: `docs/superpowers/specs/2026-05-02-prompt-gallery-web-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-02-prompt-gallery-web-implementation.md`
- Current feature branch before merge: `codex-prompt-gallery-web`
- Current feature branch HEAD before merge: `286b9b3`

## Product Goal

The app turns the current `get-image-prompt` workflow into a local visual web
studio. The user uploads a source image, browses or asks for recommendations
from the existing GPT Image 2 prompt Gallery, selects a prompt case, asks the
local Node API and Huawei MaaS bridge to recommend and rewrite prompts around
the uploaded subject, then
manually uses the rewritten prompt in ChatGPT. After ChatGPT generates the
image, the user uploads the result image back into the app and the experiment is
saved automatically.

This is a personal local tool. It is not a public website, a multi-user app, or
a GPT Image 2 API client.

## Completed Work

### Task 1: Web scaffold

- Created the formal app under `web/`, separate from `learn/my-app`.
- Added Vite, React, TypeScript, Tailwind CSS v4, Vitest, Testing Library, and
  ESLint.
- Wired Tailwind through `@tailwindcss/vite`.
- Added a minimal smoke test for the app shell.

### Task 2: Supabase schema and shared types

- Added typed frontend/server contracts in `web/src/types.ts` and
  `web/server/types.ts`.
- Added Supabase SQL under `web/supabase/`.
- `categories` and `prompt_cases` are readable from browser code.
- `gallery-images` is public/readable.
- `experiment-images` is private.
- `experiments` has no anonymous read/write policy.
- Browser code uses only `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`; secret-key credentials are reserved for
  local scripts and the future local Node API.

### Task 3: Gallery Markdown parser

- Added parser APIs in `web/scripts/parseGallery.ts`:
  - `parseIndexMarkdown`
  - `parseGalleryMarkdown`
  - `createPromptExcerpt`
- Parser handles CRLF and extra blank lines.
- Parser validates anchors, headings, image references, prompt fences, duplicate
  anchors, duplicate images, duplicate prompt fences, and mismatched case
  numbers.
- Parser tests cover fixture cases and the real corpus.
- Current real corpus parses as 13 categories and 352 prompt cases.

### Task 4: Supabase import and validation scripts

- Added `npm run import:gallery`.
- Added `npm run validate:gallery`.
- Import script:
  - loads env with precedence: shell env > `.env.local` > `.env`;
  - requires `SUPABASE_URL` and `SUPABASE_SECRET_KEY`;
  - fail-fast validates local corpus shape before remote mutation;
  - asserts 13 categories, 352 prompt cases, and missing case numbers
    `[12, 169, 170]`;
  - uploads Gallery example images to `gallery-images` at `cases/caseN.jpg`;
  - upserts `categories` on `slug`;
  - upserts `prompt_cases` on `case_number`;
  - deletes stale `prompt_cases` and `categories` not present in the local
    corpus so import converges to the current Gallery source.
- Validation script:
  - validates the same local corpus counts and missing case-number set;
  - validates full database table counts;
  - compares database category and prompt-case fields against the local corpus.

## Verification Already Run

From the feature branch:

```bash
npm -C web test
npm -C web run build
npm -C web run lint
env -u SUPABASE_URL -u SUPABASE_SECRET_KEY npm -C web run import:gallery
env -u SUPABASE_URL -u SUPABASE_SECRET_KEY npm -C web run validate:gallery
```

Observed results:

- Vitest passed: 2 test files, 17 tests.
- Build passed.
- Lint passed.
- `import:gallery` and `validate:gallery` fail clearly when Supabase env vars
  are absent: `Missing required environment variable: SUPABASE_URL`.

Not yet run:

- Live Supabase import and validation, because `SUPABASE_URL` and
  `SUPABASE_SECRET_KEY` were not available in this session.

## Setup For The Next Developer

After forking/cloning the repository:

```bash
cd ImageOdyssey/web
npm install
```

Create local env files or export shell variables:

```bash
SUPABASE_URL="https://..."
SUPABASE_SECRET_KEY="..."
VITE_SUPABASE_URL="https://..."
VITE_SUPABASE_PUBLISHABLE_KEY="..."
HUAWEI_MAAS_API_KEY="..."
HUAWEI_MAAS_CHAT_COMPLETIONS_URL="https://api.modelarts-maas.com/v2/chat/completions"
HUAWEI_MAAS_MODEL="deepseek-v4-flash"
HUAWEI_MAAS_VISION_CHAT_COMPLETIONS_URL="https://api.modelarts-maas.com/v1/chat/completions"
HUAWEI_MAAS_VISION_MODEL="qwen2.5-vl-72b"
```

Apply the SQL in:

```text
web/supabase/migrations/0001_prompt_gallery_schema.sql
web/supabase/migrations/0002_restrict_experiment_access.sql
```

Then import and validate the Gallery:

```bash
npm run import:gallery
npm run validate:gallery
```

Expected validation summary:

```json
{
  "categories": 13,
  "prompt_cases": 352,
  "known_missing_prompt_numbers": [12, 169, 170]
}
```

For local development:

```bash
npm run dev
```

The local Node API is implemented. Use `npm run dev:all` to run both the API
server and Vite dev server for local workflow testing.

## Remaining Work

Continue from Task 5 in the implementation plan.

### Task 5: Local Image Cache and MaaS Bridge core

- Add server-side image cache for private `experiment-images`.
- Add fixed MaaS prompt builders for recommendation and rewrite.
- Use Huawei MaaS VL model `qwen2.5-vl-72b` for source image description.
- Use Huawei MaaS text model `deepseek-v4-flash` for recommendation and rewrite.
- Validate MaaS JSON output before returning it to the app.

### Task 6: Local API routes

- Add the local Node API.
- Required endpoints:
  - `POST /api/recommend`
  - `POST /api/rewrite`
  - `POST /api/experiment-images`
  - `POST /api/experiments`
- Add server dependencies and scripts only when these files exist:
  - `express`
  - `cors`
  - `multer`
  - `dotenv`
  - `tsx`
  - `zod`
  - matching `@types/*`
  - `concurrently` if `dev:all` is added.

### Task 7: Gallery data access and filtering

- Load `categories` and `prompt_cases` from Supabase.
- Add search by case number/title/tags/category.
- Keep `CaseIndexItem.category_name`, not `category`.
- Build the lightweight case index for recommendation.

### Task 8: Studio UI

- Build the Two-Pane Studio layout:
  - left source/result upload panels;
  - right Gallery controls and card grid;
  - fixed bottom prompt bar.
- Hover cards should show case number, title, category, and click affordance,
  not prompt previews.
- Buttons should follow the agreed labels: `推荐` and `改写`.

### Task 9: Frontend integration

- Browser must not upload to `experiment-images` directly.
- Browser must not insert `experiments` directly.
- Browser should call the local API for source/result image upload and
  experiment saving.
- Use `URL.createObjectURL(file)` for immediate source/result previews.
- After result upload succeeds, automatically save the experiment record.

### Task 10: End-to-end smoke test

- Start local API and Vite.
- Use the browser to verify:
  - Gallery loads;
  - `推荐`, `改写`, and result upload are disabled/enabled in the correct
    states;
  - recommendation returns six marked cases;
  - selecting a card fills `原始 Prompt`;
  - rewrite fills `改写 Prompt`;
  - result upload creates an `experiments` row.

### Task 11: Cleanup proposal

- Do not delete Gallery source files automatically.
- Prepare a reviewable cleanup proposal only after migration and smoke tests are
  verified.
- Keep these files until the user explicitly approves cleanup:
  - `data/gallery/index.md`
  - `data/gallery/gallery*.md`
  - `data/gallery/assets/case*.jpg`

## Important Boundaries

- `learn/my-app` was a learning experiment and is not part of the formal Web App.
- Do not expose `SUPABASE_SECRET_KEY` to browser code.
- Do not add a general shell execution endpoint.
- Do not add GPT Image 2 API integration in v1.
- Do not add authentication or multi-user behavior unless the product scope is
  explicitly changed.
- Do not remove Markdown Gallery files or local assets until the user approves
  cleanup after migration verification.
