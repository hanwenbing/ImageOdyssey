import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

const mockData = vi.hoisted(() => ({
  categories: [
    {
      id: "cat-1",
      slug: "ui",
      name: "UI与界面",
      sort_order: 1,
      source_gallery_file: "gallery1.md"
    },
    {
      id: "cat-2",
      slug: "chart",
      name: "图表与信息可视化",
      sort_order: 2,
      source_gallery_file: "gallery2.md"
    }
  ],
  promptCases: [
    {
      id: "case-101",
      case_number: 101,
      title: "品牌海报",
      category_id: "cat-1",
      prompt_text: "生成高对比度品牌海报",
      image_storage_path: "cases/case101.jpg",
      image_public_url: "https://example.com/case101.jpg",
      summary: "适合宣传图",
      tags: ["海报", "品牌"],
      source_gallery_file: "gallery1.md",
      created_at: "2026-05-02T00:00:00Z",
      updated_at: "2026-05-02T00:00:00Z"
    },
    {
      id: "case-202",
      case_number: 202,
      title: "信息图",
      category_id: "cat-2",
      prompt_text: "制作一张知识结构图",
      image_storage_path: "cases/case202.jpg",
      image_public_url: "https://example.com/case202.jpg",
      summary: "适合说明复杂内容",
      tags: ["信息图", "结构"],
      source_gallery_file: "gallery2.md",
      created_at: "2026-05-02T00:00:00Z",
      updated_at: "2026-05-02T00:00:00Z"
    }
  ]
}));

vi.mock("../lib/supabaseClient", () => {
  const tableResults: Record<string, unknown[]> = {
    categories: mockData.categories,
    prompt_cases: mockData.promptCases
  };

  return {
    getSupabaseClient: () => ({
      from(table: string) {
        const rows = tableResults[table] ?? [];
        return {
          select() {
            return {
              order: async () => ({ data: rows, error: null })
            };
          }
        };
      }
    })
  };
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
let createObjectURLMock: ReturnType<typeof vi.fn>;
let revokeObjectURLMock: ReturnType<typeof vi.fn>;

describe("App", () => {
  beforeEach(() => {
    let blobIndex = 0;
    createObjectURLMock = vi.fn(() => `blob:preview-${++blobIndex}`);
    revokeObjectURLMock = vi.fn();
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/experiment-images") {
        const formData = init?.body as FormData | undefined;
        const kind = formData?.get("kind");
        const storagePath =
          kind === "result"
            ? "result/result-1.png"
            : "source/source-1.png";
        return jsonResponse({ storagePath });
      }

      if (url === "/api/recommend") {
        return jsonResponse({
          recommendations: [
            { case_number: 202, reason: "更贴近用户的结构图需求" },
            { case_number: 101, reason: "适合品牌视觉重写" },
            { case_number: 303, reason: "第三条推荐" },
            { case_number: 304, reason: "第四条推荐" },
            { case_number: 305, reason: "第五条推荐" },
            { case_number: 306, reason: "第六条推荐" }
          ]
        });
      }

      if (url === "/api/rewrite") {
        return jsonResponse({
          rewritten_prompt_text: "重写后的提示词",
          preserved_parts: ["原有结构"],
          changed_parts: ["主体锚点"]
        });
      }

      if (url === "/api/experiments") {
        return jsonResponse({ id: "experiment-1" });
      }

      if (url === "/api/workflow-events") {
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ error: `Unexpected request: ${url}` }, 500);
    });

    vi.stubGlobal("fetch", fetchMock);

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock
    });
  });

  it("loads gallery data and runs the source-to-rewrite workflow", async () => {
    render(<App />);

    expect(
      await screen.findByRole("button", { name: "Case 101 品牌海报" })
    ).toBeVisible();
    expect(screen.getByText("全部")).toBeVisible();
    expect(screen.getByRole("button", { name: "UI与界面" })).toBeVisible();
    expect(
      screen.queryByText("上传参考图，推荐和改写都会围绕它展开")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("完成改写后上传生成结果，系统会自动保存实验记录")
    ).not.toBeInTheDocument();

    const recommendButton = screen.getByRole("button", { name: "推荐" });
    expect(recommendButton).toHaveAttribute("aria-disabled", "true");

    const sourceInput = screen.getAllByLabelText("Source Image")[0];
    const sourceFile = new File(["source"], "source.png", { type: "image/png" });
    fireEvent.change(sourceInput, { target: { files: [sourceFile] } });

    await waitFor(() =>
      expect(recommendButton).toHaveAttribute("aria-disabled", "false")
    );

    fireEvent.click(recommendButton);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/recommend", expect.any(Object));
    });

    fireEvent.click(screen.getByRole("button", { name: "Case 101 品牌海报" }));
    fireEvent.click(screen.getByRole("button", { name: "展开 Prompt" }));
    expect(screen.getByDisplayValue("生成高对比度品牌海报")).toBeVisible();

    const rewriteButton = screen.getByRole("button", { name: "改写" });
    expect(rewriteButton).toHaveAttribute("aria-disabled", "false");

    fireEvent.click(rewriteButton);
    expect(await screen.findByDisplayValue("重写后的提示词")).toBeVisible();

    const resultInput = screen.getAllByLabelText("Result Image")[0];
    await waitFor(() => expect(resultInput).toBeEnabled());

    const resultFile = new File(["result"], "result.png", { type: "image/png" });
    fireEvent.change(resultInput, { target: { files: [resultFile] } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/experiments", expect.any(Object));
    });
  });

  it("expands the prompt drawer and shows original and rewritten prompts", async () => {
    render(<App />);

    await screen.findByRole("button", { name: "Case 101 品牌海报" });

    const sourceInput = screen.getAllByLabelText("Source Image")[0];
    const sourceFile = new File(["source"], "source.png", { type: "image/png" });
    fireEvent.change(sourceInput, { target: { files: [sourceFile] } });

    fireEvent.click(screen.getByRole("button", { name: "Case 101 品牌海报" }));

    expect(screen.queryByDisplayValue("生成高对比度品牌海报")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开 Prompt" }));
    expect(screen.getByDisplayValue("生成高对比度品牌海报")).toBeVisible();

    const rewriteButton = screen.getByRole("button", { name: "改写" });
    await waitFor(() =>
      expect(rewriteButton).toHaveAttribute("aria-disabled", "false")
    );

    fireEvent.click(rewriteButton);
    expect(await screen.findByDisplayValue("重写后的提示词")).toBeVisible();
  });

  it("opens the prompt drawer after rewrite succeeds from the default collapsed state", async () => {
    render(<App />);

    await screen.findByRole("button", { name: "Case 101 品牌海报" });

    const sourceInput = screen.getAllByLabelText("Source Image")[0];
    const sourceFile = new File(["source"], "source.png", { type: "image/png" });
    fireEvent.change(sourceInput, { target: { files: [sourceFile] } });

    fireEvent.click(screen.getByRole("button", { name: "Case 101 品牌海报" }));
    expect(screen.queryByDisplayValue("生成高对比度品牌海报")).not.toBeInTheDocument();

    const rewriteButton = screen.getByRole("button", { name: "改写" });
    await waitFor(() =>
      expect(rewriteButton).toHaveAttribute("aria-disabled", "false")
    );

    fireEvent.click(rewriteButton);

    expect(await screen.findByDisplayValue("重写后的提示词")).toBeVisible();
    expect(screen.getByRole("button", { name: "收起 Prompt" })).toBeVisible();
  });

  it("logs blocked recommendation, rewrite, and result upload actions", async () => {
    render(<App />);

    await screen.findByRole("button", { name: "Case 101 品牌海报" });

    fireEvent.click(screen.getByRole("button", { name: "推荐" }));
    fireEvent.click(screen.getByRole("button", { name: "改写" }));
    fireEvent.click(screen.getByText("等待改写完成"));

    await waitFor(() => {
      const workflowEventCalls = fetchMock.mock.calls.filter(
        ([url]) => url === "/api/workflow-events"
      );
      expect(workflowEventCalls).toHaveLength(3);
    });

    const stages = fetchMock.mock.calls
      .filter(([url]) => url === "/api/workflow-events")
      .map(([, init]) => JSON.parse(String(init?.body)).stage);

    expect(stages).toEqual([
      "recommend_blocked",
      "rewrite_blocked",
      "result_upload_blocked"
    ]);
  });

  it("revokes blob previews when replaced and unmounted", async () => {
    const { unmount } = render(<App />);

    await screen.findByRole("button", { name: "Case 101 品牌海报" });

    const sourceInput = screen.getAllByLabelText("Source Image")[0];
    const firstSource = new File(["first"], "first.png", { type: "image/png" });
    const secondSource = new File(["second"], "second.png", { type: "image/png" });

    fireEvent.change(sourceInput, { target: { files: [firstSource] } });
    await waitFor(() => expect(createObjectURLMock).toHaveBeenCalledTimes(1));

    fireEvent.change(sourceInput, { target: { files: [secondSource] } });
    await waitFor(() =>
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:preview-1")
    );

    unmount();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:preview-2");
  });
});
