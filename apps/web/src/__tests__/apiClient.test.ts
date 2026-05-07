import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCategories, requestPromptCases, requestRewrite } from "../lib/apiClient";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiClient", () => {
  it("loads gallery data through backend API routes", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/categories") {
        return new Response(
          JSON.stringify({
            categories: [
              { slug: "featured", name: "精选", sort_order: 0 },
              { slug: "all", name: "全部", sort_order: 1 }
            ]
          }),
          { status: 200 }
        );
      }
      if (url === "/api/prompt-cases?scope=featured") {
        return new Response(
          JSON.stringify({
            cases: [
              {
                id: "case-1",
                case_number: 1,
                title: "Case 1",
                category_slug: "portrait",
                category_name: "人物写真",
                prompt_text: "中文提示词",
                image_path: "/gallery/assets/case1.jpg",
                summary: "摘要",
                tags: []
              }
            ]
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestCategories()).resolves.toHaveLength(2);
    await expect(requestPromptCases("featured")).resolves.toHaveLength(1);
  });

  it("posts rewrite requests to the backend API", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          rewritten_prompt_text: "以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变。"
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestRewrite({ case_number: 3, original_prompt_text: "原始提示词" })
    ).resolves.toEqual({
      rewritten_prompt_text: "以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变。"
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ case_number: 3, original_prompt_text: "原始提示词" })
    });
  });
});
