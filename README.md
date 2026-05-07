# ImageOdyssey

ImageOdyssey is the Prompt Gallery Web App project. It provides a simplified
browser for GPT Image 2 prompt cases and a Huawei MaaS text rewrite flow that
adapts a selected prompt for use with a person photo uploaded later in ChatGPT.

The repository is being prepared for Huawei Cloud deployment:

- React frontend: `apps/web/`
- Backend API: `apps/api/`
- Shared API contracts: `packages/shared/`
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
├── package.json
├── packages/
│   └── shared/
├── apps/
│   ├── api/
│   └── web/
└── run-web-dev.cmd
```

## Local Development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm test
npm run build
npm run lint
```

Start the API and frontend together:

```bash
npm run dev:all
```

The frontend lives in `apps/web`.
The backend API lives in `apps/api`.
The migration-period Gallery archive lives in `data/gallery`.
Runtime Gallery reads must go through the backend API, not directly from Markdown.

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
and local Markdown parser/import scripts have been removed. Runtime Gallery
reads now go through backend APIs backed by structured JSON, with RDS/OBS as
the later cloud storage target.

## Current Runtime Notes

The current runtime is front-end/back-end separated:

- `apps/web` serves the React/Vite/Tailwind UI.
- `apps/api` serves Hono API routes for Gallery data, Gallery assets, and MaaS text rewriting.
- `packages/shared` contains Zod schemas and TypeScript API contracts.
- `data/gallery/*.md` remains archive-only. Runtime code reads `data/gallery/*.json`.

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
