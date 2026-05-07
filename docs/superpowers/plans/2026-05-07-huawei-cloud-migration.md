# Huawei Cloud Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ImageOdyssey from a Supabase-backed local app toward the approved Huawei Cloud architecture: OBS/CDN frontend, Flexus L backend API, RDS PostgreSQL, OBS storage, and Huawei MaaS.

**Architecture:** Make the backend the only runtime data boundary. Replace browser Supabase reads with backend API reads, replace Supabase Storage with server-side OBS access, and replace Supabase database calls with PostgreSQL repositories that can point at Huawei RDS.

**Tech Stack:** React, Vite, TypeScript, Express, PostgreSQL, Huawei OBS Node.js SDK (`esdk-obs-nodejs`), Huawei MaaS, Nginx, systemd, OBS static website hosting, CDN.

---

## Scope Split

This plan is intentionally phased. Tasks 1-6 are code migration tasks that can be implemented and tested locally. Tasks 7-9 are cloud provisioning and deployment tasks that require Huawei Cloud console access and production secrets.

## Files

- Modify `web/package.json` to add PostgreSQL and OBS runtime dependencies and deployment scripts only when their modules are introduced.
- Modify `web/server/env.ts` to replace Supabase runtime config with database, OBS, public asset, and MaaS config.
- Create `web/server/database.ts` for PostgreSQL pool creation and lifecycle.
- Create `web/server/repositories/galleryRepository.ts`, `web/server/repositories/experimentRepository.ts`, and `web/server/repositories/workflowEventRepository.ts`.
- Create `web/server/storage/obsStorage.ts` for gallery/experiment object operations.
- Modify `web/server/routes.ts` to expose backend gallery APIs and use repositories/storage.
- Modify `web/server/sourceImageCache.ts` to download private experiment images from OBS.
- Modify `web/src/lib/apiClient.ts`, `web/src/App.tsx`, and `web/src/vite-env.d.ts` so the browser uses `VITE_API_BASE_URL` and backend APIs instead of Supabase.
- Replace or fork `web/scripts/importGallery.ts` and `web/scripts/validateGalleryImport.ts` so they target PostgreSQL plus OBS.
- Create `docs/deployment/huawei-cloud.md` for the manual cloud runbook.

## Task 1: Lock Runtime Configuration

**Files:**
- Modify: `web/server/env.ts`
- Modify: `web/server/__tests__/env.test.ts`
- Modify: `web/src/vite-env.d.ts`

- [ ] **Step 1: Add failing tests for new backend env**

Run: `npm -C web test -- server/__tests__/env.test.ts`

Expected before implementation: tests should fail because `getDatabaseConfig()` and `getObsConfig()` do not exist.

- [ ] **Step 2: Implement explicit config readers**

Add these server config functions:

- `getDatabaseConfig()` returns `{ databaseUrl }` from `DATABASE_URL`.
- `getObsConfig()` returns `{ endpoint, region, accessKeyId, secretAccessKey, galleryBucket, experimentBucket, publicGalleryAssetBaseUrl }`.
- Keep `getHuaweiMaasConfig()` unchanged.
- Remove normal runtime dependence on `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; those names may remain only in legacy tests until later tasks delete Supabase modules.

- [ ] **Step 3: Update frontend env typing**

Replace `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `web/src/vite-env.d.ts` with `VITE_API_BASE_URL`.

- [ ] **Step 4: Verify**

Run:

```bash
npm -C web test -- server/__tests__/env.test.ts
npm -C web run build
```

Expected: env tests pass; build may still fail if browser code still references Supabase env. If it fails for Supabase env references, record it and continue to Task 4.

- [ ] **Step 5: Commit**

```bash
git add web/server/env.ts web/server/__tests__/env.test.ts web/src/vite-env.d.ts
git commit -m "chore: define huawei cloud runtime config"
```

## Task 2: Add PostgreSQL Repository Layer

**Files:**
- Modify: `web/package.json`
- Create: `web/server/database.ts`
- Create: `web/server/repositories/galleryRepository.ts`
- Create: `web/server/repositories/experimentRepository.ts`
- Create: `web/server/repositories/workflowEventRepository.ts`
- Test: `web/server/__tests__/galleryRepository.test.ts`
- Test: `web/server/__tests__/experimentRepository.test.ts`
- Test: `web/server/__tests__/workflowEventRepository.test.ts`

- [ ] **Step 1: Add dependency**

Install `pg` and `@types/pg`:

```bash
npm -C web install pg
npm -C web install -D @types/pg
```

- [ ] **Step 2: Write repository tests with mocked query client**

Cover:

- Gallery categories are returned ordered by `sort_order`.
- Prompt cases are joined with categories and mapped to the existing `PromptCaseWithCategory` shape.
- Experiment insert returns the inserted id and preserves storage paths/prompt fields.
- Workflow event insert stores JSON payload columns unchanged.

- [ ] **Step 3: Implement repositories**

Use parameterized SQL only. Keep each repository function small:

- `listCategories(client)`
- `listPromptCases(client)`
- `insertExperiment(client, input)`
- `insertWorkflowEvent(client, input)`

- [ ] **Step 4: Verify**

Run:

```bash
npm -C web test -- server/__tests__/galleryRepository.test.ts server/__tests__/experimentRepository.test.ts server/__tests__/workflowEventRepository.test.ts
npm -C web run lint
```

Expected: tests and lint pass.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/server/database.ts web/server/repositories web/server/__tests__
git commit -m "feat: add postgres repositories"
```

## Task 3: Add OBS Storage Adapter

**Files:**
- Modify: `web/package.json`
- Create: `web/server/storage/obsStorage.ts`
- Modify: `web/server/sourceImageCache.ts`
- Test: `web/server/__tests__/obsStorage.test.ts`
- Test: `web/server/__tests__/sourceImageCache.test.ts`

- [ ] **Step 1: Add Huawei OBS SDK**

Use Huawei's official Node.js SDK package:

```bash
npm -C web install esdk-obs-nodejs
```

- [ ] **Step 2: Write storage adapter tests**

Cover:

- Uploading source/result images writes to the experiment bucket under `source/` or `result/`.
- Public gallery URLs are built from `PUBLIC_GALLERY_ASSET_BASE_URL`.
- Downloading a private experiment image returns bytes and content type for MaaS.
- Empty object responses fail explicitly.

- [ ] **Step 3: Implement `obsStorage.ts`**

Expose:

- `uploadExperimentImage(kind, fileName, contentType, buffer)`
- `downloadExperimentImage(storagePath)`
- `getPublicGalleryUrl(storagePath)`

Do not expose OBS credentials to browser code.

- [ ] **Step 4: Update source image cache**

Change `resolveSourceImageDataUrl(storagePath)` to use `downloadExperimentImage(storagePath)` instead of Supabase Storage.

- [ ] **Step 5: Verify**

Run:

```bash
npm -C web test -- server/__tests__/obsStorage.test.ts server/__tests__/sourceImageCache.test.ts
npm -C web run lint
```

Expected: tests and lint pass.

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/package-lock.json web/server/storage web/server/sourceImageCache.ts web/server/__tests__
git commit -m "feat: add huawei obs storage adapter"
```

## Task 4: Move Browser Data Reads Behind Backend API

**Files:**
- Modify: `web/server/routes.ts`
- Modify: `web/server/__tests__/routes.test.ts`
- Modify: `web/src/lib/apiClient.ts`
- Modify: `web/src/App.tsx`
- Delete: `web/src/lib/supabaseClient.ts`
- Modify: `web/src/__tests__/App.test.tsx`
- Modify: `web/src/__tests__/apiClient.test.ts`

- [ ] **Step 1: Add backend route tests**

Add tests for:

- `GET /api/gallery/categories`
- `GET /api/gallery/prompt-cases`
- Repository failures return `500` with a clear error.

- [ ] **Step 2: Implement routes**

Wire the new routes to the PostgreSQL gallery repository.

- [ ] **Step 3: Add frontend API client tests**

Add `fetchCategories()` and `fetchPromptCases()` tests using mocked `fetch`.

- [ ] **Step 4: Update App data loading**

Replace `getSupabaseClient().from(...)` reads with `fetchCategories()` and `fetchPromptCases()`.

- [ ] **Step 5: Delete browser Supabase client**

Remove `web/src/lib/supabaseClient.ts` and all imports of `@supabase/supabase-js` from browser runtime code.

- [ ] **Step 6: Verify**

Run:

```bash
npm -C web test -- src/__tests__/apiClient.test.ts src/__tests__/App.test.tsx server/__tests__/routes.test.ts
npm -C web run build
npm -C web run lint
```

Expected: tests, build, and lint pass without `VITE_SUPABASE_*`.

- [ ] **Step 7: Commit**

```bash
git add web/server/routes.ts web/server/__tests__/routes.test.ts web/src/lib web/src/App.tsx web/src/__tests__ web/src/vite-env.d.ts
git rm web/src/lib/supabaseClient.ts
git commit -m "feat: serve gallery data through backend api"
```

## Task 5: Replace Supabase Upload And Experiment Save Paths

**Files:**
- Modify: `web/server/routes.ts`
- Modify: `web/server/__tests__/routes.test.ts`
- Modify: `web/src/lib/apiClient.ts`
- Modify: `web/src/__tests__/apiClient.test.ts`

- [ ] **Step 1: Update upload route tests**

Keep the existing `/api/experiment-images` contract returning `{ storagePath }`, but assert it calls the OBS adapter, not Supabase Storage.

- [ ] **Step 2: Update experiment route tests**

Assert `/api/experiments` inserts through the PostgreSQL experiment repository.

- [ ] **Step 3: Implement route wiring**

Replace `client.storage.from("experiment-images").upload(...)` and `client.from("experiments").insert(...)` with OBS and repository calls.

- [ ] **Step 4: Verify**

Run:

```bash
npm -C web test -- server/__tests__/routes.test.ts src/__tests__/apiClient.test.ts
npm -C web run build
npm -C web run lint
```

Expected: tests, build, and lint pass.

- [ ] **Step 5: Commit**

```bash
git add web/server/routes.ts web/server/__tests__/routes.test.ts web/src/lib/apiClient.ts web/src/__tests__/apiClient.test.ts
git commit -m "feat: save experiments with rds and obs"
```

## Task 6: Replace Import And Validation Scripts

**Files:**
- Modify: `web/scripts/importGallery.ts`
- Modify: `web/scripts/validateGalleryImport.ts`
- Test: existing parser/import validation tests where applicable

- [ ] **Step 1: Update import behavior**

Change `importGallery.ts` to:

- Read local `data/gallery/index.md`, `data/gallery/gallery*.md`, and `data/gallery/assets/case*.jpg`.
- Upload gallery images to `OBS_GALLERY_BUCKET` at `cases/case<n>.jpg`.
- Upsert `categories` and `prompt_cases` using PostgreSQL SQL.
- Store `image_public_url` as `${PUBLIC_GALLERY_ASSET_BASE_URL}/cases/case<n>.jpg`.

- [ ] **Step 2: Update validation behavior**

Change `validateGalleryImport.ts` to:

- Query RDS/PostgreSQL directly.
- Compare table rows against the local corpus.
- Validate expected counts: 13 categories, 352 prompt cases, known missing prompt numbers `[12, 169, 170]`.
- Validate gallery public URLs against `PUBLIC_GALLERY_ASSET_BASE_URL`.

- [ ] **Step 3: Verify**

Run:

```bash
npm -C web test -- scripts/__tests__/parseGallery.test.ts
npm -C web run build
npm -C web run lint
```

Expected: tests, build, and lint pass. Live import/validation requires cloud or local PostgreSQL/OBS-compatible credentials.

- [ ] **Step 4: Commit**

```bash
git add web/scripts/importGallery.ts web/scripts/validateGalleryImport.ts
git commit -m "feat: import gallery to postgres and obs"
```

## Task 7: Add Huawei Cloud Deployment Runbook

**Files:**
- Create: `docs/deployment/huawei-cloud.md`
- Modify: `README.md` only if it needs a short pointer to the runbook

- [ ] **Step 1: Document resource creation order**

Write the runbook with this order:

1. Choose region.
2. Create/confirm VPC path for Flexus L and RDS.
3. Create RDS PostgreSQL with public access disabled.
4. Create Flexus L and confirm private connectivity to RDS `5432`.
5. Create OBS buckets for frontend, gallery images, and private experiment images.
6. Configure CDN/custom domains for frontend and API.

- [ ] **Step 2: Document server setup**

Include commands for:

- Installing Node.js LTS.
- Installing Nginx.
- Creating an app directory.
- Installing dependencies with `npm ci`.
- Building or copying the backend bundle.
- Creating a systemd service for the Express API.
- Configuring Nginx reverse proxy for `api.example.com`.

- [ ] **Step 3: Document frontend release**

Include:

```bash
npm -C web run build
```

Then upload `web/dist/` to the OBS static website bucket and refresh CDN cache.

- [ ] **Step 4: Document verification**

Include:

- `curl https://api.example.com/api/gallery/categories` returns JSON from the Flexus L API.
- Browser Use verification of upload, recommend, rewrite, result upload, and experiment save.
- RDS security group confirmation that `5432` is not public.

- [ ] **Step 5: Commit**

```bash
git add docs/deployment/huawei-cloud.md README.md
git commit -m "docs: add huawei cloud deployment runbook"
```

## Task 8: Provision Cloud Resources

**Files:**
- No repo files unless the user asks to record environment placeholders.

- [ ] **Step 1: Create resources in Huawei Cloud console**

Create the approved resources:

- Flexus L instance.
- RDS PostgreSQL.
- OBS frontend static website bucket.
- OBS gallery image bucket.
- OBS private experiment image bucket.
- CDN/custom domains for the frontend domain and API domain when both are used.

- [ ] **Step 2: Configure security groups**

Allow RDS `5432` only from Flexus L private source. Allow Flexus L `80/443` publicly and restrict `22`.

- [ ] **Step 3: Smoke test private DB connectivity**

From Flexus L:

```bash
nc -vz <rds-private-host> 5432
```

Expected: connection succeeds from Flexus L and is not reachable from public internet.

## Task 9: Production Release Verification

**Files:**
- No code files unless verification reveals bugs.

- [ ] **Step 1: Run local checks**

```bash
npm -C web test
npm -C web run build
npm -C web run lint
```

Expected: all pass.

- [ ] **Step 2: Run import and validation against production resources**

```bash
npm -C web run import:gallery
npm -C web run validate:gallery
```

Expected: validation reports 13 categories, 352 prompt cases, and known missing prompt numbers `[12, 169, 170]`.

- [ ] **Step 3: Run Browser Use acceptance**

Verify in a real browser:

- Frontend loads from OBS/CDN.
- Gallery cards and images render.
- Source image upload succeeds.
- Recommendation returns six cases.
- Rewrite returns a Chinese prompt.
- Result image upload saves an experiment.
- User-visible errors are clear when required inputs are missing.

- [ ] **Step 4: Commit any verification fixes**

If verification required code/doc fixes:

```bash
git add <changed-files>
git commit -m "fix: address huawei cloud deployment verification"
```

## Notes

- Do not add authentication or multi-user accounts in this migration unless the user explicitly expands scope.
- Do not deploy database credentials, OBS secrets, or MaaS keys into OBS frontend files.
- Keep the route split as `image.example.com` for frontend and `api.example.com` for backend in the first release.
- Do not introduce CCI/CCE until the single Flexus L API deployment becomes hard to operate.
