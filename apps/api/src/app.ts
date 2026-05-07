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
