import { promptCaseScopeSchema } from "@imageodyssey/shared";
import { Hono } from "hono";
import type { GalleryRepository } from "../repositories/galleryRepository";

export function createGalleryRoutes(repository: GalleryRepository) {
  const routes = new Hono();

  routes.get("/categories", async (context) => {
    const categories = await repository.listCategories();
    return context.json({ categories });
  });

  routes.get("/prompt-cases", async (context) => {
    const parsedScope = promptCaseScopeSchema.safeParse(context.req.query("scope") ?? "featured");
    if (!parsedScope.success) {
      return context.json({ error: "Invalid prompt case scope" }, 400);
    }

    const cases = await repository.listPromptCases(parsedScope.data);
    return context.json({ cases });
  });

  return routes;
}
