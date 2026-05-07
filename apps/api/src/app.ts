import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
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
  app.use("/gallery/assets/*", serveStatic({ root: "../../data" }));
  app.route("/api", createGalleryRoutes(galleryRepository));

  app.notFound((context) => context.json({ error: "Not found" }, 404));
  app.onError((error, context) => {
    return context.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  });

  return app;
}
