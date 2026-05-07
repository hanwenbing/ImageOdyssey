import { describe, expect, it } from "vitest";
import { categoriesResponseSchema, promptCasesResponseSchema } from "@imageodyssey/shared";
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

    const categoriesBody = categoriesResponseSchema.parse(await categoriesResponse.json());
    const featuredBody = promptCasesResponseSchema.parse(await featuredResponse.json());
    const allBody = promptCasesResponseSchema.parse(await allResponse.json());

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

  it("serves gallery assets from the archive directory", async () => {
    const app = createApp();
    const response = await app.request("/gallery/assets/case1.jpg");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/jpeg");
  });
});
