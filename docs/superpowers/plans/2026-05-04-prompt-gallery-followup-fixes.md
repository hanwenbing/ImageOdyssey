# Prompt Gallery Follow-up Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the merged Prompt Gallery Studio review issues, add Supabase workflow diagnostics, clean JSON-like prompt data into natural-language prompts, and submit the work as a new PR.

**Architecture:** Keep the browser as a Supabase read client for public gallery data only, and route all private writes and diagnostics through the local Express server using the service role client. Add one focused workflow logging module, keep UI changes inside the current Studio component boundary, and update local `gallery*.md` sources before re-importing Supabase data so prompt cleanup is durable.

**Tech Stack:** React 19, TypeScript, Vite, Express, Zod, Multer, Supabase JS, Supabase SQL migrations, Vitest, Codex CLI via `@openai/codex`.

---

## File Structure

Create:

- `web/supabase/migrations/0003_workflow_events.sql` - creates the diagnostics table, indexes, and RLS posture.
- `web/server/workflowEvents.ts` - request id generation, event payload normalization, and service-role insert helper.
- `web/server/__tests__/workflowEvents.test.ts` - unit tests for event creation, payload preservation, insert failure behavior.
- `web/scripts/scanJsonLikePrompts.ts` - scans local `gallery*.md` prompt fences for JSON-like text and prints selected sample candidates.
- `web/scripts/__tests__/scanJsonLikePrompts.test.ts` - tests the scanner on representative markdown snippets.
- `run-web-dev.cmd` - root-level Windows startup script for `web` dev server and Vite.

Modify:

- `web/server/routes.ts` - route-level workflow logging, `/api/workflow-events`, stronger recommend/rewrite validation errors.
- `web/server/__tests__/routes.test.ts` - route tests for logging on success/failure and frontend event route validation.
- `web/server/codexBridge.ts` - rewrite prompt wording and validation that user-visible rewritten prompt is natural-language text.
- `web/server/__tests__/codexBridge.test.ts` - tests for rewritten prompt JSON-like rejection and error messages.
- `web/src/lib/apiClient.ts` - translate local API connection failures and add `logWorkflowEvent()`.
- `web/src/__tests__/apiClient.test.ts` - tests local API unavailable message and frontend workflow event posting.
- `web/src/App.tsx` - fixed viewport layout, prompt drawer, actionable blocked clicks, frontend event logging, hover overlay.
- `web/src/__tests__/App.test.tsx` - UI behavior, blocked event logging, drawer behavior, 6 recommendations.
- `web/src/components/ImageUploadPanel.tsx` - optional helper copy.
- `web/src/test/setup.ts` - add `crypto.randomUUID` mock support if the test runtime lacks it.
- `web/package.json` - add `scan:json-prompts`.
- `gallery*.md` - after user approves 5 samples, replace JSON-like prompt fences with natural-language Chinese prompt text.

Do not modify:

- `learn/my-app`.
- `assets/` images.
- `index.md` except if a later validation proves prompt cleanup requires index metadata changes. Expected result: no `index.md` change.

### Task 1: Workflow Events Migration

**Files:**
- Create: `web/supabase/migrations/0003_workflow_events.sql`
- Modify: `web/supabase/schema.sql` if this repo keeps schema snapshots in sync

- [ ] **Step 1: Write migration SQL**

Create `web/supabase/migrations/0003_workflow_events.sql` with:

```sql
create table if not exists public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  workflow text not null,
  stage text not null,
  status text not null,
  message text null,
  request_payload jsonb null,
  response_payload jsonb null,
  error_payload jsonb null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  constraint workflow_events_workflow_not_blank check (btrim(workflow) <> ''),
  constraint workflow_events_stage_not_blank check (btrim(stage) <> ''),
  constraint workflow_events_status_allowed check (
    status in ('started', 'succeeded', 'failed', 'blocked')
  )
);

create index if not exists workflow_events_created_at_idx
  on public.workflow_events (created_at desc);

create index if not exists workflow_events_request_id_idx
  on public.workflow_events (request_id);

create index if not exists workflow_events_workflow_created_at_idx
  on public.workflow_events (workflow, created_at desc);

create index if not exists workflow_events_status_created_at_idx
  on public.workflow_events (status, created_at desc);

alter table public.workflow_events enable row level security;

revoke all on table public.workflow_events from anon;
revoke all on table public.workflow_events from authenticated;
```

- [ ] **Step 2: Apply migration through Supabase connector**

Use the Supabase MCP migration tool on project `tqjwmnkmbubephgtospx` with migration name:

```text
workflow_events
```

Expected: migration applies successfully.

- [ ] **Step 3: Verify table and RLS**

Run this SQL through Supabase connector:

```sql
select
  c.relrowsecurity as rls_enabled,
  count(p.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname = 'workflow_events'
group by c.relrowsecurity;
```

Expected:

```text
rls_enabled = true
policy_count = 0
```

- [ ] **Step 4: Commit migration**

Run:

```cmd
git add web/supabase/migrations/0003_workflow_events.sql web/supabase/schema.sql
git commit -m "feat: add workflow event diagnostics table"
```

If `web/supabase/schema.sql` did not change, omit it from `git add`.

### Task 2: Server Workflow Event Helper

**Files:**
- Create: `web/server/workflowEvents.ts`
- Create: `web/server/__tests__/workflowEvents.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `web/server/__tests__/workflowEvents.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  createRequestId,
  logWorkflowEvent,
  type WorkflowEventInsert
} from "../workflowEvents";

function createClient(insertResult: { error: unknown }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn((tableName: string) => {
    expect(tableName).toBe("workflow_events");
    return { insert };
  });

  return { from, insert };
}

describe("workflowEvents", () => {
  it("creates non-empty request ids", () => {
    const first = createRequestId();
    const second = createRequestId();

    expect(first).toMatch(/^wf_[a-f0-9-]+$/);
    expect(second).toMatch(/^wf_[a-f0-9-]+$/);
    expect(second).not.toBe(first);
  });

  it("inserts workflow events through the provided client", async () => {
    const client = createClient({ error: null });
    const event: WorkflowEventInsert = {
      request_id: "wf_test",
      workflow: "recommend",
      stage: "request_received",
      status: "started",
      message: "received recommend request",
      request_payload: { source_image_storage_path: "source/a.png" },
      response_payload: null,
      error_payload: null,
      metadata: { route: "/api/recommend" }
    };

    await logWorkflowEvent(client.from as never, event);

    expect(client.insert).toHaveBeenCalledWith(event);
  });

  it("does not throw when diagnostics insert fails", async () => {
    const client = createClient({ error: new Error("insert failed") });

    await expect(logWorkflowEvent(client.from as never, {
      request_id: "wf_test",
      workflow: "rewrite",
      stage: "codex_exec",
      status: "failed",
      message: "codex failed",
      request_payload: null,
      response_payload: null,
      error_payload: { message: "codex failed" },
      metadata: null
    })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run helper test to verify it fails**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- server/__tests__/workflowEvents.test.ts
```

Expected: FAIL because `web/server/workflowEvents.ts` does not exist.

- [ ] **Step 3: Implement helper**

Create `web/server/workflowEvents.ts`:

```ts
import crypto from "node:crypto";

export type WorkflowEventStatus = "started" | "succeeded" | "failed" | "blocked";

export type WorkflowEventInsert = {
  request_id: string;
  workflow: string;
  stage: string;
  status: WorkflowEventStatus;
  message: string | null;
  request_payload: unknown | null;
  response_payload: unknown | null;
  error_payload: unknown | null;
  metadata: unknown | null;
};

type WorkflowEventsTable = {
  insert: (value: WorkflowEventInsert) => PromiseLike<{ error: unknown }>;
};

type SupabaseFrom = (tableName: "workflow_events") => WorkflowEventsTable;

export function createRequestId(): string {
  return `wf_${crypto.randomUUID()}`;
}

export function errorPayload(error: unknown): { message: string; name?: string } {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }

  return { message: String(error) };
}

export async function logWorkflowEvent(
  from: SupabaseFrom,
  event: WorkflowEventInsert
): Promise<void> {
  try {
    const { error } = await from("workflow_events").insert(event);
    if (error) {
      console.error("workflow event insert failed", error);
    }
  } catch (error) {
    console.error("workflow event insert threw", error);
  }
}
```

- [ ] **Step 4: Run helper test**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- server/__tests__/workflowEvents.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit helper**

Run:

```cmd
git add web/server/workflowEvents.ts web/server/__tests__/workflowEvents.test.ts
git commit -m "feat: add workflow event logger"
```

### Task 3: Server Route Diagnostics

**Files:**
- Modify: `web/server/routes.ts`
- Modify: `web/server/__tests__/routes.test.ts`

- [ ] **Step 1: Add failing route tests for `/api/workflow-events`**

In `web/server/__tests__/routes.test.ts`, add a mock service role client with `from("workflow_events").insert(...)`. Add tests:

```ts
it("accepts frontend workflow events and writes them with service role", async () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const app = createApp({
    getServiceRoleClient: () => ({
      from: vi.fn(() => ({ insert }))
    }) as never
  });

  const response = await request(app)
    .post("/api/workflow-events")
    .send({
      request_id: "wf_client",
      workflow: "frontend",
      stage: "recommend_blocked",
      status: "blocked",
      message: "Source image is required",
      request_payload: { reason: "missing_source" },
      response_payload: null,
      error_payload: null,
      metadata: { component: "App" }
    });

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ok: true });
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
    request_id: "wf_client",
    workflow: "frontend",
    stage: "recommend_blocked",
    status: "blocked"
  }));
});

it("rejects invalid frontend workflow events", async () => {
  const app = createApp({
    getServiceRoleClient: () => ({
      from: vi.fn(() => ({ insert: vi.fn() }))
    }) as never
  });

  const response = await request(app)
    .post("/api/workflow-events")
    .send({
      request_id: "",
      workflow: "frontend",
      stage: "recommend_blocked",
      status: "ignored"
    });

  expect(response.status).toBe(400);
  expect(response.body.error).toBeTruthy();
});
```

- [ ] **Step 2: Add failing tests for route success/failure logging**

Add route tests for recommend:

```ts
it("logs recommend success and returns recommendations", async () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const app = createApp({
    recommend: vi.fn().mockResolvedValue({
      recommendations: [1, 2, 3, 4, 5, 6].map((caseNumber) => ({
        case_number: caseNumber,
        reason: `reason ${caseNumber}`
      }))
    }),
    getServiceRoleClient: () => ({
      from: vi.fn(() => ({ insert }))
    }) as never
  });

  const response = await request(app)
    .post("/api/recommend")
    .send(validRecommendRequest());

  expect(response.status).toBe(200);
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
    workflow: "recommend",
    stage: "request_received",
    status: "started"
  }));
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
    workflow: "recommend",
    stage: "response_sent",
    status: "succeeded"
  }));
});

it("logs recommend failures before returning an error", async () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const app = createApp({
    recommend: vi.fn().mockRejectedValue(new Error("Codex command failed")),
    getServiceRoleClient: () => ({
      from: vi.fn(() => ({ insert }))
    }) as never
  });

  const response = await request(app)
    .post("/api/recommend")
    .send(validRecommendRequest());

  expect(response.status).toBe(500);
  expect(response.body.error).toMatch(/Codex command failed/);
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
    workflow: "recommend",
    stage: "route_error",
    status: "failed",
    error_payload: expect.objectContaining({ message: "Codex command failed" })
  }));
});
```

If `validRecommendRequest()` does not exist, define it in the test file with 6 case index items matching `server/types`.

- [ ] **Step 3: Run route tests to verify failure**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- server/__tests__/routes.test.ts
```

Expected: FAIL because route logging and `/api/workflow-events` are not implemented.

- [ ] **Step 4: Implement route logging**

In `web/server/routes.ts`:

1. Import:

```ts
import {
  createRequestId,
  errorPayload,
  logWorkflowEvent,
  type WorkflowEventInsert
} from "./workflowEvents";
```

2. Add Zod schema:

```ts
const workflowEventSchema = z.object({
  request_id: z.string().min(1),
  workflow: z.string().min(1),
  stage: z.string().min(1),
  status: z.enum(["started", "succeeded", "failed", "blocked"]),
  message: z.string().nullable(),
  request_payload: z.unknown().nullable(),
  response_payload: z.unknown().nullable(),
  error_payload: z.unknown().nullable(),
  metadata: z.unknown().nullable()
});
```

3. Add local helper inside `createRouter()` after resolving `getServiceRoleClient`:

```ts
async function writeWorkflowEvent(event: WorkflowEventInsert): Promise<void> {
  const client = getServiceRoleClient();
  await logWorkflowEvent(client.from.bind(client) as never, event);
}
```

4. Wrap `/api/recommend`:

```ts
const requestId = createRequestId();
await writeWorkflowEvent({
  request_id: requestId,
  workflow: "recommend",
  stage: "request_received",
  status: "started",
  message: "recommend request received",
  request_payload: parsedRequest.data,
  response_payload: null,
  error_payload: null,
  metadata: { route: "/api/recommend" }
});

try {
  const result = await recommend(parsedRequest.data);
  await writeWorkflowEvent({
    request_id: requestId,
    workflow: "recommend",
    stage: "response_sent",
    status: "succeeded",
    message: "recommend response sent",
    request_payload: parsedRequest.data,
    response_payload: result,
    error_payload: null,
    metadata: { recommendation_count: result.recommendations.length }
  });
  response.json(result);
} catch (error) {
  await writeWorkflowEvent({
    request_id: requestId,
    workflow: "recommend",
    stage: "route_error",
    status: "failed",
    message: "recommend request failed",
    request_payload: parsedRequest.data,
    response_payload: null,
    error_payload: errorPayload(error),
    metadata: { route: "/api/recommend" }
  });
  handleRouteError(response, error);
}
```

5. Apply the same pattern to `/api/rewrite`, `/api/experiment-images`, and `/api/experiments`, changing `workflow` and metadata names.

6. Add `/api/workflow-events`:

```ts
router.post(
  "/api/workflow-events",
  toAsyncHandler(async (request, response) => {
    const parsedRequest = workflowEventSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      response.status(400).json({ error: firstValidationErrorMessage(parsedRequest.error) });
      return;
    }

    await writeWorkflowEvent(parsedRequest.data);
    response.json({ ok: true });
  })
);
```

- [ ] **Step 5: Run route tests**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- server/__tests__/routes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit route diagnostics**

Run:

```cmd
git add web/server/routes.ts web/server/__tests__/routes.test.ts
git commit -m "feat: log prompt gallery workflow events"
```

### Task 4: API Client Errors And Frontend Event Posting

**Files:**
- Modify: `web/src/lib/apiClient.ts`
- Modify: `web/src/__tests__/apiClient.test.ts`

- [ ] **Step 1: Write failing API client tests**

In `web/src/__tests__/apiClient.test.ts`, add:

```ts
import { logWorkflowEvent, requestRecommendations } from "../lib/apiClient";

it("translates local API connection failures into actionable guidance", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

  await expect(requestRecommendations(validRecommendRequest())).rejects.toThrow(
    /本地 API 未连接。请运行 run-web-dev.cmd 或 npm -C web run dev:all。/
  );
});

it("posts frontend workflow events", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  );

  await logWorkflowEvent({
    request_id: "wf_client",
    workflow: "frontend",
    stage: "recommend_blocked",
    status: "blocked",
    message: "Source image is required",
    request_payload: { reason: "missing_source" },
    response_payload: null,
    error_payload: null,
    metadata: { component: "App" }
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/workflow-events",
    expect.objectContaining({ method: "POST" })
  );
});
```

If `validRecommendRequest()` is not already in this test file, add a local helper returning 6 cases with `category_name`.

- [ ] **Step 2: Run API client tests to verify failure**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- src/__tests__/apiClient.test.ts
```

Expected: FAIL because no `logWorkflowEvent()` and no connection failure translation exist.

- [ ] **Step 3: Implement API client changes**

In `web/src/lib/apiClient.ts`:

1. Add type:

```ts
export type ClientWorkflowEvent = {
  request_id: string;
  workflow: string;
  stage: string;
  status: "started" | "succeeded" | "failed" | "blocked";
  message: string | null;
  request_payload: unknown | null;
  response_payload: unknown | null;
  error_payload: unknown | null;
  metadata: unknown | null;
};
```

2. Add error translation:

```ts
function normalizeFetchError(error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error("本地 API 未连接。请运行 run-web-dev.cmd 或 npm -C web run dev:all。", {
      cause: error
    });
  }

  return error instanceof Error ? error : new Error(String(error));
}
```

3. Wrap `fetch()` calls in `postJson()` and `uploadExperimentImage()`:

```ts
let response: Response;
try {
  response = await fetch(path, { ... });
} catch (error) {
  throw normalizeFetchError(error);
}
```

4. Add:

```ts
export async function logWorkflowEvent(event: ClientWorkflowEvent): Promise<void> {
  await postJson<{ ok: true }>("/api/workflow-events", event);
}
```

- [ ] **Step 4: Run API client tests**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- src/__tests__/apiClient.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit API client changes**

Run:

```cmd
git add web/src/lib/apiClient.ts web/src/__tests__/apiClient.test.ts
git commit -m "feat: report frontend workflow events"
```

### Task 5: Codex Bridge Rewrite Validation

**Files:**
- Modify: `web/server/codexBridge.ts`
- Modify: `web/server/__tests__/codexBridge.test.ts`

- [ ] **Step 1: Write failing tests for JSON-like rewritten prompts**

In `web/server/__tests__/codexBridge.test.ts`, add:

```ts
it("rejects rewritten prompt text that is JSON-like", async () => {
  const child = createMockChildProcess();
  spawnMock.mockReturnValue(child);

  const promise = rewrite({
    source_image_storage_path: "source/source.jpg",
    case_number: loadLocalCaseIndex()[0].case_number,
    original_prompt_text: "Original prompt text"
  }, { resolveSourceImagePath: createResolveSourceImagePathMock() });

  await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
  child.stdout.emit(
    "data",
    Buffer.from(JSON.stringify({
      rewritten_prompt_text: "{\"type\":\"portrait\"}",
      preserved_parts: ["style"],
      changed_parts: ["subject"]
    }))
  );
  child.emit("close", 0, null);

  await expect(promise).rejects.toThrow(/rewritten_prompt_text must be natural-language prompt text/i);
});

it("asks Codex for natural-language rewritten prompt text", async () => {
  const child = createMockChildProcess();
  spawnMock.mockReturnValue(child);

  const promise = rewrite({
    source_image_storage_path: "source/source.jpg",
    case_number: loadLocalCaseIndex()[0].case_number,
    original_prompt_text: "Original prompt text"
  }, { resolveSourceImagePath: createResolveSourceImagePathMock() });

  await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
  const prompt = child.stdin.write.mock.calls[0][0] as string;

  expect(prompt).toContain("rewritten_prompt_text");
  expect(prompt).toContain("natural-language Chinese prompt text");
  expect(prompt).toContain("Do not put JSON");

  child.stdout.emit(
    "data",
    Buffer.from(JSON.stringify({
      rewritten_prompt_text: "一张自然语言中文提示词。",
      preserved_parts: ["style"],
      changed_parts: ["subject"]
    }))
  );
  child.emit("close", 0, null);

  await expect(promise).resolves.toMatchObject({
    rewritten_prompt_text: "一张自然语言中文提示词。"
  });
});
```

- [ ] **Step 2: Run Codex bridge tests to verify failure**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- server/__tests__/codexBridge.test.ts
```

Expected: FAIL because validation/prompt wording is missing.

- [ ] **Step 3: Implement natural-language validation**

In `web/server/codexBridge.ts`, add:

```ts
function looksLikeStructuredPromptText(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return true;
  }

  if (/^```/.test(trimmed)) {
    return true;
  }

  return /^\s*"(type|subject|style|prompt|layout)"\s*:/.test(trimmed);
}
```

Update `parseRewriteResponse()` after `rewrittenPromptText`:

```ts
if (looksLikeStructuredPromptText(rewrittenPromptText)) {
  throw new Error("rewritten_prompt_text must be natural-language prompt text");
}
```

Update `buildRewritePrompt()` lines:

```ts
"The rewritten_prompt_text value must be natural-language Chinese prompt text that can be copied directly into ChatGPT / GPT Image 2.",
"Do not put JSON, Markdown code fences, key-value objects, or schema-like prompt text inside rewritten_prompt_text.",
```

- [ ] **Step 4: Run Codex bridge tests**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- server/__tests__/codexBridge.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Codex bridge validation**

Run:

```cmd
git add web/server/codexBridge.ts web/server/__tests__/codexBridge.test.ts
git commit -m "fix: require natural language rewrite output"
```

### Task 6: Studio UI Layout, Drawer, Upload Copy, Hover

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/ImageUploadPanel.tsx`
- Modify: `web/src/__tests__/App.test.tsx`

- [ ] **Step 1: Write failing ImageUploadPanel helper test**

If `ImageUploadPanel` has no direct test file, add assertions through `App.test.tsx`:

```ts
expect(screen.queryByText("上传参考图，推荐和改写都会围绕它展开")).not.toBeInTheDocument();
expect(screen.queryByText("完成改写后上传生成结果，系统会自动保存实验记录")).not.toBeInTheDocument();
```

Add these after the app finishes loading gallery data.

- [ ] **Step 2: Write failing drawer behavior tests**

In `web/src/__tests__/App.test.tsx`, add:

```ts
expect(screen.getByRole("button", { name: /展开 Prompt/i })).toBeInTheDocument();
expect(screen.queryByDisplayValue(/先选择一个案例/)).not.toBeInTheDocument();

await user.click(screen.getByRole("button", { name: /Case 101/i }));

expect(screen.getByDisplayValue(/原始 Prompt/)).toBeInTheDocument();
expect(screen.getByRole("button", { name: /收起 Prompt/i })).toBeInTheDocument();
```

Use the actual localized accessible names implemented in `App.tsx`. If the current test gallery case has a different case number, use that number.

- [ ] **Step 3: Write failing blocked click logging test**

In `App.test.tsx`, mock `logWorkflowEvent` from `src/lib/apiClient` and add:

```ts
await user.click(screen.getByRole("button", { name: "推荐" }));

expect(logWorkflowEventMock).toHaveBeenCalledWith(expect.objectContaining({
  workflow: "frontend",
  stage: "recommend_blocked",
  status: "blocked"
}));
expect(screen.getByText(/请先上传 Source Image/)).toBeInTheDocument();
```

- [ ] **Step 4: Run App tests to verify failure**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- src/__tests__/App.test.tsx
```

Expected: FAIL because UI behavior is not implemented.

- [ ] **Step 5: Make helper optional**

In `web/src/components/ImageUploadPanel.tsx`, change:

```ts
helper: string;
```

to:

```ts
helper?: string;
```

Render helper only when present:

```tsx
{helper && <p className="mt-1 text-xs text-zinc-400">{helper}</p>}
```

- [ ] **Step 6: Implement fixed viewport layout**

In `web/src/App.tsx`, change root structure:

```tsx
<main className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-50">
```

Use a content wrapper like:

```tsx
<div className="mx-auto grid h-full min-h-0 w-full max-w-[1800px] grid-cols-1 gap-4 p-4 pb-16 xl:grid-cols-[360px_minmax(0,1fr)]">
```

For left upload rail:

```tsx
<section className="grid min-h-0 grid-rows-2 gap-4 overflow-hidden">
```

For right side:

```tsx
<section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
```

For Gallery grid:

```tsx
<div className="min-h-0 flex-1 overflow-y-auto pr-1">
```

- [ ] **Step 7: Implement prompt drawer state**

Add state:

```tsx
const [promptDrawerOpen, setPromptDrawerOpen] = useState(false);
```

When selecting a case:

```tsx
setSelectedCaseId(nextCase.id);
setPromptDrawerOpen(true);
```

When source image changes:

```tsx
setPromptDrawerOpen(false);
```

When rewrite succeeds:

```tsx
setRewriteResult(result);
setActivePromptTab("rewrite");
setPromptDrawerOpen(true);
```

Implement drawer button labels:

```tsx
aria-label={promptDrawerOpen ? "收起 Prompt" : "展开 Prompt"}
```

Collapsed drawer only renders title/status/control. Expanded drawer renders tabs, textarea, and rewrite button.

- [ ] **Step 8: Implement actionable blocked clicks**

Replace hard-disabled recommend/rewrite/result action handling with click handlers that explain blocked reasons:

```ts
function getRecommendBlockedReason(): string | null {
  if (!sourceStoragePath) return "请先上传 Source Image。";
  if (sourceUploadBusy) return "Source Image 正在上传，请稍后再推荐。";
  if (recommendBusy) return "推荐正在进行中。";
  if (filteredCases.length < 6) return "当前候选案例少于 6 条，请放宽搜索或分类条件。";
  return null;
}
```

Use `aria-disabled={Boolean(getRecommendBlockedReason())}` and on click:

```ts
const blockedReason = getRecommendBlockedReason();
if (blockedReason) {
  setErrorMessage(blockedReason);
  void logWorkflowEvent({
    request_id: createClientRequestId(),
    workflow: "frontend",
    stage: "recommend_blocked",
    status: "blocked",
    message: blockedReason,
    request_payload: { query, selectedCategory, sourceStoragePath },
    response_payload: null,
    error_payload: null,
    metadata: { component: "App" }
  });
  return;
}
```

Define local request id helper in `App.tsx`:

```ts
function createClientRequestId(): string {
  return `client_${crypto.randomUUID()}`;
}
```

If `crypto.randomUUID()` is unavailable in tests, mock it in `web/src/test/setup.ts`.

- [ ] **Step 9: Implement hover overlay**

In `CaseCard`, remove the persistent bottom block. Keep image and badges, then add:

```tsx
<div className="pointer-events-none absolute inset-0 flex items-end bg-zinc-950/65 p-3 opacity-0 transition duration-200 group-hover:opacity-100">
  <div className="min-w-0">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-white">Case {promptCase.case_number}</span>
      {recommended && (
        <span className="rounded bg-cyan-300 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-950">
          推荐
        </span>
      )}
    </div>
    <div className="mt-1 text-[11px] text-zinc-300">{promptCase.category_name}</div>
    <div className="mt-1 line-clamp-2 text-sm text-zinc-100">{promptCase.title}</div>
    <div className="mt-2 text-xs text-cyan-200">点击选择</div>
  </div>
</div>
```

Keep selected border and top recommended badge if needed for non-hover state.

- [ ] **Step 10: Run App tests**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- src/__tests__/App.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Commit UI changes**

Run:

```cmd
git add web/src/App.tsx web/src/components/ImageUploadPanel.tsx web/src/__tests__/App.test.tsx web/src/test/setup.ts
git commit -m "fix: refine prompt gallery studio interactions"
```

### Task 7: Windows Startup Script

**Files:**
- Create: `run-web-dev.cmd`

- [ ] **Step 1: Add startup script**

Create `run-web-dev.cmd`:

```bat
@echo off
setlocal

set "OFFICIAL_NPM=C:\Program Files\nodejs\npm.cmd"

if exist "%OFFICIAL_NPM%" (
  "%OFFICIAL_NPM%" -C web run dev:all
  goto :done
)

where npm.cmd >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  npm.cmd -C web run dev:all
  goto :done
)

echo Node.js npm was not found.
echo Install official Node.js LTS from https://nodejs.org/ and run this script again.

:done
if not "%ERRORLEVEL%"=="0" (
  echo.
  echo Dev server exited with code %ERRORLEVEL%.
)
pause
endlocal
```

- [ ] **Step 2: Smoke check script syntax**

Run:

```cmd
cmd /c run-web-dev.cmd
```

Expected: starts `npm -C web run dev:all`. Stop it with `Ctrl+C` after confirming both server and Vite start. Do not leave the dev server running at this task boundary.

- [ ] **Step 3: Commit startup script**

Run:

```cmd
git add run-web-dev.cmd
git commit -m "chore: add Windows web dev launcher"
```

### Task 8: JSON-like Prompt Scanner And Five Samples

**Files:**
- Create: `web/scripts/scanJsonLikePrompts.ts`
- Create: `web/scripts/__tests__/scanJsonLikePrompts.test.ts`
- Modify: `web/package.json`

- [ ] **Step 1: Write scanner tests**

Create `web/scripts/__tests__/scanJsonLikePrompts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  classifyJsonLikePrompt,
  findJsonLikePromptCasesInMarkdown
} from "../scanJsonLikePrompts";

const markdown = `
<a id="case-1"></a>
### Case 1：简单对象
![x](assets/case1.jpg)
**提示词：**
\`\`\`text
{"type":"poster","subject":"robot"}
\`\`\`

<a id="case-2"></a>
### Case 2：自然语言
![x](assets/case2.jpg)
**提示词：**
\`\`\`text
一张自然语言提示词。
\`\`\`
`;

describe("scanJsonLikePrompts", () => {
  it("finds prompt fences that start with JSON-like braces", () => {
    expect(findJsonLikePromptCasesInMarkdown("gallery.md", markdown)).toEqual([
      expect.objectContaining({
        case_number: 1,
        source_gallery_file: "gallery.md",
        prompt_text: "{\"type\":\"poster\",\"subject\":\"robot\"}"
      })
    ]);
  });

  it("classifies representative structures", () => {
    expect(classifyJsonLikePrompt("{\"type\":\"poster\"}")).toBe("simple_object");
    expect(classifyJsonLikePrompt("{\"layout\":{\"rows\":[1,2]}}")).toBe("nested_object");
    expect(classifyJsonLikePrompt("[{\"panel\":\"one\"}]")).toBe("array_structure");
    expect(classifyJsonLikePrompt("{“布局”：{ \"rows\": 3 }}")).toBe("mixed_punctuation");
    expect(classifyJsonLikePrompt("{\"subject\":\"{argument name=\\\"x\\\" default=\\\"y\\\"}\"}")).toBe("complex_placeholders");
  });
});
```

- [ ] **Step 2: Run scanner test to verify failure**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- scripts/__tests__/scanJsonLikePrompts.test.ts
```

Expected: FAIL because scanner does not exist.

- [ ] **Step 3: Implement scanner**

Create `web/scripts/scanJsonLikePrompts.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export type JsonLikePromptCase = {
  case_number: number;
  source_gallery_file: string;
  prompt_text: string;
  structure: string;
};

export function classifyJsonLikePrompt(promptText: string): string {
  const trimmed = promptText.trim();
  if (/\{argument name=|参数名称=/.test(trimmed)) return "complex_placeholders";
  if (/[“”]/.test(trimmed)) return "mixed_punctuation";
  if (trimmed.startsWith("[")) return "array_structure";
  if (/"[^"]+"\s*:\s*\{/.test(trimmed) || /"[^"]+"\s*:\s*\[/.test(trimmed)) {
    return "nested_object";
  }
  return "simple_object";
}

export function findJsonLikePromptCasesInMarkdown(
  sourceGalleryFile: string,
  markdown: string
): JsonLikePromptCase[] {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const pattern =
    /<a id="case-(\d+)"><\/a>[\s\S]*?\*\*提示词：\*\*(?:\s*\n\s*)*```text\s*\n([\s\S]*?)\n\s*```/g;
  const cases: JsonLikePromptCase[] = [];

  for (const match of normalized.matchAll(pattern)) {
    const promptText = match[2].trim();
    if (promptText.startsWith("{") || promptText.startsWith("[")) {
      cases.push({
        case_number: Number(match[1]),
        source_gallery_file: sourceGalleryFile,
        prompt_text: promptText,
        structure: classifyJsonLikePrompt(promptText)
      });
    }
  }

  return cases;
}

export function scanRepoForJsonLikePrompts(repoRoot: string): JsonLikePromptCase[] {
  const galleryFiles = readdirSync(repoRoot)
    .filter((fileName) => /^gallery\d*\.md$/.test(fileName))
    .sort((left, right) => left.localeCompare(right, "en"));

  return galleryFiles.flatMap((galleryFile) =>
    findJsonLikePromptCasesInMarkdown(
      galleryFile,
      readFileSync(resolve(repoRoot, galleryFile), "utf8")
    )
  );
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const repoRoot = resolve(process.cwd(), "..");
  const cases = scanRepoForJsonLikePrompts(repoRoot);
  console.log(JSON.stringify({
    count: cases.length,
    by_structure: cases.reduce<Record<string, number>>((counts, item) => {
      counts[item.structure] = (counts[item.structure] ?? 0) + 1;
      return counts;
    }, {}),
    samples: cases.slice(0, 20).map((item) => ({
      case_number: item.case_number,
      source_gallery_file: item.source_gallery_file,
      structure: item.structure,
      preview: item.prompt_text.slice(0, 240)
    }))
  }, null, 2));
}
```

Update `web/package.json` scripts:

```json
"scan:json-prompts": "tsx scripts/scanJsonLikePrompts.ts"
```

- [ ] **Step 4: Run scanner tests**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- scripts/__tests__/scanJsonLikePrompts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run scanner on repo**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web run scan:json-prompts
```

Expected: prints count and samples. Record the count in notes. It should be close to the known Supabase count of 93; if different, inspect whether Supabase has stale data or local markdown differs.

- [ ] **Step 6: Generate five sample rewrites with subagents**

Use `spawn_agent` with `agent_type: worker`, model `gpt-5.4-mini`, reasoning `medium`. Provide exactly one prompt case per agent or one agent with five cases if context is small.

Worker instruction:

```text
Rewrite this JSON-like GPT Image prompt into Chinese natural-language prompt text.
Rules:
- Preserve original semantic requirements, composition, visual style, layout, text requirements, and parameter placeholders.
- Keep useful placeholders such as {argument name="..." default="..."}.
- Do not add new subjects, scenes, styles, or requirements.
- Do not output JSON, Markdown code fences, tables, or key-value objects.
- Output only the rewritten prompt text and a one-sentence note of what structure was flattened.
```

Select one sample for each structure:

```text
simple_object
nested_object
array_structure
mixed_punctuation
complex_placeholders
```

- [ ] **Step 7: Present samples to user and wait**

Show the five samples in chat with:

```text
Case N / structure / original preview / rewritten prompt
```

Do not modify `gallery*.md` or Supabase before user confirms sample style.

- [ ] **Step 8: Commit scanner only**

Run:

```cmd
git add web/scripts/scanJsonLikePrompts.ts web/scripts/__tests__/scanJsonLikePrompts.test.ts web/package.json web/package-lock.json
git commit -m "chore: add prompt JSON scan tool"
```

If `package-lock.json` did not change, omit it.

### Task 9: Bulk Prompt Cleanup After Sample Approval

**Files:**
- Modify: `gallery*.md` files containing approved JSON-like prompt replacements
- Create: `web/scripts/applyPromptRewrites.ts`
- Create: `web/scripts/__tests__/applyPromptRewrites.test.ts`

- [ ] **Step 1: Confirm sample approval**

Before doing this task, verify the user explicitly approved the five sample rewrite style in chat.

Expected user signal:

```text
确认样本风格，可以批量
```

Do not proceed without equivalent approval.

- [ ] **Step 2: Generate all remaining prompt rewrites with subagents**

Dispatch `gpt-5.4-mini` worker subagents in bounded batches. Each worker owns a disjoint set of case numbers and must return:

```json
[
  {
    "case_number": 17,
    "source_gallery_file": "gallery1.md",
    "rewritten_prompt_text": "自然语言中文提示词..."
  }
]
```

Worker instruction:

```text
You are rewriting JSON-like prompt text from ImageOdyssey gallery markdown into Chinese natural-language prompt text.
Output valid JSON only, an array of objects with case_number, source_gallery_file, rewritten_prompt_text.
Preserve original semantics, composition, layout, style, text requirements, and useful placeholders.
Do not add new subjects, scenes, styles, or requirements.
rewritten_prompt_text must not start with { or [ and must not be a Markdown code fence.
```

- [ ] **Step 3: Write failing replacement script tests**

Create `web/scripts/__tests__/applyPromptRewrites.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyPromptRewritesToMarkdown } from "../applyPromptRewrites";

const markdown = `
<a id="case-17"></a>
### Case 17：界面交互设计图
![x](assets/case17.jpg)
**提示词：**
\`\`\`text
{"type":"poster"}
\`\`\`
`;

describe("applyPromptRewrites", () => {
  it("replaces only the prompt fence for the target case", () => {
    const result = applyPromptRewritesToMarkdown(markdown, [
      {
        case_number: 17,
        rewritten_prompt_text: "一张自然语言中文提示词。"
      }
    ]);

    expect(result).toContain("<a id=\"case-17\"></a>");
    expect(result).toContain("### Case 17：界面交互设计图");
    expect(result).toContain("![x](assets/case17.jpg)");
    expect(result).toContain("一张自然语言中文提示词。");
    expect(result).not.toContain("{\"type\":\"poster\"}");
  });

  it("throws when a replacement case is missing", () => {
    expect(() =>
      applyPromptRewritesToMarkdown(markdown, [
        {
          case_number: 99,
          rewritten_prompt_text: "不会被写入。"
        }
      ])
    ).toThrow(/missing replacement target case 99/i);
  });
});
```

- [ ] **Step 4: Run replacement script tests to verify failure**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- scripts/__tests__/applyPromptRewrites.test.ts
```

Expected: FAIL because `applyPromptRewrites.ts` does not exist.

- [ ] **Step 5: Implement replacement script**

Create `web/scripts/applyPromptRewrites.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type PromptRewrite = {
  case_number: number;
  rewritten_prompt_text: string;
};

export function applyPromptRewritesToMarkdown(
  markdown: string,
  rewrites: PromptRewrite[]
): string {
  let nextMarkdown = markdown.replace(/\r\n?/g, "\n");

  for (const rewrite of rewrites) {
    const pattern = new RegExp(
      `(<a id="case-${rewrite.case_number}"><\\/a>[\\s\\S]*?\\*\\*提示词：\\*\\*(?:\\s*\\n\\s*)*\`\`\`text\\s*\\n)([\\s\\S]*?)(\\n\\s*\`\`\`)`
    );
    const before = nextMarkdown;
    nextMarkdown = nextMarkdown.replace(pattern, `$1${rewrite.rewritten_prompt_text.trim()}$3`);
    if (nextMarkdown === before) {
      throw new Error(`missing replacement target case ${rewrite.case_number}`);
    }
  }

  return nextMarkdown;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const rewritesPath = process.argv[2];
  if (!rewritesPath) {
    throw new Error("Usage: tsx scripts/applyPromptRewrites.ts <rewrites.json>");
  }

  const rewritesByFile = JSON.parse(readFileSync(rewritesPath, "utf8")) as Record<string, PromptRewrite[]>;
  const repoRoot = resolve(process.cwd(), "..");

  for (const [galleryFile, rewrites] of Object.entries(rewritesByFile)) {
    const filePath = resolve(repoRoot, galleryFile);
    const markdown = readFileSync(filePath, "utf8");
    writeFileSync(filePath, applyPromptRewritesToMarkdown(markdown, rewrites), "utf8");
  }
}
```

- [ ] **Step 6: Run replacement script tests**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test -- scripts/__tests__/applyPromptRewrites.test.ts
```

Expected: PASS.

- [ ] **Step 7: Apply replacements carefully**

Create a local untracked rewrite JSON file, for example `web/tmp/prompt-rewrites.json`, grouped by gallery file:

```json
{
  "gallery1.md": [
    {
      "case_number": 17,
      "rewritten_prompt_text": "自然语言中文提示词..."
    }
  ]
}
```

Then run:

```cmd
"C:\Program Files\nodejs\npx.cmd" -C web tsx scripts/applyPromptRewrites.ts tmp/prompt-rewrites.json
```

Expected: only prompt fence contents change in `gallery*.md`. Do not stage `web/tmp/prompt-rewrites.json`.

- [ ] **Step 8: Run local JSON-like scan**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web run scan:json-prompts
```

Expected: `count` is `0`, or remaining cases are listed with documented exceptions approved by the user.

- [ ] **Step 9: Run gallery import**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web run import:gallery
```

Expected:

```json
{
  "categories": 13,
  "prompt_cases": 352,
  "known_missing_prompt_numbers": [12, 169, 170]
}
```

- [ ] **Step 10: Validate Supabase prompt cleanup**

Use Supabase connector:

```sql
select
  count(*) filter (where btrim(prompt_text) like '{%' or btrim(prompt_text) like '[%') as json_like_count,
  count(*) as total_count
from prompt_cases;
```

Expected:

```text
json_like_count = 0
total_count = 352
```

- [ ] **Step 11: Run gallery validation**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web run validate:gallery
```

Expected: 13 categories, 352 prompt cases, missing `[12, 169, 170]`.

- [ ] **Step 12: Commit prompt cleanup**

Run:

```cmd
git add gallery*.md web/scripts/applyPromptRewrites.ts web/scripts/__tests__/applyPromptRewrites.test.ts
git commit -m "data: rewrite JSON-like prompts as natural language"
```

### Task 10: Full Validation And Browser Smoke Test

**Files:**
- No required code changes unless verification finds bugs.

- [ ] **Step 1: Run complete automated checks**

Run:

```cmd
"C:\Program Files\nodejs\npm.cmd" -C web test
"C:\Program Files\nodejs\npm.cmd" -C web run lint
"C:\Program Files\nodejs\npm.cmd" -C web run build
"C:\Program Files\nodejs\npm.cmd" -C web run validate:gallery
"C:\Program Files\nodejs\npm.cmd" -C web exec codex -- --version
```

Expected:

```text
test passes
lint passes
build passes
validate:gallery prints 13 categories, 352 prompt_cases, missing [12,169,170]
codex-cli 0.128.0
```

- [ ] **Step 2: Start dev app**

Run:

```cmd
run-web-dev.cmd
```

Expected:

```text
Express server listens on 127.0.0.1:8787
Vite dev server serves 127.0.0.1:5173
```

- [ ] **Step 3: Browser smoke test**

Use browser-use if available; otherwise use the in-app browser manually.

Test:

1. Open `http://127.0.0.1:5173/`.
2. Confirm there is no browser-level vertical scrollbar on desktop.
3. Confirm Source and Result panels stay fixed in the left rail.
4. Confirm only the Gallery grid scrolls.
5. Confirm the two upload helper sentences are absent.
6. Hover a Gallery card and confirm one transparent overlay appears.
7. Upload a Source Image.
8. Click Recommend and confirm exactly 6 recommendations.
9. Select a recommended case and confirm Prompt drawer opens.
10. Click Rewrite and confirm the rewrite tab shows natural-language prompt text.
11. Upload a Result Image and confirm the experiment saves.

- [ ] **Step 4: Verify workflow events**

Use Supabase connector:

```sql
select workflow, stage, status, count(*)
from workflow_events
where created_at > now() - interval '2 hours'
group by workflow, stage, status
order by workflow, stage, status;
```

Expected: recent rows exist for recommend, rewrite, upload_image, save_experiment, and any frontend blocked/error events triggered during testing.

- [ ] **Step 5: Stop dev servers**

Stop the `run-web-dev.cmd` terminal with `Ctrl+C`. Confirm no needed long-running process remains.

- [ ] **Step 6: Commit verification fixes if needed**

If smoke testing reveals bugs, fix only those bugs, rerun relevant tests, and commit:

```cmd
git add <changed files>
git commit -m "fix: address prompt gallery smoke findings"
```

If no fixes were needed, do not create an empty commit.

### Task 11: PR Preparation

**Files:**
- No required code files.

- [ ] **Step 1: Check final git status**

Run:

```cmd
git status --short
git log --oneline upstream/main..HEAD
```

Expected:

```text
git status is clean
log shows focused commits for design, migration/logging, UI, prompt cleanup, verification fixes if any
```

- [ ] **Step 2: Push branch**

Run:

```cmd
git push origin codex/prompt-gallery-followup-fixes
```

- [ ] **Step 3: Open draft PR to upstream**

Use GitHub plugin or `gh` fallback:

```cmd
gh pr create --repo 353055619/ImageOdyssey --base main --head hanwenbing:codex/prompt-gallery-followup-fixes --draft --title "[codex] Fix prompt gallery follow-up issues" --body-file pr-body.md
```

PR body must include:

```md
## Summary
- Fixed fixed-viewport Studio layout so only Gallery scrolls.
- Converted Prompt area to a drawer and aligned rewrite action.
- Removed upload helper copy.
- Reworked Gallery hover overlay.
- Added workflow_events diagnostics and frontend blocked-event logging.
- Cleaned JSON-like prompts into natural-language prompt text.
- Added run-web-dev.cmd for Windows startup.

## Validation
- npm -C web test
- npm -C web run lint
- npm -C web run build
- npm -C web run validate:gallery
- npm -C web exec codex -- --version

## Manual Smoke Test
- Source upload -> 6 recommendations -> case select -> rewrite -> Result upload -> experiment save.
- workflow_events checked in Supabase.
- Desktop layout checked for no page-level vertical scroll.

## Data Notes
- JSON-like prompt count before cleanup: 93 / 352.
- JSON-like prompt count after cleanup: 0 / 352.
```

- [ ] **Step 4: Verify PR metadata**

Run:

```cmd
gh pr view --repo 353055619/ImageOdyssey --json url,state,isDraft,baseRefName,headRefName
```

Expected:

```text
state = OPEN
isDraft = true
baseRefName = main
headRefName = codex/prompt-gallery-followup-fixes
```

## Self-Review Checklist

- [x] Every spec requirement maps to at least one task:
  - Page scrolling -> Task 6 and Task 10.
  - Prompt drawer -> Task 6 and Task 10.
  - JSON-like prompt cleanup -> Task 8 and Task 9.
  - AI usability/errors -> Task 3, Task 4, Task 5, Task 10.
  - Upload helper copy -> Task 6.
  - Gallery hover -> Task 6 and Task 10.
  - Workflow diagnostics -> Task 1, Task 2, Task 3, Task 4, Task 10.
  - Windows startup -> Task 7.
- [x] No implementation task requires direct browser Supabase writes to sensitive tables.
- [x] Prompt cleanup has a user approval gate before bulk edits.
- [x] No task deletes `assets/`, `index.md`, or gallery files.
- [x] Final PR remains based on `upstream/main`.
