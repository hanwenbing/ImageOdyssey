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
      typeof body === "object" && body !== null && "error" in body
        ? String(body.error)
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
