import { describe, expect, it, vi } from "vitest";
import { buildRewriteMessages, rewritePrompt } from "../services/promptRewriteService";
import type { ChatMessage } from "../services/huaweiMaasClient";

describe("prompt rewrite service", () => {
  it("builds a person-reference rewrite prompt and calls text MaaS once", async () => {
    const complete = vi.fn(async (messages: ChatMessage[]) => {
      expect(messages).toHaveLength(2);
      return {
        content:
          '{"rewritten_prompt_text":"以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变，穿着复古红裙，站在夜晚街头霓虹灯下，电影感光线，浅景深。"}'
      };
    });

    const result = await rewritePrompt(
      {
        case_number: 1,
        original_prompt_text:
          "生成一个20岁的女性，穿着复古红裙，站在夜晚街头霓虹灯下，电影感光线，浅景深。"
      },
      complete
    );

    expect(complete).toHaveBeenCalledOnce();
    const firstCall = complete.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall![0].map((message) => message.content).join("\n")).toContain("删除或弱化可能改变上传人物年龄、性别、样貌、神态");
    expect(result.rewritten_prompt_text).toContain("以我上传的图片中的人物为主体");
    expect(result.rewritten_prompt_text).not.toContain("20岁的女性");
  });

  it("keeps the original prompt inside the user message", () => {
    const messages = buildRewriteMessages("赛博朋克街景，雨夜，长焦镜头。");

    expect(messages.at(-1)?.content).toContain("赛博朋克街景");
    expect(messages.at(-1)?.content).toContain("只返回 JSON");
  });
});
