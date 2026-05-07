import { rewriteRequestSchema, type RewriteRequest, type RewriteResponse } from "@imageodyssey/shared";
import { Hono } from "hono";

export type RewritePrompt = (request: RewriteRequest) => Promise<RewriteResponse>;

export function createRewriteRoutes(rewritePrompt: RewritePrompt) {
  const routes = new Hono();

  routes.post("/rewrite", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: "Invalid rewrite request body" }, 400);
    }

    const parsedBody = rewriteRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return context.json({ error: "Invalid rewrite request body" }, 400);
    }

    const result = await rewritePrompt(parsedBody.data);
    return context.json(result);
  });

  return routes;
}
