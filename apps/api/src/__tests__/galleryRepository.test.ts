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
