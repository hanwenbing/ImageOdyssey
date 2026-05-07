import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { createFileGalleryRepository } from "./repositories/fileGalleryRepository";
import type { GalleryRepository } from "./repositories/galleryRepository";
import { createGalleryRoutes } from "./routes/gallery";
import { createRewriteRoutes, type RewritePrompt } from "./routes/rewrite";
import { rewritePrompt } from "./services/promptRewriteService";

export type AppDependencies = {
  galleryRepository?: GalleryRepository;
  rewritePrompt?: RewritePrompt;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono();
  const galleryRepository = dependencies.galleryRepository ?? createFileGalleryRepository();
  const rewritePromptDependency = dependencies.rewritePrompt ?? rewritePrompt;

  app.use(
    "*",
    cors({
      origin: ["http://127.0.0.1:5173", "http://localhost:5173"]
    })
  );

  app.get("/api/health", (context) => context.json({ ok: true }));
  app.use("/gallery/assets/*", serveStatic({ root: "../../data" }));
  app.route("/api", createGalleryRoutes(galleryRepository));
  app.route("/api", createRewriteRoutes(rewritePromptDependency));

  app.notFound((context) => context.json({ error: "Not found" }, 404));
  app.onError((error, context) => {
    return context.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  });

  return app;
}
