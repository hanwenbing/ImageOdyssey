# Simplify Gallery Cloud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert ImageOdyssey into a cloud-ready Prompt Gallery + Huawei MaaS text rewrite app with separated frontend/backend workspaces.

**Architecture:** Move the single `web/` package into npm workspaces with `apps/web`, `apps/api`, and `packages/shared`. The frontend loads Gallery data only through the API; the API uses Hono, structured Gallery data, and Huawei MaaS text completions. Runtime code must not parse `data/gallery/*.md`.

**Tech Stack:** npm workspaces, React 19, Vite, Tailwind CSS, Hono, TypeScript, Zod, Vitest, Testing Library, Huawei MaaS V2 Chat Completions, Build Web Apps frontend validation.

---

## Current Baseline

Latest upstream baseline is `1526f9a merge: simplify gallery rewrite handoff`.

Important current facts:

- Runtime app still lives in `web/`.
- Backend still lives in `web/server/`.
- Gallery Markdown archive lives in `data/gallery/`.
- Gallery images live in `data/gallery/assets/`.
- Local Gallery parser/import scripts have been removed.
- Current handoff says the short PR should not do RDS/OBS migration, but the approved design for this plan intentionally goes further: monorepo separation, Hono API, backend Gallery API, and structured file data.

## Target File Map

Create:

- `package.json` - root workspace scripts.
- `packages/shared/package.json` - shared package manifest.
- `packages/shared/tsconfig.json` - shared TypeScript config.
- `packages/shared/src/gallery.ts` - category and prompt-case schemas/types.
- `packages/shared/src/rewrite.ts` - rewrite request/response schemas/types.
- `packages/shared/src/index.ts` - shared exports.
- `apps/api/package.json` - API package manifest.
- `apps/api/tsconfig.json` - API TypeScript config.
- `apps/api/src/config/env.ts` - server env loading and validation.
- `apps/api/src/repositories/galleryRepository.ts` - repository interface.
- `apps/api/src/repositories/fileGalleryRepository.ts` - structured JSON repository.
- `apps/api/src/services/huaweiMaasClient.ts` - MaaS HTTP client.
- `apps/api/src/services/promptRewriteService.ts` - rewrite prompt builder and response parsing.
- `apps/api/src/routes/gallery.ts` - Gallery API routes.
- `apps/api/src/routes/rewrite.ts` - rewrite API route.
- `apps/api/src/app.ts` - Hono app composition.
- `apps/api/src/index.ts` - Node server entry.
- `apps/api/src/__tests__/galleryRepository.test.ts` - data repository tests.
- `apps/api/src/__tests__/galleryRoutes.test.ts` - Gallery route tests.
- `apps/api/src/__tests__/rewriteRoute.test.ts` - rewrite route tests.
- `apps/api/src/__tests__/promptRewriteService.test.ts` - prompt construction tests.
- `apps/api/src/__tests__/env.test.ts` - env tests.
- `apps/web/package.json` - frontend package manifest.
- `apps/web/tsconfig.json` - frontend TypeScript config.
- `apps/web/vite.config.ts` - Vite config with API proxy.
- `apps/web/index.html` - frontend HTML entry.
- `apps/web/src/...` - moved and simplified frontend files.
- `data/gallery/categories.json` - structured category data.
- `data/gallery/prompt-cases.json` - structured prompt-case data.
- `data/gallery/featured-case-numbers.json` - stable featured case numbers.

Remove:

- `web/` after content is migrated.
- Runtime Supabase dependencies and source files.
- Upload/recommend/experiment/workflow event code.
- `ImageUploadPanel.tsx`.
- Source image cache code.

Keep:

- `data/gallery/index.md`, `data/gallery/gallery*.md`, and `data/gallery/assets/case*.jpg` as migration archive data.

---

### Task 1: Create the Workspace Skeleton

**Files:**
- Create: `package.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Modify: `run-web-dev.cmd`
- Keep for now: `web/package.json`

- [ ] **Step 1: Create root workspace manifest**

Create `package.json`:

```json
{
  "name": "imageodyssey",
  "private": true,
  "type": "module",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev:web": "npm -w apps/web run dev",
    "dev:api": "npm -w apps/api run dev",
    "dev:all": "concurrently \"npm run dev:api\" \"npm run dev:web\"",
    "test": "npm -ws --if-present run test",
    "build": "npm -ws --if-present run build",
    "lint": "npm -ws --if-present run lint"
  },
  "devDependencies": {
    "concurrently": "^9.2.1",
    "typescript": "~6.0.2"
  }
}
```

- [ ] **Step 2: Create shared package manifest**

Create `packages/shared/package.json`:

```json
{
  "name": "@imageodyssey/shared",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./gallery": "./src/gallery.ts",
    "./rewrite": "./src/rewrite.ts"
  },
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "zod": "^4.1.13"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "eslint": "^10.2.1",
    "typescript-eslint": "^8.58.2",
    "vitest": "^4.0.15"
  }
}
```

- [ ] **Step 3: Create shared TypeScript config**

Create `packages/shared/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create API manifest**

Create `apps/api/package.json`:

```json
{
  "name": "imageodyssey-api",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "@hono/node-server": "^1.19.7",
    "@imageodyssey/shared": "0.1.0",
    "dotenv": "^17.2.3",
    "hono": "^4.10.7",
    "zod": "^4.1.13"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.12.2",
    "eslint": "^10.2.1",
    "tsx": "^4.21.0",
    "typescript": "~6.0.2",
    "typescript-eslint": "^8.58.2",
    "vitest": "^4.0.15"
  }
}
```

- [ ] **Step 5: Create API TypeScript config**

Create `apps/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create web manifest**

Create `apps/web/package.json`:

```json
{
  "name": "imageodyssey-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint ."
  },
  "dependencies": {
    "@imageodyssey/shared": "0.1.0",
    "@tailwindcss/vite": "^4.2.4",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "tailwindcss": "^4.2.4"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "eslint": "^10.2.1",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.5.0",
    "jsdom": "^27.2.0",
    "typescript": "~6.0.2",
    "typescript-eslint": "^8.58.2",
    "vitest": "^4.0.15"
  }
}
```

- [ ] **Step 7: Create web TypeScript config**

Create `apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts", "eslint.config.js"]
}
```

- [ ] **Step 8: Create web Vite config**

Create `apps/web/vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787"
    },
    port: 5173,
    strictPort: false
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"]
  }
});
```

- [ ] **Step 9: Move frontend HTML**

Move `web/index.html` to `apps/web/index.html`. Ensure its script tag still points to `/src/main.tsx`.

- [ ] **Step 10: Update Windows launcher**

Replace `run-web-dev.cmd` command invocation with:

```cmd
call "%NPM_CMD%" run dev:all
```

- [ ] **Step 11: Install workspace dependencies**

Run:

```bash
npm install
```

Expected: root `package-lock.json` is created or updated and workspace packages are linked.

- [ ] **Step 12: Commit workspace skeleton**

Run:

```bash
git add package.json package-lock.json apps packages run-web-dev.cmd
git commit -m "chore: create app workspaces"
```

---

### Task 2: Define Shared API Contracts

**Files:**
- Create: `packages/shared/src/gallery.ts`
- Create: `packages/shared/src/rewrite.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/shared.test.ts`

- [ ] **Step 1: Write shared contract tests**

Create `packages/shared/src/shared.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  categoriesResponseSchema,
  promptCasesResponseSchema,
  promptCaseSchema
} from "./gallery";
import { rewriteRequestSchema, rewriteResponseSchema } from "./rewrite";

describe("shared API schemas", () => {
  it("validates gallery responses", () => {
    const promptCase = {
      id: "case-1",
      case_number: 1,
      title: "Case 1",
      category_slug: "portrait",
      category_name: "人物写真",
      prompt_text: "中文提示词",
      image_path: "/gallery/assets/case1.jpg",
      summary: "摘要",
      tags: ["portrait"]
    };

    expect(promptCaseSchema.parse(promptCase)).toEqual(promptCase);
    expect(
      categoriesResponseSchema.parse({
        categories: [
          { slug: "featured", name: "精选", sort_order: 0 },
          { slug: "all", name: "全部", sort_order: 1 }
        ]
      })
    ).toEqual({
      categories: [
        { slug: "featured", name: "精选", sort_order: 0 },
        { slug: "all", name: "全部", sort_order: 1 }
      ]
    });
    expect(promptCasesResponseSchema.parse({ cases: [promptCase] })).toEqual({
      cases: [promptCase]
    });
  });

  it("validates rewrite request and response bodies", () => {
    expect(
      rewriteRequestSchema.parse({
        case_number: 7,
        original_prompt_text: "原始提示词"
      })
    ).toEqual({
      case_number: 7,
      original_prompt_text: "原始提示词"
    });

    expect(
      rewriteResponseSchema.parse({
        rewritten_prompt_text: "以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变。"
      })
    ).toEqual({
      rewritten_prompt_text: "以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变。"
    });
  });
});
```

- [ ] **Step 2: Run shared tests and verify failure**

Run:

```bash
npm -w packages/shared test -- src/shared.test.ts
```

Expected: FAIL because `gallery.ts` and `rewrite.ts` do not exist.

- [ ] **Step 3: Implement gallery schemas**

Create `packages/shared/src/gallery.ts`:

```ts
import { z } from "zod";

export const categorySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  sort_order: z.number().int()
});

export const promptCaseSchema = z.object({
  id: z.string().min(1),
  case_number: z.number().int().positive(),
  title: z.string().min(1),
  category_slug: z.string().min(1),
  category_name: z.string().min(1),
  prompt_text: z.string().min(1),
  image_path: z.string().min(1),
  summary: z.string(),
  tags: z.array(z.string())
});

export const categoriesResponseSchema = z.object({
  categories: z.array(categorySchema)
});

export const promptCasesResponseSchema = z.object({
  cases: z.array(promptCaseSchema)
});

export const promptCaseScopeSchema = z.enum(["featured", "all"]);

export type Category = z.infer<typeof categorySchema>;
export type PromptCase = z.infer<typeof promptCaseSchema>;
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>;
export type PromptCasesResponse = z.infer<typeof promptCasesResponseSchema>;
export type PromptCaseScope = z.infer<typeof promptCaseScopeSchema>;
```

- [ ] **Step 4: Implement rewrite schemas**

Create `packages/shared/src/rewrite.ts`:

```ts
import { z } from "zod";

export const rewriteRequestSchema = z.object({
  case_number: z.number().int().positive(),
  original_prompt_text: z.string().min(1)
});

export const rewriteResponseSchema = z.object({
  rewritten_prompt_text: z.string().min(1)
});

export type RewriteRequest = z.infer<typeof rewriteRequestSchema>;
export type RewriteResponse = z.infer<typeof rewriteResponseSchema>;
```

- [ ] **Step 5: Implement shared exports**

Create `packages/shared/src/index.ts`:

```ts
export * from "./gallery";
export * from "./rewrite";
```

- [ ] **Step 6: Run shared tests**

Run:

```bash
npm -w packages/shared test -- src/shared.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit shared contracts**

Run:

```bash
git add packages/shared
git commit -m "feat: add shared api contracts"
```

---

### Task 3: Convert Gallery Archive to Structured JSON

**Files:**
- Create: `data/gallery/categories.json`
- Create: `data/gallery/prompt-cases.json`
- Create: `data/gallery/featured-case-numbers.json`
- Temporary untracked helper: `tmp/convert-gallery-archive.mjs`

- [ ] **Step 1: Create temporary conversion helper**

Create untracked `tmp/convert-gallery-archive.mjs`:

```js
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const repoRoot = process.cwd();
const galleryDir = resolve(repoRoot, "data/gallery");
const indexPath = join(galleryDir, "index.md");
const assetsDir = join(galleryDir, "assets");

function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function parseIndex(markdown) {
  const categories = [];
  const regex = /-\s*\[([^\]]+)\]\((gallery\d+\.md)\)/g;
  let match;
  let index = 0;
  while ((match = regex.exec(markdown)) !== null) {
    index += 1;
    categories.push({
      slug: slugify(match[1]),
      name: match[1],
      sort_order: index + 1,
      source_gallery_file: match[2]
    });
  }
  return categories;
}

function excerpt(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 96);
}

function parseGallery(fileName, category) {
  const markdown = readFileSync(join(galleryDir, fileName), "utf8");
  const blocks = markdown.split(/\n(?=##\s+)/g).filter((block) => block.startsWith("## "));
  return blocks.map((block) => {
    const heading = block.match(/^##\s+(\d+)[\.、]?\s*(.+)$/m);
    const image = block.match(/!\[[^\]]*]\((assets\/case(\d+)\.jpg)\)/);
    const prompt = block.match(/```(?:text|prompt)?\s*\n([\s\S]*?)\n```/);
    if (!heading || !image || !prompt) {
      throw new Error(`Unable to parse case block in ${fileName}: ${block.slice(0, 120)}`);
    }
    const caseNumber = Number(heading[1]);
    const imageCaseNumber = Number(image[2]);
    if (caseNumber !== imageCaseNumber) {
      throw new Error(`Case number mismatch in ${fileName}: heading ${caseNumber}, image ${imageCaseNumber}`);
    }
    const imagePath = `/gallery/assets/case${caseNumber}.jpg`;
    const localAssetPath = join(assetsDir, `case${caseNumber}.jpg`);
    if (!existsSync(localAssetPath)) {
      throw new Error(`Missing image asset for case ${caseNumber}: ${localAssetPath}`);
    }
    const promptText = prompt[1].trim();
    return {
      id: `case-${caseNumber}`,
      case_number: caseNumber,
      title: heading[2].trim(),
      category_slug: category.slug,
      category_name: category.name,
      prompt_text: promptText,
      image_path: imagePath,
      summary: excerpt(promptText),
      tags: []
    };
  });
}

const categoriesFromIndex = parseIndex(readFileSync(indexPath, "utf8"));
const categories = [
  { slug: "featured", name: "精选", sort_order: 0 },
  { slug: "all", name: "全部", sort_order: 1 },
  ...categoriesFromIndex
];

const cases = categoriesFromIndex
  .flatMap((category) => parseGallery(category.source_gallery_file, category))
  .sort((left, right) => left.case_number - right.case_number);

const featuredCaseNumbers = cases
  .filter((promptCase, index) => index % Math.max(1, Math.floor(cases.length / 12)) === 0)
  .slice(0, 12)
  .map((promptCase) => promptCase.case_number);

writeFileSync(
  join(galleryDir, "categories.json"),
  JSON.stringify(categories.map(({ source_gallery_file, ...category }) => category), null, 2) + "\n",
  "utf8"
);
writeFileSync(join(galleryDir, "prompt-cases.json"), JSON.stringify(cases, null, 2) + "\n", "utf8");
writeFileSync(
  join(galleryDir, "featured-case-numbers.json"),
  JSON.stringify(featuredCaseNumbers, null, 2) + "\n",
  "utf8"
);

console.log(
  JSON.stringify(
    {
      categories: categories.length,
      prompt_cases: cases.length,
      featured_case_numbers: featuredCaseNumbers
    },
    null,
    2
  )
);
```

- [ ] **Step 2: Run conversion helper**

Run:

```bash
node tmp/convert-gallery-archive.mjs
```

Expected: prints JSON with `featured_case_numbers` length 12 and `prompt_cases` greater than 300.

- [ ] **Step 3: Remove temporary helper**

Run:

```bash
del tmp\convert-gallery-archive.mjs
```

Expected: helper is removed and not committed.

- [ ] **Step 4: Verify structured JSON parses**

Run:

```bash
node -e "const fs=require('fs'); for (const f of ['categories.json','prompt-cases.json','featured-case-numbers.json']) { const p='data/gallery/'+f; JSON.parse(fs.readFileSync(p,'utf8')); console.log(p,'ok'); }"
```

Expected:

```text
data/gallery/categories.json ok
data/gallery/prompt-cases.json ok
data/gallery/featured-case-numbers.json ok
```

- [ ] **Step 5: Commit structured Gallery data**

Run:

```bash
git add data/gallery/categories.json data/gallery/prompt-cases.json data/gallery/featured-case-numbers.json
git commit -m "data: add structured gallery archive"
```

---

### Task 4: Implement the Hono API Shell

**Files:**
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/index.ts`
- Test: `apps/api/src/__tests__/env.test.ts`

- [ ] **Step 1: Write env tests**

Create `apps/api/src/__tests__/env.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { getHuaweiMaasConfig } from "../config/env";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("API env config", () => {
  it("requires every Huawei MaaS text config value", () => {
    delete process.env.HUAWEI_MAAS_API_KEY;
    process.env.HUAWEI_MAAS_CHAT_COMPLETIONS_URL = "https://api.modelarts-maas.com/v2/chat/completions";
    process.env.HUAWEI_MAAS_MODEL = "deepseek-v4-flash";

    expect(() => getHuaweiMaasConfig()).toThrow(/HUAWEI_MAAS_API_KEY/);
  });

  it("returns trimmed Huawei MaaS config", () => {
    process.env.HUAWEI_MAAS_API_KEY = " key ";
    process.env.HUAWEI_MAAS_CHAT_COMPLETIONS_URL = " https://api.modelarts-maas.com/v2/chat/completions ";
    process.env.HUAWEI_MAAS_MODEL = " deepseek-v4-flash ";

    expect(getHuaweiMaasConfig()).toEqual({
      apiKey: "key",
      chatCompletionsUrl: "https://api.modelarts-maas.com/v2/chat/completions",
      model: "deepseek-v4-flash"
    });
  });
});
```

- [ ] **Step 2: Run env test and verify failure**

Run:

```bash
npm -w apps/api test -- src/__tests__/env.test.ts
```

Expected: FAIL because `config/env.ts` does not exist.

- [ ] **Step 3: Implement env config**

Create `apps/api/src/config/env.ts`:

```ts
import { config } from "dotenv";
import { resolve } from "node:path";

export type HuaweiMaasConfig = {
  apiKey: string;
  chatCompletionsUrl: string;
  model: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} for Huawei MaaS rewrite API`);
  }
  return value;
}

export function loadApiEnv(baseDir = process.cwd()): void {
  config({ path: resolve(baseDir, ".env.local") });
  config({ path: resolve(baseDir, ".env") });
}

export function getHuaweiMaasConfig(): HuaweiMaasConfig {
  return {
    apiKey: requireEnv("HUAWEI_MAAS_API_KEY"),
    chatCompletionsUrl: requireEnv("HUAWEI_MAAS_CHAT_COMPLETIONS_URL"),
    model: requireEnv("HUAWEI_MAAS_MODEL")
  };
}

export function getPort(): number {
  const value = process.env.PORT?.trim() ?? "8787";
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, received: ${value}`);
  }
  return port;
}
```

- [ ] **Step 4: Implement Hono app shell**

Create `apps/api/src/app.ts`:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";

export function createApp() {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: ["http://127.0.0.1:5173", "http://localhost:5173"]
    })
  );

  app.get("/api/health", (context) => context.json({ ok: true }));

  app.notFound((context) => context.json({ error: "Not found" }, 404));
  app.onError((error, context) => {
    return context.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  });

  return app;
}
```

- [ ] **Step 5: Implement Node server entry**

Create `apps/api/src/index.ts`:

```ts
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { getPort, loadApiEnv } from "./config/env";

loadApiEnv();

const port = getPort();

serve({
  fetch: createApp().fetch,
  hostname: "127.0.0.1",
  port
});

console.log(`ImageOdyssey API listening on http://127.0.0.1:${port}`);
```

- [ ] **Step 6: Run env tests**

Run:

```bash
npm -w apps/api test -- src/__tests__/env.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit API shell**

Run:

```bash
git add apps/api
git commit -m "feat: add hono api shell"
```

---

### Task 5: Implement Gallery Repository and Routes

**Files:**
- Create: `apps/api/src/repositories/galleryRepository.ts`
- Create: `apps/api/src/repositories/fileGalleryRepository.ts`
- Create: `apps/api/src/routes/gallery.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/__tests__/galleryRepository.test.ts`
- Test: `apps/api/src/__tests__/galleryRoutes.test.ts`

- [ ] **Step 1: Write repository tests**

Create `apps/api/src/__tests__/galleryRepository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createFileGalleryRepository } from "../repositories/fileGalleryRepository";

describe("file gallery repository", () => {
  it("loads categories, featured cases, and all cases from structured JSON", async () => {
    const repository = createFileGalleryRepository();

    const categories = await repository.listCategories();
    const featured = await repository.listPromptCases("featured");
    const all = await repository.listPromptCases("all");

    expect(categories[0]).toMatchObject({ slug: "featured", name: "精选" });
    expect(categories[1]).toMatchObject({ slug: "all", name: "全部" });
    expect(featured).toHaveLength(12);
    expect(all.length).toBeGreaterThan(featured.length);
    expect(featured[0]).toMatchObject({
      case_number: expect.any(Number),
      prompt_text: expect.any(String),
      image_path: expect.stringMatching(/^\/gallery\/assets\/case\d+\.jpg$/)
    });
  });
});
```

- [ ] **Step 2: Write route tests**

Create `apps/api/src/__tests__/galleryRoutes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApp } from "../app";

describe("gallery routes", () => {
  it("returns categories and scoped prompt cases", async () => {
    const app = createApp();

    const categoriesResponse = await app.request("/api/categories");
    const featuredResponse = await app.request("/api/prompt-cases?scope=featured");
    const allResponse = await app.request("/api/prompt-cases?scope=all");

    expect(categoriesResponse.status).toBe(200);
    expect(featuredResponse.status).toBe(200);
    expect(allResponse.status).toBe(200);

    const categoriesBody = await categoriesResponse.json();
    const featuredBody = await featuredResponse.json();
    const allBody = await allResponse.json();

    expect(categoriesBody.categories[0]).toMatchObject({ slug: "featured", name: "精选" });
    expect(featuredBody.cases).toHaveLength(12);
    expect(allBody.cases.length).toBeGreaterThan(featuredBody.cases.length);
  });

  it("rejects unsupported prompt case scopes", async () => {
    const app = createApp();
    const response = await app.request("/api/prompt-cases?scope=random");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.stringContaining("Invalid") });
  });
});
```

- [ ] **Step 3: Run gallery tests and verify failure**

Run:

```bash
npm -w apps/api test -- src/__tests__/galleryRepository.test.ts src/__tests__/galleryRoutes.test.ts
```

Expected: FAIL because repository and routes do not exist.

- [ ] **Step 4: Implement repository interface**

Create `apps/api/src/repositories/galleryRepository.ts`:

```ts
import type { Category, PromptCase, PromptCaseScope } from "@imageodyssey/shared";

export type GalleryRepository = {
  listCategories: () => Promise<Category[]>;
  listPromptCases: (scope: PromptCaseScope) => Promise<PromptCase[]>;
};
```

- [ ] **Step 5: Implement file repository**

Create `apps/api/src/repositories/fileGalleryRepository.ts`:

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  categorySchema,
  promptCaseSchema,
  type Category,
  type PromptCase,
  type PromptCaseScope
} from "@imageodyssey/shared";
import type { GalleryRepository } from "./galleryRepository";

const repoRoot = resolve(process.cwd(), "..", "..");
const dataDir = resolve(repoRoot, "data", "gallery");

async function readJson<T>(fileName: string): Promise<T> {
  const text = await readFile(resolve(dataDir, fileName), "utf8");
  return JSON.parse(text) as T;
}

export function createFileGalleryRepository(): GalleryRepository {
  return {
    async listCategories(): Promise<Category[]> {
      const categories = await readJson<unknown[]>("categories.json");
      return categories.map((category) => categorySchema.parse(category));
    },

    async listPromptCases(scope: PromptCaseScope): Promise<PromptCase[]> {
      const cases = (await readJson<unknown[]>("prompt-cases.json")).map((promptCase) =>
        promptCaseSchema.parse(promptCase)
      );

      if (scope === "all") {
        return cases;
      }

      const featuredCaseNumbers = new Set(
        await readJson<number[]>("featured-case-numbers.json")
      );
      return cases.filter((promptCase) => featuredCaseNumbers.has(promptCase.case_number));
    }
  };
}
```

- [ ] **Step 6: Implement Gallery routes**

Create `apps/api/src/routes/gallery.ts`:

```ts
import { Hono } from "hono";
import { promptCaseScopeSchema } from "@imageodyssey/shared";
import type { GalleryRepository } from "../repositories/galleryRepository";

export function createGalleryRoutes(repository: GalleryRepository) {
  const routes = new Hono();

  routes.get("/categories", async (context) => {
    const categories = await repository.listCategories();
    return context.json({ categories });
  });

  routes.get("/prompt-cases", async (context) => {
    const parsedScope = promptCaseScopeSchema.safeParse(
      context.req.query("scope") ?? "featured"
    );
    if (!parsedScope.success) {
      return context.json({ error: "Invalid prompt case scope" }, 400);
    }

    const cases = await repository.listPromptCases(parsedScope.data);
    return context.json({ cases });
  });

  return routes;
}
```

- [ ] **Step 7: Mount Gallery routes**

Modify `apps/api/src/app.ts`:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createFileGalleryRepository } from "./repositories/fileGalleryRepository";
import { createGalleryRoutes } from "./routes/gallery";

export function createApp() {
  const app = new Hono();
  const galleryRepository = createFileGalleryRepository();

  app.use(
    "*",
    cors({
      origin: ["http://127.0.0.1:5173", "http://localhost:5173"]
    })
  );

  app.get("/api/health", (context) => context.json({ ok: true }));
  app.route("/api", createGalleryRoutes(galleryRepository));

  app.notFound((context) => context.json({ error: "Not found" }, 404));
  app.onError((error, context) => {
    return context.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  });

  return app;
}
```

- [ ] **Step 8: Run Gallery API tests**

Run:

```bash
npm -w apps/api test -- src/__tests__/galleryRepository.test.ts src/__tests__/galleryRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Gallery API**

Run:

```bash
git add apps/api data/gallery
git commit -m "feat: serve gallery from api"
```

---

### Task 6: Implement Huawei MaaS Text Rewrite API

**Files:**
- Create: `apps/api/src/services/huaweiMaasClient.ts`
- Create: `apps/api/src/services/promptRewriteService.ts`
- Create: `apps/api/src/routes/rewrite.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/__tests__/promptRewriteService.test.ts`
- Test: `apps/api/src/__tests__/rewriteRoute.test.ts`

- [ ] **Step 1: Write prompt rewrite service tests**

Create `apps/api/src/__tests__/promptRewriteService.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { rewritePrompt } from "../services/promptRewriteService";

describe("prompt rewrite service", () => {
  it("builds a person-reference rewrite prompt and calls text MaaS once", async () => {
    const complete = vi.fn(async () => ({
      content:
        '{"rewritten_prompt_text":"以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变，穿着复古红裙，站在夜晚街头霓虹灯下，电影感光线，浅景深。"}'
    }));

    const result = await rewritePrompt(
      {
        case_number: 1,
        original_prompt_text:
          "生成一个20岁的女性，穿着复古红裙，站在夜晚街头霓虹灯下，电影感光线，浅景深。"
      },
      { complete }
    );

    expect(result.rewritten_prompt_text).toContain("以我上传的图片中的人物为主体");
    expect(complete).toHaveBeenCalledTimes(1);
    const request = complete.mock.calls[0][0];
    expect(JSON.stringify(request)).not.toContain("image_url");
    expect(JSON.stringify(request)).toContain("删除或弱化年龄、性别、种族、国籍、脸型、发型、五官、明确样貌、明确神态");
  });
});
```

- [ ] **Step 2: Write rewrite route tests**

Create `apps/api/src/__tests__/rewriteRoute.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app";

describe("rewrite route", () => {
  it("accepts case number and original prompt text only", async () => {
    const app = createApp({
      rewritePrompt: vi.fn(async () => ({
        rewritten_prompt_text:
          "以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变，电影感光线。"
      }))
    });

    const response = await app.request("/api/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        case_number: 7,
        original_prompt_text: "电影感光线。"
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      rewritten_prompt_text:
        "以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变，电影感光线。"
    });
  });

  it("rejects source image storage paths", async () => {
    const app = createApp();
    const response = await app.request("/api/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_image_storage_path: "source/path.jpg",
        case_number: 7,
        original_prompt_text: "电影感光线。"
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("Unrecognized key")
    });
  });
});
```

- [ ] **Step 3: Run rewrite tests and verify failure**

Run:

```bash
npm -w apps/api test -- src/__tests__/promptRewriteService.test.ts src/__tests__/rewriteRoute.test.ts
```

Expected: FAIL because rewrite service and route do not exist.

- [ ] **Step 4: Implement Huawei MaaS client**

Create `apps/api/src/services/huaweiMaasClient.ts`:

```ts
import type { HuaweiMaasConfig } from "../config/env";

export type ChatCompletionRequest = {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
};

export type HuaweiMaasClient = {
  complete: (request: ChatCompletionRequest) => Promise<{ content: string }>;
};

export function createHuaweiMaasClient(
  config: HuaweiMaasConfig,
  fetchImpl: typeof fetch = fetch
): HuaweiMaasClient {
  return {
    async complete(request) {
      const response = await fetchImpl(config.chatCompletionsUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: config.model,
          messages: request.messages
        })
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Huawei MaaS request failed with status ${response.status}: ${text.slice(0, 300)}`);
      }

      const body = JSON.parse(text) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new Error("Huawei MaaS returned empty message content");
      }

      return { content: content.trim() };
    }
  };
}
```

- [ ] **Step 5: Implement prompt rewrite service**

Create `apps/api/src/services/promptRewriteService.ts`:

```ts
import { rewriteResponseSchema, type RewriteRequest, type RewriteResponse } from "@imageodyssey/shared";
import type { HuaweiMaasClient } from "./huaweiMaasClient";

function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("rewrite did not return a JSON object");
  }
  return text.slice(start, end + 1);
}

function buildRewriteInstruction(originalPromptText: string): string {
  return [
    "你是中文 GPT Image 2 提示词改写助手。",
    "用户稍后会在 ChatGPT 网页上传一张人物照片。",
    "请改写原 Prompt，让生成结果以用户上传图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变。",
    "删除或弱化年龄、性别、种族、国籍、脸型、发型、五官、明确样貌、明确神态等可能与上传人物冲突的人物固有设定。",
    "尽量保留原 Prompt 中不冲突的场景、风格、构图、光线、色彩、服装、道具、画面文字、视觉语言、镜头和质感描述。",
    "输出必须是一段通顺自然的中文 Prompt。",
    "只返回一个 JSON 对象，不要 Markdown、代码块、解释或字段清单。",
    'JSON schema: {"rewritten_prompt_text":string}',
    "",
    "原 Prompt:",
    originalPromptText
  ].join("\n");
}

export async function rewritePrompt(
  request: RewriteRequest,
  client: HuaweiMaasClient
): Promise<RewriteResponse> {
  const completion = await client.complete({
    model: "configured-by-client",
    messages: [
      {
        role: "system",
        content: "你是严格返回 JSON 的中文提示词改写服务。"
      },
      {
        role: "user",
        content: buildRewriteInstruction(request.original_prompt_text)
      }
    ]
  });

  const parsed = JSON.parse(extractFirstJsonObject(completion.content));
  return rewriteResponseSchema.parse(parsed);
}
```

- [ ] **Step 6: Implement rewrite route**

Create `apps/api/src/routes/rewrite.ts`:

```ts
import { Hono } from "hono";
import { rewriteRequestSchema, type RewriteRequest, type RewriteResponse } from "@imageodyssey/shared";

export type RewriteRouteDependencies = {
  rewritePrompt: (request: RewriteRequest) => Promise<RewriteResponse>;
};

export function createRewriteRoutes(dependencies: RewriteRouteDependencies) {
  const routes = new Hono();

  routes.post("/rewrite", async (context) => {
    const body = await context.req.json();
    const parsedRequest = rewriteRequestSchema.strict().safeParse(body);
    if (!parsedRequest.success) {
      return context.json({ error: parsedRequest.error.issues[0]?.message ?? "Invalid rewrite request" }, 400);
    }

    const response = await dependencies.rewritePrompt(parsedRequest.data);
    return context.json(response);
  });

  return routes;
}
```

- [ ] **Step 7: Update app dependency injection and mount rewrite routes**

Replace `apps/api/src/app.ts` with:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getHuaweiMaasConfig } from "./config/env";
import { createFileGalleryRepository } from "./repositories/fileGalleryRepository";
import { createGalleryRoutes } from "./routes/gallery";
import { createRewriteRoutes, type RewriteRouteDependencies } from "./routes/rewrite";
import { createHuaweiMaasClient } from "./services/huaweiMaasClient";
import { rewritePrompt } from "./services/promptRewriteService";

type AppDependencies = Partial<RewriteRouteDependencies>;

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono();
  const galleryRepository = createFileGalleryRepository();
  const maasClient = createHuaweiMaasClient(getHuaweiMaasConfig());

  app.use(
    "*",
    cors({
      origin: ["http://127.0.0.1:5173", "http://localhost:5173"]
    })
  );

  app.get("/api/health", (context) => context.json({ ok: true }));
  app.route("/api", createGalleryRoutes(galleryRepository));
  app.route(
    "/api",
    createRewriteRoutes({
      rewritePrompt:
        dependencies.rewritePrompt ??
        ((request) => rewritePrompt(request, maasClient))
    })
  );

  app.notFound((context) => context.json({ error: "Not found" }, 404));
  app.onError((error, context) => {
    return context.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  });

  return app;
}
```

- [ ] **Step 8: Fix app env creation for tests**

If route tests fail because `createApp()` reads MaaS env immediately, change `apps/api/src/app.ts` to lazily construct the MaaS client only inside the default `rewritePrompt` dependency:

```ts
const defaultRewritePrompt = (request: RewriteRequest) =>
  rewritePrompt(request, createHuaweiMaasClient(getHuaweiMaasConfig()));
```

and use `dependencies.rewritePrompt ?? defaultRewritePrompt`.

- [ ] **Step 9: Run rewrite tests**

Run:

```bash
npm -w apps/api test -- src/__tests__/promptRewriteService.test.ts src/__tests__/rewriteRoute.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit rewrite API**

Run:

```bash
git add apps/api packages/shared
git commit -m "feat: add maas text rewrite api"
```

---

### Task 7: Move and Simplify the Frontend

**Files:**
- Move: `web/src/main.tsx` to `apps/web/src/main.tsx`
- Move: `web/src/index.css` to `apps/web/src/index.css`
- Move: `web/src/test/setup.ts` to `apps/web/src/test/setup.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/lib/apiClient.ts`
- Create: `apps/web/src/types.ts`
- Test: `apps/web/src/__tests__/App.test.tsx`
- Test: `apps/web/src/__tests__/apiClient.test.ts`

- [ ] **Step 1: Move reusable frontend files**

Run:

```bash
mkdir apps\web\src
xcopy web\src\main.tsx apps\web\src\main.tsx*
xcopy web\src\index.css apps\web\src\index.css*
mkdir apps\web\src\test
xcopy web\src\test\setup.ts apps\web\src\test\setup.ts*
mkdir apps\web\src\lib
```

Expected: files exist under `apps/web/src`.

- [ ] **Step 2: Write API client tests**

Create `apps/web/src/__tests__/apiClient.test.tsx`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCategories, requestPromptCases, requestRewrite } from "../lib/apiClient";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiClient", () => {
  it("loads featured cases and sends simplified rewrite payload", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/categories") {
        return new Response(JSON.stringify({ categories: [] }), { status: 200 });
      }
      if (url === "/api/prompt-cases?scope=featured") {
        return new Response(JSON.stringify({ cases: [] }), { status: 200 });
      }
      if (url === "/api/rewrite") {
        expect(JSON.parse(String(init?.body))).toEqual({
          case_number: 1,
          original_prompt_text: "原始提示词"
        });
        return new Response(JSON.stringify({ rewritten_prompt_text: "改写提示词" }), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestCategories()).resolves.toEqual([]);
    await expect(requestPromptCases("featured")).resolves.toEqual([]);
    await expect(
      requestRewrite({ case_number: 1, original_prompt_text: "原始提示词" })
    ).resolves.toEqual({ rewritten_prompt_text: "改写提示词" });
  });
});
```

- [ ] **Step 3: Implement API client**

Create `apps/web/src/lib/apiClient.ts`:

```ts
import {
  categoriesResponseSchema,
  promptCasesResponseSchema,
  rewriteResponseSchema,
  type Category,
  type PromptCase,
  type PromptCaseScope,
  type RewriteRequest,
  type RewriteResponse
} from "@imageodyssey/shared";

async function parseJsonResponse(response: Response): Promise<unknown> {
  const body = await response.json();
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body;
}

export async function requestCategories(): Promise<Category[]> {
  const response = await fetch("/api/categories");
  return categoriesResponseSchema.parse(await parseJsonResponse(response)).categories;
}

export async function requestPromptCases(scope: PromptCaseScope): Promise<PromptCase[]> {
  const response = await fetch(`/api/prompt-cases?scope=${scope}`);
  return promptCasesResponseSchema.parse(await parseJsonResponse(response)).cases;
}

export async function requestRewrite(request: RewriteRequest): Promise<RewriteResponse> {
  const response = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  });
  return rewriteResponseSchema.parse(await parseJsonResponse(response));
}
```

- [ ] **Step 4: Write App behavior tests**

Create `apps/web/src/__tests__/App.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";

function createCase(caseNumber: number, categoryName = "人物写真") {
  return {
    id: `case-${caseNumber}`,
    case_number: caseNumber,
    title: `Case ${caseNumber}`,
    category_slug: categoryName === "人物写真" ? "portrait" : "product",
    category_name: categoryName,
    prompt_text: `原始提示词 ${caseNumber}`,
    image_path: `/gallery/assets/case${caseNumber}.jpg`,
    summary: `摘要 ${caseNumber}`,
    tags: ["tag"]
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("starts with featured cases, preloads all after featured images settle, and rewrites selected prompt", async () => {
    const featuredCases = Array.from({ length: 12 }, (_, index) => createCase(index + 1));
    const allCases = [...featuredCases, createCase(13, "产品海报")];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/categories") {
        return new Response(
          JSON.stringify({
            categories: [
              { slug: "featured", name: "精选", sort_order: 0 },
              { slug: "all", name: "全部", sort_order: 1 },
              { slug: "portrait", name: "人物写真", sort_order: 2 },
              { slug: "product", name: "产品海报", sort_order: 3 }
            ]
          }),
          { status: 200 }
        );
      }
      if (url === "/api/prompt-cases?scope=featured") {
        return new Response(JSON.stringify({ cases: featuredCases }), { status: 200 });
      }
      if (url === "/api/prompt-cases?scope=all") {
        return new Response(JSON.stringify({ cases: allCases }), { status: 200 });
      }
      if (url === "/api/rewrite") {
        expect(JSON.parse(String(init?.body))).toEqual({
          case_number: 1,
          original_prompt_text: "原始提示词 1"
        });
        return new Response(
          JSON.stringify({
            rewritten_prompt_text:
              "以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变，原始提示词 1"
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("button", { name: /Case 1/ })).toBeInTheDocument();
    expect(screen.queryByText("Source Image")).not.toBeInTheDocument();
    expect(screen.queryByText("Result Image")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "推荐" })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Case \d+/ })).toHaveLength(12);

    for (const image of screen.getAllByRole("img")) {
      fireEvent.load(image);
    }

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/prompt-cases?scope=all");
    });

    fireEvent.click(screen.getByRole("button", { name: /Case 1/ }));
    expect(screen.getByText("原始提示词 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "改写为图片主体版本" }));

    expect(
      await screen.findByText(/以我上传的图片中的人物为主体/)
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run frontend tests and verify failure**

Run:

```bash
npm -w apps/web test -- src/__tests__/apiClient.test.tsx src/__tests__/App.test.tsx
```

Expected: FAIL because `App.tsx` and client implementation are incomplete.

- [ ] **Step 6: Implement frontend types**

Create `apps/web/src/types.ts`:

```ts
export type LoadingState = "idle" | "loading" | "error";
```

- [ ] **Step 7: Implement simplified App**

Create `apps/web/src/App.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { Category, PromptCase, RewriteResponse } from "@imageodyssey/shared";
import { requestCategories, requestPromptCases, requestRewrite } from "./lib/apiClient";

const featuredLabel = "精选";
const allLabel = "全部";

function CaseCard({
  promptCase,
  selected,
  lazy,
  onImageSettled,
  onSelect
}: {
  promptCase: PromptCase;
  selected: boolean;
  lazy: boolean;
  onImageSettled?: () => void;
  onSelect: (promptCase: PromptCase) => void;
}) {
  return (
    <button
      aria-label={`Case ${promptCase.case_number} ${promptCase.title}`}
      className={`overflow-hidden rounded-lg border bg-white text-left shadow-sm transition ${
        selected ? "border-teal-600 ring-2 ring-teal-600/20" : "border-stone-200 hover:border-teal-500"
      }`}
      type="button"
      onClick={() => onSelect(promptCase)}
    >
      <div className="aspect-[4/3] bg-stone-200">
        <img
          className="h-full w-full object-cover"
          src={promptCase.image_path}
          alt={`Case ${promptCase.case_number} ${promptCase.title}`}
          loading={lazy ? "lazy" : "eager"}
          onLoad={onImageSettled}
          onError={onImageSettled}
        />
      </div>
      <div className="grid gap-2 p-3">
        <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
          <span>{promptCase.category_name}</span>
          <span>#{promptCase.case_number}</span>
        </div>
        <div className="text-sm font-semibold text-stone-950">{promptCase.title}</div>
        <p className="line-clamp-2 text-xs leading-5 text-stone-600">{promptCase.summary}</p>
      </div>
    </button>
  );
}

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [featuredCases, setFeaturedCases] = useState<PromptCase[]>([]);
  const [allCases, setAllCases] = useState<PromptCase[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(featuredLabel);
  const [selectedCase, setSelectedCase] = useState<PromptCase | null>(null);
  const [rewriteResult, setRewriteResult] = useState<RewriteResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [settledFeaturedImages, setSettledFeaturedImages] = useState(new Set<number>());

  useEffect(() => {
    let cancelled = false;

    async function loadInitialGallery() {
      try {
        const [nextCategories, nextFeaturedCases] = await Promise.all([
          requestCategories(),
          requestPromptCases("featured")
        ]);
        if (!cancelled) {
          setCategories(nextCategories);
          setFeaturedCases(nextFeaturedCases);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void loadInitialGallery();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      featuredCases.length > 0 &&
      settledFeaturedImages.size >= featuredCases.length &&
      allCases === null
    ) {
      void requestPromptCases("all")
        .then(setAllCases)
        .catch((error) => setErrorMessage(error instanceof Error ? error.message : String(error)));
    }
  }, [allCases, featuredCases.length, settledFeaturedImages.size]);

  const casesForCurrentCategory = useMemo(() => {
    const sourceCases = selectedCategory === featuredLabel ? featuredCases : allCases ?? featuredCases;
    if (selectedCategory === featuredLabel || selectedCategory === allLabel) {
      return sourceCases;
    }
    return sourceCases.filter((promptCase) => promptCase.category_name === selectedCategory);
  }, [allCases, featuredCases, selectedCategory]);

  async function handleRewrite() {
    if (!selectedCase || rewriteBusy) {
      return;
    }
    setRewriteBusy(true);
    setErrorMessage(null);
    try {
      setRewriteResult(
        await requestRewrite({
          case_number: selectedCase.case_number,
          original_prompt_text: selectedCase.prompt_text
        })
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRewriteBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 pb-72 text-stone-950">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 px-6 py-4 backdrop-blur">
        <h1 className="text-xl font-bold">ImageOdyssey Prompt Gallery</h1>
        <p className="text-sm text-stone-600">浏览案例，改写成适合搭配 ChatGPT 上传人物照片使用的中文 Prompt</p>
      </header>

      {errorMessage && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <section className="mx-auto grid max-w-7xl gap-4 px-6 py-5">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => (
            <button
              key={category.slug}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${
                selectedCategory === category.name
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-stone-300 bg-white text-stone-700"
              }`}
              type="button"
              onClick={() => setSelectedCategory(category.name)}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {casesForCurrentCategory.map((promptCase) => (
            <CaseCard
              key={promptCase.id}
              promptCase={promptCase}
              selected={selectedCase?.id === promptCase.id}
              lazy={selectedCategory !== featuredLabel}
              onImageSettled={
                selectedCategory === featuredLabel
                  ? () =>
                      setSettledFeaturedImages((prior) => {
                        const next = new Set(prior);
                        next.add(promptCase.case_number);
                        return next;
                      })
                  : undefined
              }
              onSelect={(nextCase) => {
                setSelectedCase(nextCase);
                setRewriteResult(null);
              }}
            />
          ))}
        </div>
      </section>

      <aside className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white px-6 py-4 shadow-2xl">
        <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <section className="rounded-lg border border-stone-200 p-3">
            <h2 className="text-sm font-semibold text-stone-500">原始 Prompt</h2>
            <p className="mt-2 max-h-32 overflow-y-auto text-sm leading-6">
              {selectedCase?.prompt_text ?? "先选择一个案例后，这里会显示原始 Prompt。"}
            </p>
          </section>
          <section className="rounded-lg border border-stone-200 p-3">
            <h2 className="text-sm font-semibold text-stone-500">改写 Prompt</h2>
            <p className="mt-2 max-h-32 overflow-y-auto text-sm leading-6">
              {rewriteResult?.rewritten_prompt_text ?? "点击“改写为图片主体版本”后，这里会显示改写后的 Prompt。"}
            </p>
          </section>
          <div className="grid content-start gap-2">
            <button
              className="rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white disabled:bg-stone-300"
              type="button"
              disabled={!selectedCase || rewriteBusy}
              onClick={handleRewrite}
            >
              {rewriteBusy ? "改写中..." : "改写为图片主体版本"}
            </button>
            <button
              className="rounded-lg border border-stone-300 px-4 py-3 text-sm font-semibold text-stone-700 disabled:text-stone-300"
              type="button"
              disabled={!rewriteResult}
              onClick={() => {
                if (rewriteResult) {
                  void navigator.clipboard.writeText(rewriteResult.rewritten_prompt_text);
                }
              }}
            >
              复制改写 Prompt
            </button>
          </div>
        </div>
      </aside>
    </main>
  );
}
```

- [ ] **Step 8: Run frontend tests**

Run:

```bash
npm -w apps/web test -- src/__tests__/apiClient.test.tsx src/__tests__/App.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit simplified frontend**

Run:

```bash
git add apps/web
git commit -m "feat: simplify gallery frontend"
```

---

### Task 8: Remove Legacy Single-Package Runtime

**Files:**
- Delete: `web/`
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Delete old runtime package**

Run:

```bash
rmdir /s /q web
```

Expected: `web/` is removed.

- [ ] **Step 2: Update `.gitignore`**

Ensure `.gitignore` contains:

```text
node_modules/
apps/*/node_modules/
packages/*/node_modules/
apps/web/dist/
apps/api/dist/
*.local
tmp/
.superpowers/
```

- [ ] **Step 3: Update README**

Replace README runtime notes with:

````markdown
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
````

- [ ] **Step 4: Verify no legacy imports remain**

Run:

```bash
git grep -n "source_image_storage_path\|ImageUploadPanel\|requestRecommendations\|uploadExperimentImage\|saveExperiment\|workflow-events\|Supabase\|@supabase" -- . ":!docs/superpowers/specs/2026-05-07-simplify-gallery-cloud-design.md" ":!docs/handoff"
```

Expected: no matches in runtime code. Matches in historical docs are acceptable.

- [ ] **Step 5: Commit cleanup**

Run:

```bash
git add -A
git commit -m "chore: remove legacy web runtime"
```

---

### Task 9: Full Automated Verification

**Files:**
- Modify only files needed to fix verification failures.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test
```

Expected: PASS for shared, API, and web tests.

- [ ] **Step 2: Run full build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Fix failures one at a time**

For each failure:

1. Read the failing file and error.
2. Make the smallest code change that addresses that error.
3. Rerun only the failing command.
4. Rerun `npm test`, `npm run build`, and `npm run lint` after all targeted fixes pass.

- [ ] **Step 5: Commit verification fixes**

If files changed, run:

```bash
git add -A
git commit -m "fix: pass workspace verification"
```

If no files changed, do not create an empty commit.

---

### Task 10: Build Web Apps Browser QA

**Files:**
- Modify only files needed to fix QA findings.
- Do not commit screenshots or temporary QA reports unless the user explicitly asks for committed artifacts.

- [ ] **Step 1: Start the app**

Run:

```bash
npm run dev:all
```

Expected:

- API starts on `http://127.0.0.1:8787`.
- Vite starts on `http://127.0.0.1:5173`.

- [ ] **Step 2: Use Build Web Apps frontend-testing-debugging flow**

Follow `build-web-apps:frontend-testing-debugging` exactly.

Target flow:

```text
app loads -> 精选首屏渲染约 12 个案例 -> 分类筛选 -> 选中案例 -> Prompt dock 显示原 Prompt -> 点击改写 -> 显示人物参考图适配版 Prompt
```

- [ ] **Step 3: Browser checks**

Verify and record:

- Page identity: `http://127.0.0.1:5173` and meaningful title.
- Not blank: DOM contains Gallery cards.
- No framework overlay.
- Console health: no relevant errors or warnings.
- Screenshot evidence: desktop first viewport and mobile viewport.
- Interaction proof: select category, select case, click rewrite.
- Network/load check: initial app requests `scope=featured`; `scope=all` happens only after featured images settle.

- [ ] **Step 4: Fix QA findings**

For each finding:

1. Identify the user-visible problem.
2. Patch the smallest relevant file.
3. Rerun focused tests.
4. Reload browser and repeat the same interaction.

- [ ] **Step 5: Commit QA fixes**

If QA fixes changed files, run:

```bash
git add -A
git commit -m "fix: address gallery browser qa"
```

If no files changed, do not create an empty commit.

---

### Task 11: Final Integration Review

**Files:**
- Modify: PR description or handoff notes only if the user asks for them.

- [ ] **Step 1: Check final status**

Run:

```bash
git status --short
```

Expected: clean working tree.

- [ ] **Step 2: Review changed runtime surface**

Run:

```bash
git log --oneline --max-count=12
git grep -n "source_image_storage_path\|image_url\|recommend\|experiment-images\|experiments" -- apps packages data ":!docs"
```

Expected:

- Recent commits correspond to this plan.
- No runtime upload/recommend/experiment image path remains.
- `image_url` does not appear in MaaS runtime request code.

- [ ] **Step 3: Record final verification**

Prepare final response with:

- automated command results for `npm test`, `npm run build`, `npm run lint`;
- Build Web Apps QA summary;
- any remaining risks, especially if live Huawei MaaS was mocked rather than called;
- note that `data/gallery/` Markdown remains archive-only and runtime uses structured data.

---

## Self-Review Checklist

- Spec coverage:
  - Workspace split: Tasks 1 and 8.
  - Shared contracts: Task 2.
  - Structured Gallery data: Task 3.
  - Hono API: Tasks 4, 5, and 6.
  - Huawei MaaS text-only rewrite: Task 6.
  - Simplified frontend and featured-first loading: Task 7.
  - Legacy deletion: Task 8.
  - Automated verification: Task 9.
  - Build Web Apps browser validation: Task 10.
- Placeholder scan:
  - The plan intentionally avoids unresolved placeholders.
  - Temporary migration helper is explicitly deleted before commit.
- Type consistency:
  - Shared request uses `case_number` and `original_prompt_text`.
  - Shared response uses only `rewritten_prompt_text`.
  - Gallery case uses `image_path`, not Supabase public URL fields.
