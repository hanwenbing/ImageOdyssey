# Prompt Gallery Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local Prompt Gallery web app described in `docs/superpowers/specs/2026-05-02-prompt-gallery-web-design.md`.

**Architecture:** Create a new `web/` Vite React app and keep it separate from `learn/my-app`. Supabase is the runtime data source for categories, prompt cases, images, and experiments. A narrow local Node API, the Local Codex Bridge, calls `codex exec` only for fixed recommendation and rewrite tasks.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, Vitest, Testing Library, Express, Supabase JS, Supabase SQL migrations, Codex CLI.

---

## Current Repository Constraints

- Do not modify or rely on `learn/my-app`; it has unrelated uncommitted changes.
- Build the formal app in `web/`.
- Keep `gallery*.md`, `assets/case*.jpg`, and `index.md` until migration is verified.
- Do not delete any files in the cleanup phase without a separate user confirmation.
- Do not expose Supabase `service_role` keys to browser code.
- Do not expose a general shell execution endpoint.

## Review-Driven Amendments

These amendments supersede older snippets below where they conflict. They came from the Task 1 and Task 2 review gates.

- Task 1 keeps only scripts that are backed by existing files at that checkpoint. Later tasks must add `server`, `dev:all`, `import:gallery`, and `validate:gallery` only when the corresponding files exist.
- Tailwind CSS v4 must be wired through `@tailwindcss/vite`; an empty `postcss.config.js` is not part of the final scaffold.
- Browser code must not write `experiments` rows or upload to `experiment-images` directly with the publishable key. Source/result uploads and experiment saves go through the local Node API using server-side credentials.
- `gallery-images` is public/readable. `experiment-images` is private and has no anonymous read or write policies.
- `experiments` has no anonymous read or insert policy. Local server code uses service role credentials for experiment writes.
- Supabase client code uses a lazy `getSupabaseClient()` typed with `createClient<Database>()`; do not import an eager `supabase` singleton.
- The joined frontend prompt-case view model is named `PromptCaseWithCategory`, not `PromptCase`, because `category_name` is not a base `prompt_cases` column.
- `CaseIndexItem` uses `category_name`, not `category`.
- Task 4 must add the `tsx` dependency and `import:gallery` / `validate:gallery` scripts when import scripts are created.
- Task 6 must add local-server dependencies and scripts when API files are created: `express`, `cors`, `multer`, `dotenv`, `tsx`, `zod`, corresponding `@types/*`, and `concurrently` if `dev:all` is added.
- Task 6 API surface includes not only `/api/recommend` and `/api/rewrite`, but also server-boundary experiment endpoints:
  - `POST /api/experiment-images` accepts multipart image upload with `kind=source|result`, uploads to private Supabase `experiment-images`, and returns `{ storagePath }`.
  - `POST /api/experiments` accepts the `ExperimentInsert` payload and inserts an experiment row through the server.
- Task 9 must preview selected source/result images with `URL.createObjectURL(file)` and store Supabase storage paths returned by the local API. It must not call `supabase.storage.from("experiment-images").upload(...)`, `getPublicUrl(...)` for experiment images, or `supabase.from("experiments").insert(...)` from browser code.

## File Structure To Create

```text
web/
- package.json
- index.html
- vite.config.ts
- tsconfig.json
- eslint.config.js
- postcss.config.js
- src/
  - main.tsx
  - App.tsx
  - index.css
  - types.ts
  - lib/
    - supabaseClient.ts
    - apiClient.ts
    - galleryFilters.ts
  - components/
    - ImageUploadPanel.tsx
    - GalleryControls.tsx
    - GalleryGrid.tsx
    - PromptBar.tsx
    - StudioLayout.tsx
  - test/
    - setup.ts
  - __tests__/
    - galleryFilters.test.ts
- server/
  - index.ts
  - imageCache.ts
  - codexBridge.ts
  - codexPrompts.ts
  - routes.ts
  - types.ts
  - __tests__/
    - codexBridge.test.ts
- scripts/
  - parseGallery.ts
  - importGallery.ts
  - validateGalleryImport.ts
  - __tests__/
    - parseGallery.test.ts
- supabase/
  - migrations/
    - 0001_prompt_gallery_schema.sql
  - schema.sql
```

## Task 1: Scaffold The Formal Web App

**Files:**
- Create: `web/package.json`
- Create: `web/index.html`
- Create: `web/vite.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/eslint.config.js`
- Create: `web/postcss.config.js`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/index.css`
- Create: `web/src/test/setup.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Create package manifest**

Create `web/package.json`:

```json
{
  "name": "imageodyssey-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "server": "tsx watch server/index.ts",
    "dev:all": "concurrently \"npm run server\" \"npm run dev\"",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "import:gallery": "tsx scripts/importGallery.ts",
    "validate:gallery": "tsx scripts/validateGalleryImport.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.105.1",
    "@vitejs/plugin-react": "^6.0.1",
    "cors": "^2.8.5",
    "dotenv": "^17.2.3",
    "express": "^5.1.0",
    "multer": "^2.0.2",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "tsx": "^4.21.0",
    "zod": "^4.1.13"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.0",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.5",
    "@types/multer": "^2.0.0",
    "@types/node": "^24.12.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "concurrently": "^9.2.1",
    "eslint": "^10.2.1",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.5.0",
    "jsdom": "^27.2.0",
    "tailwindcss": "^4.2.4",
    "typescript": "~6.0.2",
    "typescript-eslint": "^8.58.2",
    "vitest": "^4.0.15"
  }
}
```

- [ ] **Step 2: Create Vite and TypeScript config**

Create `web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"]
  }
});
```

Create `web/tsconfig.json`:

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
  "include": ["src", "server", "scripts", "vite.config.ts", "eslint.config.js"]
}
```

Create `web/eslint.config.js`:

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  }
);
```

Create `web/postcss.config.js`:

```js
export default {};
```

- [ ] **Step 3: Create the minimal app shell**

Create `web/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Prompt Gallery Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

Create `web/src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex min-h-screen max-w-[1800px] items-center justify-center px-6">
        <h1 className="text-3xl font-semibold">Prompt Gallery Studio</h1>
      </div>
    </main>
  );
}
```

Create `web/src/index.css`:

```css
@import "tailwindcss";

:root {
  color-scheme: dark;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  min-width: 320px;
}

#root {
  min-height: 100vh;
}
```

Create `web/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Ignore generated web dependencies**

Add to root `.gitignore`:

```gitignore
web/node_modules/
web/dist/
web/.env
web/.env.local
web/tmp/
```

- [ ] **Step 5: Install and verify scaffold**

Run:

```bash
cd web
npm install
npm run build
```

Expected: Vite reports a successful production build.

- [ ] **Step 6: Commit scaffold**

```bash
git add .gitignore web
git commit -m "feat: scaffold prompt gallery web app"
```

## Task 2: Add Shared Types And Supabase Schema

**Files:**
- Create: `web/src/types.ts`
- Create: `web/server/types.ts`
- Create: `web/supabase/migrations/0001_prompt_gallery_schema.sql`
- Create: `web/supabase/schema.sql`
- Create: `web/src/lib/supabaseClient.ts`

- [ ] **Step 1: Define shared frontend types**

Create `web/src/types.ts`:

```ts
export type Category = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  source_gallery_file: string;
};

export type PromptCase = {
  id: string;
  case_number: number;
  title: string;
  category_id: string;
  category_name: string;
  prompt_text: string;
  image_storage_path: string;
  image_public_url: string;
  summary: string;
  tags: string[];
  source_gallery_file: string;
  created_at: string;
  updated_at: string;
};

export type ExperimentInsert = {
  source_image_storage_path: string;
  result_image_storage_path: string;
  prompt_case_id: string;
  original_prompt_text: string;
  rewritten_prompt_text: string;
  recommendation_query: string | null;
};

export type Recommendation = {
  case_number: number;
  reason: string;
};

export type RewriteResult = {
  rewritten_prompt_text: string;
  preserved_parts: string[];
  changed_parts: string[];
};
```

- [ ] **Step 2: Define server request and response types**

Create `web/server/types.ts`:

```ts
export type CaseIndexItem = {
  case_number: number;
  title: string;
  category: string;
  summary: string;
  tags: string[];
  prompt_excerpt: string;
  image_storage_path: string;
};

export type RecommendRequest = {
  source_image_storage_path: string;
  user_query: string;
  category_filter: string | null;
  cases: CaseIndexItem[];
};

export type RecommendResponse = {
  recommendations: Array<{
    case_number: number;
    reason: string;
  }>;
};

export type RewriteRequest = {
  source_image_storage_path: string;
  case_number: number;
  original_prompt_text: string;
};

export type RewriteResponse = {
  rewritten_prompt_text: string;
  preserved_parts: string[];
  changed_parts: string[];
};
```

- [ ] **Step 3: Write Supabase migration**

Create `web/supabase/migrations/0001_prompt_gallery_schema.sql`:

```sql
create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order integer not null,
  source_gallery_file text not null
);

create table if not exists public.prompt_cases (
  id uuid primary key default gen_random_uuid(),
  case_number integer not null unique,
  title text not null,
  category_id uuid not null references public.categories(id) on delete restrict,
  prompt_text text not null,
  image_storage_path text not null,
  image_public_url text not null,
  summary text not null default '',
  tags text[] not null default '{}',
  source_gallery_file text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  source_image_storage_path text not null,
  result_image_storage_path text not null,
  prompt_case_id uuid not null references public.prompt_cases(id) on delete restrict,
  original_prompt_text text not null,
  rewritten_prompt_text text not null,
  recommendation_query text,
  created_at timestamptz not null default now()
);

create index if not exists prompt_cases_category_id_idx on public.prompt_cases(category_id);
create index if not exists prompt_cases_case_number_idx on public.prompt_cases(case_number);
create index if not exists experiments_prompt_case_id_idx on public.experiments(prompt_case_id);

insert into storage.buckets (id, name, public)
values
  ('gallery-images', 'gallery-images', true),
  ('experiment-images', 'experiment-images', true)
on conflict (id) do update set public = excluded.public;

alter table public.categories enable row level security;
alter table public.prompt_cases enable row level security;
alter table public.experiments enable row level security;

drop policy if exists "local read categories" on public.categories;
create policy "local read categories"
on public.categories
for select
to anon, authenticated
using (true);

drop policy if exists "local read prompt cases" on public.prompt_cases;
create policy "local read prompt cases"
on public.prompt_cases
for select
to anon, authenticated
using (true);

drop policy if exists "local read experiments" on public.experiments;
create policy "local read experiments"
on public.experiments
for select
to anon, authenticated
using (true);

drop policy if exists "local insert experiments" on public.experiments;
create policy "local insert experiments"
on public.experiments
for insert
to anon, authenticated
with check (true);

drop policy if exists "local read gallery images" on storage.objects;
create policy "local read gallery images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'gallery-images');

drop policy if exists "local read experiment images" on storage.objects;
create policy "local read experiment images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'experiment-images');

drop policy if exists "local upload experiment images" on storage.objects;
create policy "local upload experiment images"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'experiment-images');
```

Create `web/supabase/schema.sql` with the same SQL content.

- [ ] **Step 4: Create Supabase client**

Create `web/src/lib/supabaseClient.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
```

- [ ] **Step 5: Verify TypeScript**

Run:

```bash
cd web
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 6: Commit schema and types**

```bash
git add web/src/types.ts web/server/types.ts web/supabase web/src/lib/supabaseClient.ts
git commit -m "feat: add prompt gallery schema and shared types"
```

## Task 3: Implement Gallery Markdown Parser

**Files:**
- Create: `web/scripts/parseGallery.ts`
- Create: `web/scripts/__tests__/parseGallery.test.ts`

- [ ] **Step 1: Write parser tests**

Create `web/scripts/__tests__/parseGallery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseGalleryMarkdown, parseIndexMarkdown } from "../parseGallery";

describe("parseIndexMarkdown", () => {
  it("extracts category metadata from index links", () => {
    const markdown = `
- [gallery1.md：UI与界面](gallery1.md) - 86 个案例，例 2-354
- [gallery13.md：其他应用场景](gallery13.md) - 25 个案例，例 178-334
`;

    expect(parseIndexMarkdown(markdown)).toEqual([
      {
        slug: "gallery1",
        name: "UI与界面",
        sort_order: 1,
        source_gallery_file: "gallery1.md"
      },
      {
        slug: "gallery13",
        name: "其他应用场景",
        sort_order: 13,
        source_gallery_file: "gallery13.md"
      }
    ]);
  });
});

describe("parseGalleryMarkdown", () => {
  it("extracts case number, title, image, and prompt", () => {
    const markdown = `
# UI与界面

<a id="case-2"></a>

### 例 2：社媒界面截图

![例 2：社媒界面截图](assets/case2.jpg)

**提示词：**

\`\`\`text
画一张 X 的内容截图。
\`\`\`

***
`;

    expect(parseGalleryMarkdown("gallery1.md", "UI与界面", markdown)).toEqual([
      {
        case_number: 2,
        title: "社媒界面截图",
        category_name: "UI与界面",
        prompt_text: "画一张 X 的内容截图。",
        local_image_path: "assets/case2.jpg",
        source_gallery_file: "gallery1.md",
        summary: "社媒界面截图",
        tags: ["UI与界面", "社媒界面截图"],
        prompt_excerpt: "画一张 X 的内容截图。"
      }
    ]);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run:

```bash
cd web
npm test -- scripts/__tests__/parseGallery.test.ts
```

Expected: fails because `parseGallery.ts` does not exist.

- [ ] **Step 3: Implement parser**

Create `web/scripts/parseGallery.ts`:

```ts
export type ParsedCategory = {
  slug: string;
  name: string;
  sort_order: number;
  source_gallery_file: string;
};

export type ParsedPromptCase = {
  case_number: number;
  title: string;
  category_name: string;
  prompt_text: string;
  local_image_path: string;
  source_gallery_file: string;
  summary: string;
  tags: string[];
  prompt_excerpt: string;
};

export function parseIndexMarkdown(markdown: string): ParsedCategory[] {
  const categories: ParsedCategory[] = [];
  const linePattern = /gallery(\d+)\.md：(.+?)\]\(gallery\1\.md\)/;

  for (const line of markdown.split("\n")) {
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }

    const sortOrder = Number(match[1]);
    categories.push({
      slug: `gallery${sortOrder}`,
      name: match[2].trim(),
      sort_order: sortOrder,
      source_gallery_file: `gallery${sortOrder}.md`
    });
  }

  return categories;
}

export function parseGalleryMarkdown(
  sourceGalleryFile: string,
  categoryName: string,
  markdown: string
): ParsedPromptCase[] {
  const cases: ParsedPromptCase[] = [];
  const casePattern =
    /### 例 (\d+)：(.+?)\n\n!\[.*?\]\((assets\/case\d+\.jpg)\)\n\n\*\*提示词：\*\*\n\n```text\n([\s\S]*?)\n```/g;

  for (const match of markdown.matchAll(casePattern)) {
    const promptText = match[4].trim();
    const title = match[2].trim();
    cases.push({
      case_number: Number(match[1]),
      title,
      category_name: categoryName,
      prompt_text: promptText,
      local_image_path: match[3],
      source_gallery_file: sourceGalleryFile,
      summary: title,
      tags: Array.from(new Set([categoryName, title])),
      prompt_excerpt: createPromptExcerpt(promptText)
    });
  }

  return cases;
}

export function createPromptExcerpt(promptText: string): string {
  const normalized = promptText.replace(/\s+/g, " ").trim();
  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 180)}...`;
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
cd web
npm test -- scripts/__tests__/parseGallery.test.ts
```

Expected: tests pass.

- [ ] **Step 5: Commit parser**

```bash
git add web/scripts/parseGallery.ts web/scripts/__tests__/parseGallery.test.ts
git commit -m "feat: parse prompt gallery markdown"
```

## Task 4: Implement Supabase Import And Validation Scripts

**Files:**
- Create: `web/scripts/importGallery.ts`
- Create: `web/scripts/validateGalleryImport.ts`

- [ ] **Step 1: Create import script**

Create `web/scripts/importGallery.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseGalleryMarkdown, parseIndexMarkdown } from "./parseGallery";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function main() {
  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const indexMarkdown = await readFile(path.join(repoRoot, "index.md"), "utf8");
  const categories = parseIndexMarkdown(indexMarkdown);

  for (const category of categories) {
    const { error } = await supabase.from("categories").upsert(category, {
      onConflict: "slug"
    });
    if (error) {
      throw error;
    }
  }

  const { data: categoryRows, error: categoryError } = await supabase
    .from("categories")
    .select("id, name, source_gallery_file");

  if (categoryError) {
    throw categoryError;
  }

  const categoryByFile = new Map(
    categoryRows.map((category) => [category.source_gallery_file, category])
  );

  for (const category of categories) {
    const galleryMarkdown = await readFile(
      path.join(repoRoot, category.source_gallery_file),
      "utf8"
    );
    const parsedCases = parseGalleryMarkdown(
      category.source_gallery_file,
      category.name,
      galleryMarkdown
    );
    const categoryRow = categoryByFile.get(category.source_gallery_file);

    if (!categoryRow) {
      throw new Error(`Missing imported category for ${category.source_gallery_file}`);
    }

    for (const promptCase of parsedCases) {
      const imageBuffer = await readFile(path.join(repoRoot, promptCase.local_image_path));
      const imageStoragePath = `cases/case${promptCase.case_number}.jpg`;
      const upload = await supabase.storage
        .from("gallery-images")
        .upload(imageStoragePath, imageBuffer, {
          contentType: "image/jpeg",
          upsert: true
        });

      if (upload.error) {
        throw upload.error;
      }

      const { data: publicUrl } = supabase.storage
        .from("gallery-images")
        .getPublicUrl(imageStoragePath);

      const { error } = await supabase.from("prompt_cases").upsert(
        {
          case_number: promptCase.case_number,
          title: promptCase.title,
          category_id: categoryRow.id,
          prompt_text: promptCase.prompt_text,
          image_storage_path: imageStoragePath,
          image_public_url: publicUrl.publicUrl,
          summary: promptCase.summary,
          tags: promptCase.tags,
          source_gallery_file: promptCase.source_gallery_file
        },
        { onConflict: "case_number" }
      );

      if (error) {
        throw error;
      }
    }
  }

  console.log(`Imported ${categories.length} categories.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Create validation script**

Create `web/scripts/validateGalleryImport.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseGalleryMarkdown, parseIndexMarkdown } from "./parseGallery";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const knownMissingPromptNumbers = [12, 169, 170];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function main() {
  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const indexMarkdown = await readFile(path.join(repoRoot, "index.md"), "utf8");
  const categories = parseIndexMarkdown(indexMarkdown);
  const parsedCases = [];

  for (const category of categories) {
    const galleryMarkdown = await readFile(
      path.join(repoRoot, category.source_gallery_file),
      "utf8"
    );
    parsedCases.push(
      ...parseGalleryMarkdown(category.source_gallery_file, category.name, galleryMarkdown)
    );
  }

  const { count: categoryCount, error: categoryError } = await supabase
    .from("categories")
    .select("*", { count: "exact", head: true });
  if (categoryError) {
    throw categoryError;
  }

  const { count: caseCount, error: caseError } = await supabase
    .from("prompt_cases")
    .select("*", { count: "exact", head: true });
  if (caseError) {
    throw caseError;
  }

  if (categoryCount !== categories.length) {
    throw new Error(`Expected ${categories.length} categories, found ${categoryCount}`);
  }

  if (caseCount !== parsedCases.length) {
    throw new Error(`Expected ${parsedCases.length} prompt cases, found ${caseCount}`);
  }

  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const promptCase of parsedCases) {
    if (seen.has(promptCase.case_number)) {
      duplicates.add(promptCase.case_number);
    }
    seen.add(promptCase.case_number);
  }

  if (duplicates.size > 0) {
    throw new Error(`Duplicate case numbers: ${Array.from(duplicates).join(", ")}`);
  }

  console.log(
    JSON.stringify(
      {
        categories: categoryCount,
        prompt_cases: caseCount,
        known_missing_prompt_numbers: knownMissingPromptNumbers
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 3: Run local parser tests before touching Supabase**

Run:

```bash
cd web
npm test -- scripts/__tests__/parseGallery.test.ts
```

Expected: parser tests pass.

- [ ] **Step 4: Apply schema and import**

Use Supabase SQL editor, Supabase CLI, or MCP to apply:

```text
web/supabase/migrations/0001_prompt_gallery_schema.sql
```

Then run:

```bash
cd web
SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" npm run import:gallery
SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" npm run validate:gallery
```

Expected validation output:

```json
{
  "categories": 13,
  "prompt_cases": 352,
  "known_missing_prompt_numbers": [12, 169, 170]
}
```

- [ ] **Step 5: Commit import scripts**

```bash
git add web/scripts/importGallery.ts web/scripts/validateGalleryImport.ts
git commit -m "feat: import prompt gallery into supabase"
```

## Task 5: Implement Local Image Cache And Codex Bridge Core

**Files:**
- Create: `web/server/imageCache.ts`
- Create: `web/server/codexPrompts.ts`
- Create: `web/server/codexBridge.ts`
- Create: `web/server/__tests__/codexBridge.test.ts`

- [ ] **Step 1: Write Codex bridge tests**

Create `web/server/__tests__/codexBridge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCodexJson, validateRecommendations, validateRewrite } from "../codexBridge";

describe("parseCodexJson", () => {
  it("parses a fenced JSON response", () => {
    const result = parseCodexJson('```json\\n{"ok":true}\\n```');
    expect(result).toEqual({ ok: true });
  });
});

describe("validateRecommendations", () => {
  it("requires exactly six recommendations", () => {
    const value = {
      recommendations: [1, 2, 3, 4, 5, 6].map((case_number) => ({
        case_number,
        reason: "匹配上传主体和搞怪需求"
      }))
    };
    expect(validateRecommendations(value).recommendations).toHaveLength(6);
  });
});

describe("validateRewrite", () => {
  it("requires rewritten prompt text", () => {
    const value = {
      rewritten_prompt_text: "以我上传的图片中的主体为参考，生成一张海报。",
      preserved_parts: ["海报风格"],
      changed_parts: ["主体锚点"]
    };
    expect(validateRewrite(value).rewritten_prompt_text).toContain("上传的图片");
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run:

```bash
cd web
npm test -- server/__tests__/codexBridge.test.ts
```

Expected: fails because bridge does not exist.

- [ ] **Step 3: Create Supabase image cache**

Create `web/server/imageCache.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cacheRoot = path.resolve(import.meta.dirname, "../tmp/codex-images");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export async function cacheExperimentImage(storagePath: string): Promise<string> {
  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data, error } = await supabase.storage
    .from("experiment-images")
    .download(storagePath);

  if (error) {
    throw error;
  }

  await mkdir(cacheRoot, { recursive: true });
  const extension = path.extname(storagePath) || ".jpg";
  const localPath = path.join(cacheRoot, `${crypto.randomUUID()}${extension}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await writeFile(localPath, bytes);
  return localPath;
}
```

- [ ] **Step 4: Create fixed prompt builders**

Create `web/server/codexPrompts.ts`:

```ts
import type { CaseIndexItem, RecommendRequest, RewriteRequest } from "./types";

export function buildRecommendationPrompt(request: RecommendRequest): string {
  const index = request.cases.map(formatCaseIndexItem).join("\n");

  return `
你是 ImageOdyssey 的 GPT Image 2 中文提示词案例推荐器。

任务：根据上传的 Source Image 和用户需求，从候选案例索引中推荐恰好 6 个案例。

用户需求：
${request.user_query}

分类过滤：
${request.category_filter ?? "无"}

候选案例索引：
${index}

规则：
- 上传图片只作为主体和视觉倾向参考。
- 推荐必须来自候选案例索引，不能编造 case_number。
- 输出 JSON，不要输出 Markdown。
- JSON 格式：
{
  "recommendations": [
    { "case_number": 193, "reason": "中文理由" }
  ]
}
`.trim();
}

export function buildRewritePrompt(request: RewriteRequest): string {
  return `
你是 ImageOdyssey 的 GPT Image 2 中文提示词改写器。

任务：基于上传的 Source Image 和选中案例 Prompt，做主体锚点式最小适配改写。

案例编号：
${request.case_number}

原始 Prompt：
${request.original_prompt_text}

必须遵守：
- 上传图只作为主体参考。
- 保留原 prompt 的目标场景、风格、构图、文字、光线和结构。
- 不把上传图背景、自拍质感、无关人物关系、贴图、房间细节等写入最终 prompt。
- 只修改主体锚点、显式变量、与上传主体直接冲突的称谓或数量。
- 输出中文。
- 输出 JSON，不要输出 Markdown。
- JSON 格式：
{
  "rewritten_prompt_text": "最终中文 prompt",
  "preserved_parts": ["保留内容"],
  "changed_parts": ["改动内容"]
}
`.trim();
}

function formatCaseIndexItem(item: CaseIndexItem): string {
  return [
    `case_number: ${item.case_number}`,
    `title: ${item.title}`,
    `category: ${item.category}`,
    `summary: ${item.summary}`,
    `tags: ${item.tags.join(", ")}`,
    `prompt_excerpt: ${item.prompt_excerpt}`,
    `image_storage_path: ${item.image_storage_path}`
  ].join(" | ");
}
```

- [ ] **Step 5: Implement bridge parsing and validation**

Create `web/server/codexBridge.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { buildRecommendationPrompt, buildRewritePrompt } from "./codexPrompts";
import { cacheExperimentImage } from "./imageCache";
import type {
  RecommendRequest,
  RecommendResponse,
  RewriteRequest,
  RewriteResponse
} from "./types";

const execFileAsync = promisify(execFile);

const recommendationSchema = z.object({
  recommendations: z
    .array(
      z.object({
        case_number: z.number().int(),
        reason: z.string().min(1)
      })
    )
    .length(6)
});

const rewriteSchema = z.object({
  rewritten_prompt_text: z.string().min(1),
  preserved_parts: z.array(z.string()),
  changed_parts: z.array(z.string())
});

export function parseCodexJson(output: string): unknown {
  const trimmed = output.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(withoutFence);
}

export function validateRecommendations(value: unknown): RecommendResponse {
  return recommendationSchema.parse(value);
}

export function validateRewrite(value: unknown): RewriteResponse {
  return rewriteSchema.parse(value);
}

export async function recommendWithCodex(request: RecommendRequest): Promise<RecommendResponse> {
  const localImagePath = await cacheExperimentImage(request.source_image_storage_path);
  const output = await runCodex(localImagePath, buildRecommendationPrompt(request));
  return validateRecommendations(parseCodexJson(output));
}

export async function rewriteWithCodex(request: RewriteRequest): Promise<RewriteResponse> {
  const localImagePath = await cacheExperimentImage(request.source_image_storage_path);
  const output = await runCodex(localImagePath, buildRewritePrompt(request));
  return validateRewrite(parseCodexJson(output));
}

async function runCodex(sourceImagePath: string, prompt: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "codex",
    [
      "exec",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "-C",
      "/Users/godw/Code/Python/ImageOdyssey",
      "-i",
      sourceImagePath,
      prompt
    ],
    {
      timeout: 180_000,
      maxBuffer: 1024 * 1024 * 4
    }
  );

  return stdout;
}
```

- [ ] **Step 6: Run bridge tests**

Run:

```bash
cd web
npm test -- server/__tests__/codexBridge.test.ts
```

Expected: tests pass.

- [ ] **Step 7: Commit bridge core**

```bash
git add web/server/imageCache.ts web/server/codexPrompts.ts web/server/codexBridge.ts web/server/__tests__/codexBridge.test.ts
git commit -m "feat: add local codex bridge core"
```

## Task 6: Expose Local API Routes

**Files:**
- Create: `web/server/routes.ts`
- Create: `web/server/index.ts`
- Create: `web/src/lib/apiClient.ts`

- [ ] **Step 1: Implement Express routes**

Create `web/server/routes.ts`:

```ts
import { Router } from "express";
import { z } from "zod";
import { recommendWithCodex, rewriteWithCodex } from "./codexBridge";

const router = Router();

const caseIndexSchema = z.object({
  case_number: z.number().int(),
  title: z.string(),
  category: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  prompt_excerpt: z.string(),
  image_storage_path: z.string()
});

const recommendSchema = z.object({
  source_image_storage_path: z.string().min(1),
  user_query: z.string().min(1),
  category_filter: z.string().nullable(),
  cases: z.array(caseIndexSchema).min(1)
});

const rewriteSchema = z.object({
  source_image_storage_path: z.string().min(1),
  case_number: z.number().int(),
  original_prompt_text: z.string().min(1)
});

router.post("/recommend", async (request, response) => {
  const parsed = recommendSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid recommendation request" });
    return;
  }

  try {
    response.json(await recommendWithCodex(parsed.data));
  } catch (error) {
    response.status(500).json({ error: getErrorMessage(error) });
  }
});

router.post("/rewrite", async (request, response) => {
  const parsed = rewriteSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid rewrite request" });
    return;
  }

  try {
    response.json(await rewriteWithCodex(parsed.data));
  } catch (error) {
    response.status(500).json({ error: getErrorMessage(error) });
  }
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Codex bridge error";
}

export default router;
```

Create `web/server/index.ts`:

```ts
import cors from "cors";
import express from "express";
import routes from "./routes";

const app = express();
const port = Number(process.env.CODEX_BRIDGE_PORT ?? 8787);

app.use(cors({ origin: "http://127.0.0.1:5173" }));
app.use(express.json({ limit: "4mb" }));
app.use("/api", routes);

app.listen(port, "127.0.0.1", () => {
  console.log(`Local Codex Bridge listening on http://127.0.0.1:${port}`);
});
```

- [ ] **Step 2: Implement frontend API client**

Create `web/src/lib/apiClient.ts`:

```ts
import type { Recommendation, RewriteResult } from "../types";

export type RecommendPayload = {
  source_image_storage_path: string;
  user_query: string;
  category_filter: string | null;
  cases: Array<{
    case_number: number;
    title: string;
    category: string;
    summary: string;
    tags: string[];
    prompt_excerpt: string;
    image_storage_path: string;
  }>;
};

export type RewritePayload = {
  source_image_storage_path: string;
  case_number: number;
  original_prompt_text: string;
};

export async function requestRecommendations(
  payload: RecommendPayload
): Promise<Recommendation[]> {
  const response = await fetch("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error ?? "Recommendation failed");
  }
  return json.recommendations;
}

export async function requestRewrite(payload: RewritePayload): Promise<RewriteResult> {
  const response = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error ?? "Rewrite failed");
  }
  return json;
}
```

- [ ] **Step 3: Verify server starts**

Run:

```bash
cd web
npm run server
```

Expected:

```text
Local Codex Bridge listening on http://127.0.0.1:8787
```

Stop the server with `Ctrl-C`.

- [ ] **Step 4: Commit API routes**

```bash
git add web/server/routes.ts web/server/index.ts web/src/lib/apiClient.ts
git commit -m "feat: expose local codex bridge api"
```

## Task 7: Add Gallery Data Access And Filtering

**Files:**
- Create: `web/src/lib/galleryFilters.ts`
- Create: `web/src/__tests__/galleryFilters.test.ts`

- [ ] **Step 1: Write filter tests**

Create `web/src/__tests__/galleryFilters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterCases } from "../lib/galleryFilters";
import type { PromptCase } from "../types";

const cases = [
  createCase(193, "千手观音化身打工人", "人物与角色"),
  createCase(335, "朋友圈截图生成", "UI与界面")
];

describe("filterCases", () => {
  it("filters by case number", () => {
    expect(filterCases(cases, "193", "全部").map((item) => item.case_number)).toEqual([193]);
  });

  it("filters by title text", () => {
    expect(filterCases(cases, "朋友圈", "全部").map((item) => item.case_number)).toEqual([335]);
  });

  it("filters by category", () => {
    expect(filterCases(cases, "", "人物与角色").map((item) => item.case_number)).toEqual([193]);
  });
});

function createCase(caseNumber: number, title: string, categoryName: string): PromptCase {
  return {
    id: String(caseNumber),
    case_number: caseNumber,
    title,
    category_id: "category",
    category_name: categoryName,
    prompt_text: title,
    image_storage_path: `cases/case${caseNumber}.jpg`,
    image_public_url: `/case${caseNumber}.jpg`,
    summary: title,
    tags: [categoryName, title],
    source_gallery_file: "gallery.md",
    created_at: "2026-05-02T00:00:00Z",
    updated_at: "2026-05-02T00:00:00Z"
  };
}
```

- [ ] **Step 2: Implement filters**

Create `web/src/lib/galleryFilters.ts`:

```ts
import type { PromptCase } from "../types";

export function filterCases(
  cases: PromptCase[],
  query: string,
  categoryName: string
): PromptCase[] {
  const normalizedQuery = query.trim().toLowerCase();

  return cases.filter((promptCase) => {
    const categoryMatches =
      categoryName === "全部" || promptCase.category_name === categoryName;

    const queryMatches =
      normalizedQuery.length === 0 ||
      String(promptCase.case_number).includes(normalizedQuery) ||
      promptCase.title.toLowerCase().includes(normalizedQuery) ||
      promptCase.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));

    return categoryMatches && queryMatches;
  });
}
```

- [ ] **Step 3: Run filter tests**

Run:

```bash
cd web
npm test -- src/__tests__/galleryFilters.test.ts
```

Expected: tests pass.

- [ ] **Step 4: Commit filters**

```bash
git add web/src/lib/galleryFilters.ts web/src/__tests__/galleryFilters.test.ts
git commit -m "feat: add gallery filtering"
```

## Task 8: Build Studio UI Components

**Files:**
- Create: `web/src/components/ImageUploadPanel.tsx`
- Create: `web/src/components/GalleryControls.tsx`
- Create: `web/src/components/GalleryGrid.tsx`
- Create: `web/src/components/PromptBar.tsx`
- Create: `web/src/components/StudioLayout.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create image upload panel**

Create `web/src/components/ImageUploadPanel.tsx`:

```tsx
type ImageUploadPanelProps = {
  title: string;
  helper: string;
  imageUrl: string | null;
  disabled?: boolean;
  onFileSelected: (file: File) => void;
};

export function ImageUploadPanel({
  title,
  helper,
  imageUrl,
  disabled = false,
  onFileSelected
}: ImageUploadPanelProps) {
  return (
    <label
      className={`group relative flex min-h-0 flex-1 cursor-pointer overflow-hidden rounded-lg border border-dashed p-4 transition ${
        disabled
          ? "cursor-not-allowed border-zinc-700 bg-zinc-900/60 opacity-50"
          : "border-cyan-300/40 bg-zinc-900/80 hover:border-cyan-200"
      }`}
    >
      <input
        className="sr-only"
        type="file"
        accept="image/*"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onFileSelected(file);
          }
        }}
      />
      {imageUrl ? (
        <img className="h-full w-full object-contain" src={imageUrl} alt={title} />
      ) : (
        <span className="m-auto text-center">
          <span className="block text-xl font-semibold text-white">{title}</span>
          <span className="mt-2 block text-sm text-zinc-400">{helper}</span>
        </span>
      )}
    </label>
  );
}
```

- [ ] **Step 2: Create gallery controls**

Create `web/src/components/GalleryControls.tsx`:

```tsx
type GalleryControlsProps = {
  query: string;
  categories: string[];
  selectedCategory: string;
  canRecommend: boolean;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onRecommend: () => void;
};

export function GalleryControls({
  query,
  categories,
  selectedCategory,
  canRecommend,
  onQueryChange,
  onCategoryChange,
  onRecommend
}: GalleryControlsProps) {
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <input
          className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/10 px-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300"
          value={query}
          placeholder="搜索案例编号/标题，或输入自然语言需求"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <button
          className="h-11 rounded-full bg-cyan-300 px-6 text-sm font-bold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          type="button"
          disabled={!canRecommend}
          onClick={onRecommend}
        >
          推荐
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((category) => (
          <button
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              category === selectedCategory
                ? "bg-cyan-300 text-zinc-950"
                : "bg-white/10 text-zinc-300 hover:bg-white/15"
            }`}
            key={category}
            type="button"
            onClick={() => onCategoryChange(category)}
          >
            {category}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create gallery grid**

Create `web/src/components/GalleryGrid.tsx`:

```tsx
import type { PromptCase } from "../types";

type GalleryGridProps = {
  cases: PromptCase[];
  selectedCaseId: string | null;
  recommendedCaseNumbers: number[];
  onSelect: (promptCase: PromptCase) => void;
};

export function GalleryGrid({
  cases,
  selectedCaseId,
  recommendedCaseNumbers,
  onSelect
}: GalleryGridProps) {
  return (
    <div className="grid min-h-0 grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-3 xl:grid-cols-4">
      {cases.map((promptCase) => {
        const selected = selectedCaseId === promptCase.id;
        const recommended = recommendedCaseNumbers.includes(promptCase.case_number);
        return (
          <button
            className={`group relative aspect-[4/5] overflow-hidden rounded-lg border bg-zinc-900 text-left transition ${
              selected ? "border-cyan-300" : "border-white/10 hover:border-cyan-300/60"
            }`}
            key={promptCase.id}
            type="button"
            onClick={() => onSelect(promptCase)}
          >
            <img
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              src={promptCase.image_public_url}
              alt={`例 ${promptCase.case_number}：${promptCase.title}`}
            />
            {recommended && (
              <span className="absolute left-2 top-2 rounded-md bg-cyan-300 px-2 py-1 text-xs font-bold text-zinc-950">
                推荐
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 translate-y-full bg-zinc-950/85 p-3 text-sm transition group-hover:translate-y-0">
              <span className="block font-bold text-white">例 {promptCase.case_number}</span>
              <span className="mt-1 block text-zinc-200">{promptCase.title}</span>
              <span className="mt-1 block text-xs text-cyan-200">{promptCase.category_name}</span>
              <span className="mt-2 block text-xs text-zinc-400">点击选中</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Create prompt bar**

Create `web/src/components/PromptBar.tsx`:

```tsx
import type { PromptCase, RewriteResult } from "../types";

type PromptBarProps = {
  selectedCase: PromptCase | null;
  rewriteResult: RewriteResult | null;
  activeTab: "original" | "rewrite";
  canRewrite: boolean;
  isRewriting: boolean;
  onTabChange: (tab: "original" | "rewrite") => void;
  onRewrite: () => void;
};

export function PromptBar({
  selectedCase,
  rewriteResult,
  activeTab,
  canRewrite,
  isRewriting,
  onTabChange,
  onRewrite
}: PromptBarProps) {
  const promptText =
    activeTab === "original"
      ? selectedCase?.prompt_text ?? "选择一个 Gallery 案例后显示原始 Prompt。"
      : rewriteResult?.rewritten_prompt_text ?? "点击“改写”后显示改写 Prompt。";

  return (
    <section className="grid min-h-[180px] grid-cols-[1fr_auto] gap-4 border-t border-white/10 bg-zinc-950/95 p-4 shadow-[0_-24px_80px_rgba(0,0,0,0.45)]">
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <button
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              activeTab === "original" ? "bg-cyan-300 text-zinc-950" : "bg-white/10"
            }`}
            type="button"
            onClick={() => onTabChange("original")}
          >
            原始 Prompt
          </button>
          <button
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              activeTab === "rewrite" ? "bg-cyan-300 text-zinc-950" : "bg-white/10"
            }`}
            type="button"
            onClick={() => onTabChange("rewrite")}
          >
            改写 Prompt
          </button>
          {selectedCase && (
            <span className="truncate text-sm text-zinc-400">
              例 {selectedCase.case_number}：{selectedCase.title}
            </span>
          )}
        </div>
        <textarea
          className="h-[112px] w-full resize-none rounded-lg border border-white/10 bg-white/[0.06] p-3 text-sm leading-6 text-zinc-100 outline-none"
          readOnly
          value={promptText}
        />
      </div>
      <button
        className="w-28 rounded-lg bg-cyan-300 text-sm font-bold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        type="button"
        disabled={!canRewrite || isRewriting}
        onClick={onRewrite}
      >
        {isRewriting ? "改写中" : "改写"}
      </button>
    </section>
  );
}
```

- [ ] **Step 5: Create layout component and wire into App**

Create `web/src/components/StudioLayout.tsx`:

```tsx
import { GalleryControls } from "./GalleryControls";
import { GalleryGrid } from "./GalleryGrid";
import { ImageUploadPanel } from "./ImageUploadPanel";
import { PromptBar } from "./PromptBar";
import type { PromptCase, RewriteResult } from "../types";

type StudioLayoutProps = {
  sourceImageUrl: string | null;
  resultImageUrl: string | null;
  query: string;
  categories: string[];
  selectedCategory: string;
  cases: PromptCase[];
  selectedCase: PromptCase | null;
  recommendedCaseNumbers: number[];
  rewriteResult: RewriteResult | null;
  activePromptTab: "original" | "rewrite";
  canRecommend: boolean;
  canRewrite: boolean;
  canUploadResult: boolean;
  isRewriting: boolean;
  onSourceSelected: (file: File) => void;
  onResultSelected: (file: File) => void;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onRecommend: () => void;
  onCaseSelect: (promptCase: PromptCase) => void;
  onPromptTabChange: (tab: "original" | "rewrite") => void;
  onRewrite: () => void;
};

export function StudioLayout(props: StudioLayoutProps) {
  return (
    <main className="flex h-screen flex-col bg-zinc-950 text-zinc-50">
      <div className="grid min-h-0 flex-1 grid-cols-[360px_1fr] gap-4 p-4">
        <section className="flex min-h-0 flex-col gap-4">
          <ImageUploadPanel
            title="Source Image"
            helper="上传主体参考图"
            imageUrl={props.sourceImageUrl}
            onFileSelected={props.onSourceSelected}
          />
          <ImageUploadPanel
            title="Result Image"
            helper="改写完成后上传 ChatGPT 生成图"
            imageUrl={props.resultImageUrl}
            disabled={!props.canUploadResult}
            onFileSelected={props.onResultSelected}
          />
        </section>
        <section className="flex min-h-0 flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <GalleryControls
            query={props.query}
            categories={props.categories}
            selectedCategory={props.selectedCategory}
            canRecommend={props.canRecommend}
            onQueryChange={props.onQueryChange}
            onCategoryChange={props.onCategoryChange}
            onRecommend={props.onRecommend}
          />
          <GalleryGrid
            cases={props.cases}
            selectedCaseId={props.selectedCase?.id ?? null}
            recommendedCaseNumbers={props.recommendedCaseNumbers}
            onSelect={props.onCaseSelect}
          />
        </section>
      </div>
      <PromptBar
        selectedCase={props.selectedCase}
        rewriteResult={props.rewriteResult}
        activeTab={props.activePromptTab}
        canRewrite={props.canRewrite}
        isRewriting={props.isRewriting}
        onTabChange={props.onPromptTabChange}
        onRewrite={props.onRewrite}
      />
    </main>
  );
}
```

Modify `web/src/App.tsx` to render static sample data first:

```tsx
import { useMemo, useState } from "react";
import { StudioLayout } from "./components/StudioLayout";
import { filterCases } from "./lib/galleryFilters";
import type { PromptCase, RewriteResult } from "./types";

const sampleCases: PromptCase[] = [
  {
    id: "case-193",
    case_number: 193,
    title: "千手观音化身打工人",
    category_id: "gallery9",
    category_name: "人物与角色",
    prompt_text: "生成一张千手观音化身打工人的夸张视觉图。",
    image_storage_path: "cases/case193.jpg",
    image_public_url: "/favicon.svg",
    summary: "千手观音化身打工人",
    tags: ["人物与角色"],
    source_gallery_file: "gallery9.md",
    created_at: "2026-05-02T00:00:00Z",
    updated_at: "2026-05-02T00:00:00Z"
  }
];

export default function App() {
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [selectedCase, setSelectedCase] = useState<PromptCase | null>(null);
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);
  const [activePromptTab, setActivePromptTab] = useState<"original" | "rewrite">("original");
  const [isRewriting, setIsRewriting] = useState(false);

  const filteredCases = useMemo(
    () => filterCases(sampleCases, query, selectedCategory),
    [query, selectedCategory]
  );

  return (
    <StudioLayout
      sourceImageUrl={sourceImageUrl}
      resultImageUrl={resultImageUrl}
      query={query}
      categories={["全部", "人物与角色"]}
      selectedCategory={selectedCategory}
      cases={filteredCases}
      selectedCase={selectedCase}
      recommendedCaseNumbers={[]}
      rewriteResult={rewriteResult}
      activePromptTab={activePromptTab}
      canRecommend={Boolean(sourceImageUrl)}
      canRewrite={Boolean(sourceImageUrl && selectedCase)}
      canUploadResult={Boolean(sourceImageUrl && selectedCase && rewriteResult)}
      isRewriting={isRewriting}
      onSourceSelected={(file) => setSourceImageUrl(URL.createObjectURL(file))}
      onResultSelected={(file) => setResultImageUrl(URL.createObjectURL(file))}
      onQueryChange={setQuery}
      onCategoryChange={setSelectedCategory}
      onRecommend={() => undefined}
      onCaseSelect={(promptCase) => {
        setSelectedCase(promptCase);
        setRewriteResult(null);
        setActivePromptTab("original");
      }}
      onPromptTabChange={setActivePromptTab}
      onRewrite={() => {
        setIsRewriting(true);
        setRewriteResult({
          rewritten_prompt_text: "以我上传的图片中的主体为参考，生成一张千手观音化身打工人的夸张视觉图。",
          preserved_parts: ["夸张视觉图"],
          changed_parts: ["主体锚点"]
        });
        setActivePromptTab("rewrite");
        setIsRewriting(false);
      }}
    />
  );
}
```

- [ ] **Step 6: Build UI**

Run:

```bash
cd web
npm run build
```

Expected: build passes.

- [ ] **Step 7: Commit UI shell**

```bash
git add web/src
git commit -m "feat: build prompt gallery studio ui"
```

## Task 9: Connect Frontend To Supabase

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/types.ts`

- [ ] **Step 1: Add Supabase load and upload behavior**

Modify `web/src/App.tsx` to replace `sampleCases` with Supabase data loading. Use this implementation body:

```tsx
// Keep existing imports and add:
import { useEffect, useMemo, useState } from "react";
import { requestRecommendations, requestRewrite } from "./lib/apiClient";
import { supabase } from "./lib/supabaseClient";

// Inside App:
const [cases, setCases] = useState<PromptCase[]>([]);
const [sourceImagePath, setSourceImagePath] = useState<string | null>(null);
const [recommendationQuery, setRecommendationQuery] = useState<string | null>(null);
const [recommendedCaseNumbers, setRecommendedCaseNumbers] = useState<number[]>([]);
const [errorMessage, setErrorMessage] = useState<string | null>(null);

useEffect(() => {
  async function loadCases() {
    const { data, error } = await supabase
      .from("prompt_cases")
      .select("*, categories(name)")
      .order("case_number");

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setCases(
      (data ?? []).map((row) => ({
        ...row,
        category_name: row.categories?.name ?? ""
      })) as PromptCase[]
    );
  }

  void loadCases();
}, []);

async function uploadExperimentImage(kind: "source" | "result", file: File) {
  const storagePath = `${kind}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage
    .from("experiment-images")
    .upload(storagePath, file, { upsert: false });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from("experiment-images").getPublicUrl(storagePath);
  return { storagePath, publicUrl: data.publicUrl };
}
```

Wire handlers:

```tsx
onSourceSelected={async (file) => {
  const upload = await uploadExperimentImage("source", file);
  setSourceImagePath(upload.storagePath);
  setSourceImageUrl(upload.publicUrl);
  setResultImageUrl(null);
  setRewriteResult(null);
}}
onRecommend={async () => {
  if (!sourceImagePath) return;
  const recommendations = await requestRecommendations({
    source_image_storage_path: sourceImagePath,
    user_query: query,
    category_filter: selectedCategory === "全部" ? null : selectedCategory,
    cases: cases.map((promptCase) => ({
      case_number: promptCase.case_number,
      title: promptCase.title,
      category: promptCase.category_name,
      summary: promptCase.summary,
      tags: promptCase.tags,
      prompt_excerpt: promptCase.prompt_text.slice(0, 180),
      image_storage_path: promptCase.image_storage_path
    }))
  });
  setRecommendationQuery(query);
  setRecommendedCaseNumbers(recommendations.map((item) => item.case_number));
}}
onRewrite={async () => {
  if (!sourceImagePath || !selectedCase) return;
  setIsRewriting(true);
  try {
    const result = await requestRewrite({
    source_image_storage_path: sourceImagePath,
      case_number: selectedCase.case_number,
      original_prompt_text: selectedCase.prompt_text
    });
    setRewriteResult(result);
    setActivePromptTab("rewrite");
  } finally {
    setIsRewriting(false);
  }
}}
onResultSelected={async (file) => {
  if (!sourceImagePath || !selectedCase || !rewriteResult) return;
  const upload = await uploadExperimentImage("result", file);
  setResultImageUrl(upload.publicUrl);
  const { error } = await supabase.from("experiments").insert({
    source_image_storage_path: sourceImagePath,
    result_image_storage_path: upload.storagePath,
    prompt_case_id: selectedCase.id,
    original_prompt_text: selectedCase.prompt_text,
    rewritten_prompt_text: rewriteResult.rewritten_prompt_text,
    recommendation_query: recommendationQuery
  });
  if (error) {
    setErrorMessage(error.message);
  }
}}
```

- [ ] **Step 2: Show error state**

In the top of the `StudioLayout` render or `App` wrapper, display:

```tsx
{errorMessage && (
  <div className="fixed left-4 top-4 z-50 rounded-lg border border-rose-300/30 bg-rose-950 px-4 py-3 text-sm text-rose-100">
    {errorMessage}
  </div>
)}
```

- [ ] **Step 3: Build connected app**

Run:

```bash
cd web
npm run build
```

Expected: build passes.

- [ ] **Step 4: Commit Supabase connection**

```bash
git add web/src/App.tsx web/src/types.ts
git commit -m "feat: connect studio to supabase data"
```

## Task 10: End-To-End Local Smoke Test

**Files:**
- Modify only if failures reveal bugs in files created by earlier tasks.

- [ ] **Step 1: Start services**

Run terminal 1:

```bash
cd web
npm run server
```

Expected:

```text
Local Codex Bridge listening on http://127.0.0.1:8787
```

Run terminal 2:

```bash
cd web
npm run dev
```

Expected Vite local URL, usually:

```text
http://127.0.0.1:5173/
```

- [ ] **Step 2: Browser smoke test**

Open:

```text
http://127.0.0.1:5173/
```

Verify:

- Gallery cards load from Supabase.
- `推荐` is disabled before Source Image upload.
- `改写` is disabled before Source Image upload and case selection.
- `Result Image` upload is disabled before rewrite.
- Uploading Source Image enables `推荐`.
- Enter `我希望给我上传的图片搞一个搞怪的生成方案`.
- Clicking `推荐` returns six marked recommendations.
- Clicking a card fills `原始 Prompt`.
- Clicking `改写` fills `改写 Prompt`.
- Result upload becomes enabled.
- Uploading Result Image creates a row in `experiments`.

- [ ] **Step 3: Verification commands**

Run:

```bash
cd web
npm test
npm run build
SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" npm run validate:gallery
```

Expected: tests pass, build passes, gallery validation prints 13 categories and 352 prompt cases.

- [ ] **Step 4: Commit smoke-test fixes**

If code was changed during smoke testing:

```bash
git add web
git commit -m "fix: complete prompt gallery smoke test"
```

If no code was changed, do not create an empty commit.

## Task 11: Prepare Archive And Cleanup Proposal

**Files:**
- Create: `archive/prompt-gallery-source-2026-05-02.zip`
- Create: `docs/superpowers/plans/2026-05-02-prompt-gallery-cleanup-checklist.md`

- [ ] **Step 1: Create source archive**

Run:

```bash
mkdir -p archive
zip -r archive/prompt-gallery-source-2026-05-02.zip index.md gallery*.md assets
unzip -l archive/prompt-gallery-source-2026-05-02.zip | head -40
```

Expected: archive lists `index.md`, `gallery*.md`, and `assets/case*.jpg`.

- [ ] **Step 2: Write cleanup checklist**

Create `docs/superpowers/plans/2026-05-02-prompt-gallery-cleanup-checklist.md`:

```markdown
# Prompt Gallery Cleanup Checklist

Deletion is blocked until the user confirms this exact list.

Archive created:

- `archive/prompt-gallery-source-2026-05-02.zip`

Candidate cleanup after confirmation:

- `gallery1.md` through `gallery13.md`
- `assets/`
- `learn/`

Do not delete:

- `docs/superpowers/specs/2026-05-02-prompt-gallery-web-design.md`
- `docs/superpowers/plans/2026-05-02-prompt-gallery-web-implementation.md`
- `web/`
- `.codex/skills/`
- `tools/update_codex_plugin_catalog.py`
- `data/codex-plugins/`
```

- [ ] **Step 3: Commit archive and checklist**

```bash
git add archive/prompt-gallery-source-2026-05-02.zip docs/superpowers/plans/2026-05-02-prompt-gallery-cleanup-checklist.md
git commit -m "chore: archive prompt gallery source files"
```

- [ ] **Step 4: Stop before deletion**

Do not delete anything in this task. Ask the user to confirm the cleanup checklist before any removal.

## Final Verification Before Completion

Run:

```bash
git status --short
cd web
npm test
npm run build
SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" npm run validate:gallery
```

Expected:

- No unexpected tracked changes outside the active task.
- Tests pass.
- Build passes.
- Gallery validation passes.
- `learn/my-app` changes remain untouched unless the user explicitly asks to clean them later.
