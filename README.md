# ImageOdyssey

ImageOdyssey is the Prompt Gallery Web App project. It provides a local visual
studio for browsing GPT Image 2 prompt cases, uploading a source image, asking
Huawei MaaS for recommendations and prompt rewrites, and saving experiment
records through the local API.

The repository is being prepared for Huawei Cloud deployment:

- React frontend: `web/`
- Backend API: `web/server/`
- Migration-period Gallery archive data: `data/gallery/`
- Deployment and handoff documents: `docs/`

Codex plugin catalog maintenance has moved to:

```text
/Users/godw/code/codex-plugins
```

## Project Layout

```text
ImageOdyssey/
├── .gitignore
├── AGENTS.md
├── README.md
├── data/
│   └── gallery/
│   │   ├── index.md
│   │   ├── gallery1.md
│   │   ├── ...
│   │   ├── gallery13.md
│   │   └── assets/
│   │       └── case<n>.jpg
├── docs/
│   ├── deployment/
│   ├── handoff/
│   └── superpowers/
├── run-web-dev.cmd
└── web/
    ├── .env.example
    ├── eslint.config.js
    ├── index.html
    ├── package-lock.json
    ├── package.json
    ├── scripts/
    ├── server/
    ├── src/
    ├── supabase/
    ├── tsconfig.json
    └── vite.config.ts
```

## Local Development

Install dependencies:

```bash
npm -C web install
```

Run checks:

```bash
npm -C web test
npm -C web run build
npm -C web run lint
```

Start the frontend only:

```bash
npm -C web run dev
```

Start the local API and frontend together:

```bash
npm -C web run dev:all
```

On Windows, use:

```cmd
run-web-dev.cmd
```

## Migration-Period Gallery Archive

The local Gallery source corpus has moved out of the project root:

- `data/gallery/index.md`
- `data/gallery/gallery*.md`
- `data/gallery/assets/case*.jpg`

This archive is retained only as migration reference material until the Huawei
Cloud RDS/OBS migration is complete and verified. The repo-local Codex skill
and local Markdown parser/import scripts have been removed; new runtime work
should use backend APIs backed by RDS PostgreSQL and OBS.

## Current Runtime Notes

The current migration branch still contains Supabase-era code under `web/`.
The approved target architecture is documented in:

```text
docs/superpowers/specs/2026-05-07-huawei-cloud-deployment-design.md
docs/superpowers/plans/2026-05-07-huawei-cloud-migration.md
```

Target deployment:

- OBS/CDN hosts the React frontend.
- Flexus L runs the Node API.
- RDS PostgreSQL is private to the application network.
- OBS stores public Gallery assets and private experiment images.
- Huawei MaaS remains the AI service.

## Safety Boundaries

- Do not expose backend secrets in frontend files.
- Do not add GPT Image 2 API integration unless explicitly requested.
- Do not restore the removed learning project, plugin catalog business line,
  repo-local Codex skill, or local Gallery parser/import scripts.
- Keep `data/gallery/` as archive data until RDS/OBS migration and browser
  smoke tests verify that it is no longer needed.
