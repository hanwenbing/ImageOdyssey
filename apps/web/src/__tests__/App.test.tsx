import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";

function createCase(caseNumber: number, categoryName = "人物写真") {
  return {
    id: `case-${caseNumber}`,
    case_number: caseNumber,
    title: `Case ${caseNumber}`,
    category_slug: categoryName === "人物写真" ? "portrait" : "product",
    category_name: categoryName,
    prompt_text: `原始提示词 ${caseNumber}`,
    image_path: `/gallery/assets/case${caseNumber}.jpg`,
    summary: `摘要 ${caseNumber}`,
    tags: ["tag"]
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("starts with featured cases, preloads all after featured images settle, and rewrites selected prompt", async () => {
    const featuredCases = Array.from({ length: 12 }, (_, index) => createCase(index + 1));
    const allCases = [...featuredCases, createCase(13, "产品海报")];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/categories") {
        return new Response(
          JSON.stringify({
            categories: [
              { slug: "featured", name: "精选", sort_order: 0 },
              { slug: "all", name: "全部", sort_order: 1 },
              { slug: "portrait", name: "人物写真", sort_order: 2 },
              { slug: "product", name: "产品海报", sort_order: 3 }
            ]
          }),
          { status: 200 }
        );
      }
      if (url === "/api/prompt-cases?scope=featured") {
        return new Response(JSON.stringify({ cases: featuredCases }), { status: 200 });
      }
      if (url === "/api/prompt-cases?scope=all") {
        return new Response(JSON.stringify({ cases: allCases }), { status: 200 });
      }
      if (url === "/api/rewrite") {
        expect(JSON.parse(String(init?.body))).toEqual({
          case_number: 1,
          original_prompt_text: "原始提示词 1"
        });
        return new Response(
          JSON.stringify({
            rewritten_prompt_text:
              "以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变，原始提示词 1"
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("button", { name: /^Case 1 / })).toBeInTheDocument();
    expect(screen.queryByText("Source Image")).not.toBeInTheDocument();
    expect(screen.queryByText("Result Image")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "推荐" })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Case \d+/ })).toHaveLength(12);

    for (const image of screen.getAllByRole("img")) {
      fireEvent.load(image);
    }

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/prompt-cases?scope=all");
    });

    fireEvent.click(screen.getByRole("button", { name: /^Case 1 / }));
    expect(screen.getByText("原始提示词 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "改写为图片主体版本" }));

    expect(await screen.findByText(/以我上传的图片中的人物为主体/)).toBeInTheDocument();
  });
});
