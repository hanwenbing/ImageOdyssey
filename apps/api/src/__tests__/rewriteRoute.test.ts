import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app";

describe("rewrite route", () => {
  it("rewrites a prompt through the injected service", async () => {
    const rewritePrompt = vi.fn(async () => ({
      rewritten_prompt_text: "以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变，原始场景继续保留。"
    }));
    const app = createApp({ rewritePrompt });

    const response = await app.request("/api/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        case_number: 7,
        original_prompt_text: "生成一个30岁的男性，坐在咖啡馆窗边。"
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      rewritten_prompt_text:
        "以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变，原始场景继续保留。"
    });
    expect(rewritePrompt).toHaveBeenCalledWith({
      case_number: 7,
      original_prompt_text: "生成一个30岁的男性，坐在咖啡馆窗边。"
    });
  });

  it("rejects invalid rewrite request bodies", async () => {
    const app = createApp({ rewritePrompt: vi.fn() });

    const response = await app.request("/api/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ original_prompt_text: "" })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.stringContaining("Invalid") });
  });
});
