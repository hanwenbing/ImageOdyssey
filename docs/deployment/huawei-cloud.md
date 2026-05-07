# Huawei Cloud Deployment

This runbook is the deployment placeholder for the approved ImageOdyssey target
architecture.

## Target

- Frontend: Vite React build uploaded to OBS static website hosting, with CDN
  and a custom frontend domain.
- Backend: Node/Express API on one Flexus L instance, exposed through Nginx and
  a separate API domain.
- Database: Huawei Cloud RDS for PostgreSQL, private network only.
- Storage: OBS buckets for public Gallery assets and private experiment images.
- AI: existing Huawei MaaS integration from the backend.

## Current State

The repository is still in migration. The local Gallery archive remains under
`data/gallery/` as reference data, but the repo-local Codex skill and local
Markdown parser/import scripts have been removed. Supabase-era runtime code
remains under `web/` until the RDS/OBS migration tasks are implemented.

## Verification

Before treating a Huawei Cloud deployment as ready, run:

```bash
npm -C web test
npm -C web run build
npm -C web run lint
```

Then use Browser Use to verify the real user path: Gallery load, source image
upload, recommendation, prompt rewrite, result upload, and experiment save.
