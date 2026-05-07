import { describe, expect, it } from "vitest";
import {
  categoriesResponseSchema,
  promptCasesResponseSchema,
  promptCaseSchema
} from "./gallery";
import { rewriteRequestSchema, rewriteResponseSchema } from "./rewrite";

describe("shared API schemas", () => {
  it("validates gallery responses", () => {
    const promptCase = {
      id: "case-1",
      case_number: 1,
      title: "Case 1",
      category_slug: "portrait",
      category_name: "人物写真",
      prompt_text: "中文提示词",
      image_path: "/gallery/assets/case1.jpg",
      summary: "摘要",
      tags: ["portrait"]
    };

    expect(promptCaseSchema.parse(promptCase)).toEqual(promptCase);
    expect(
      categoriesResponseSchema.parse({
        categories: [
          { slug: "featured", name: "精选", sort_order: 0 },
          { slug: "all", name: "全部", sort_order: 1 }
        ]
      })
    ).toEqual({
      categories: [
        { slug: "featured", name: "精选", sort_order: 0 },
        { slug: "all", name: "全部", sort_order: 1 }
      ]
    });
    expect(promptCasesResponseSchema.parse({ cases: [promptCase] })).toEqual({
      cases: [promptCase]
    });
  });

  it("validates rewrite request and response bodies", () => {
    expect(
      rewriteRequestSchema.parse({
        case_number: 7,
        original_prompt_text: "原始提示词"
      })
    ).toEqual({
      case_number: 7,
      original_prompt_text: "原始提示词"
    });

    expect(
      rewriteResponseSchema.parse({
        rewritten_prompt_text:
          "以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变。"
      })
    ).toEqual({
      rewritten_prompt_text:
        "以我上传的图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变。"
    });
  });
});
