// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { recommend, rewrite } from "../maasBridge";
import type { RecommendRequest } from "../types";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

function chatResponse(content: string, status = 200): Response {
  return jsonResponse(
    {
      choices: [
        {
          message: {
            content
          }
        }
      ]
    },
    status
  );
}

function recommendationsJson(caseNumbers: number[]) {
  return JSON.stringify({
    recommendations: caseNumbers.map((caseNumber) => ({
      case_number: caseNumber,
      reason: `reason ${caseNumber}`
    }))
  });
}

const sourceImageDataUrl = "data:image/jpeg;base64,test-image";
const validCaseNumbers = [1, 2, 3, 4, 5, 6];

function testConfig() {
  return {
    apiKey: "test-key",
    chatCompletionsUrl: "https://maas.example/v2/chat/completions",
    model: "deepseek-v4-flash",
    visionChatCompletionsUrl: "https://maas.example/v1/chat/completions",
    visionModel: "qwen2.5-vl-72b"
  };
}

function createRecommendRequest(caseNumbers: number[]): RecommendRequest {
  return {
    source_image_storage_path: "source/source.png",
    user_query: "",
    category_filter: null,
    case_numbers: caseNumbers
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("maasBridge.recommend", () => {
  it("describes the source image with VL MaaS and asks DeepSeek for six recommendations", async () => {
    const caseNumbers = validCaseNumbers;
    const sourceImagePath = sourceImageDataUrl;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse("图片中是一位人物，柔和侧光，浅景深背景。"))
      .mockResolvedValueOnce(chatResponse(`noise\n${recommendationsJson(caseNumbers)}\ndone`));

    const result = await recommend(createRecommendRequest(caseNumbers), {
      fetch: fetchMock,
      resolveSourceImageDataUrl: vi.fn(async () => sourceImagePath),
      config: testConfig()
    });

    expect(result.recommendations).toHaveLength(6);
    expect(result.recommendations.map((item) => item.case_number)).toEqual(caseNumbers);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [visionUrl, visionInit] = fetchMock.mock.calls[0];
    expect(visionUrl).toBe("https://maas.example/v1/chat/completions");
    expect(visionInit.headers).toMatchObject({
      authorization: "Bearer test-key",
      "content-type": "application/json"
    });
    const visionBody = JSON.parse(String(visionInit.body));
    expect(visionBody.model).toBe("qwen2.5-vl-72b");
    expect(JSON.stringify(visionBody)).toContain(sourceImageDataUrl);

    const [textUrl, textInit] = fetchMock.mock.calls[1];
    expect(textUrl).toBe("https://maas.example/v2/chat/completions");
    const textBody = JSON.parse(String(textInit.body));
    expect(textBody.model).toBe("deepseek-v4-flash");
    expect(JSON.stringify(textBody)).toContain("图片中是一位人物");
    expect(JSON.stringify(textBody)).toContain("recommendations");
  });

  it("rejects non-2xx MaaS responses", async () => {
    const caseNumbers = validCaseNumbers;
    const fetchMock = vi.fn().mockResolvedValueOnce(chatResponse("rate limited", 429));

    await expect(recommend(createRecommendRequest(caseNumbers), {
      fetch: fetchMock,
      resolveSourceImageDataUrl: vi.fn(async () => sourceImageDataUrl),
      config: testConfig()
    })).rejects.toThrow(/status 429/i);
  });

  it("rejects invalid MaaS JSON responses", async () => {
    const caseNumbers = validCaseNumbers;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response("not json", { status: 200 })
    );

    await expect(recommend(createRecommendRequest(caseNumbers), {
      fetch: fetchMock,
      resolveSourceImageDataUrl: vi.fn(async () => sourceImageDataUrl),
      config: testConfig()
    })).rejects.toThrow(/invalid JSON/i);
  });

  it("rejects MaaS responses with no choices", async () => {
    const caseNumbers = validCaseNumbers;
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ choices: [] }));

    await expect(recommend(createRecommendRequest(caseNumbers), {
      fetch: fetchMock,
      resolveSourceImageDataUrl: vi.fn(async () => sourceImageDataUrl),
      config: testConfig()
    })).rejects.toThrow(/no choices/i);
  });

  it("rejects recommendation counts other than six", async () => {
    const caseNumbers = validCaseNumbers;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse("图片描述"))
      .mockResolvedValueOnce(chatResponse(recommendationsJson(caseNumbers.slice(0, 5))));

    await expect(recommend(createRecommendRequest(caseNumbers), {
      fetch: fetchMock,
      resolveSourceImageDataUrl: vi.fn(async () => sourceImageDataUrl),
      config: testConfig()
    })).rejects.toThrow(/expected exactly 6 recommendations/i);
  });

  it("rejects duplicate recommendation case numbers", async () => {
    const caseNumbers = validCaseNumbers;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse("图片描述"))
      .mockResolvedValueOnce(chatResponse(recommendationsJson([
        ...caseNumbers.slice(0, 5),
        caseNumbers[4]
      ])));

    await expect(recommend(createRecommendRequest(caseNumbers), {
      fetch: fetchMock,
      resolveSourceImageDataUrl: vi.fn(async () => sourceImageDataUrl),
      config: testConfig()
    })).rejects.toThrow(/duplicate case_number/i);
  });

  it("rejects recommendation case numbers outside the candidates", async () => {
    const caseNumbers = validCaseNumbers;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse("图片描述"))
      .mockResolvedValueOnce(chatResponse(recommendationsJson([
        ...caseNumbers.slice(0, 5),
        99999
      ])));

    await expect(recommend(createRecommendRequest(caseNumbers), {
      fetch: fetchMock,
      resolveSourceImageDataUrl: vi.fn(async () => sourceImageDataUrl),
      config: testConfig()
    })).rejects.toThrow(/invalid case_number 99999/i);
  });
});

describe("maasBridge.rewrite", () => {
  it("returns natural-language Chinese rewritten prompts from MaaS", async () => {
    const caseNumber = 1;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse("图片中是一位人物，柔和侧光。"))
      .mockResolvedValueOnce(chatResponse(JSON.stringify({
        rewritten_prompt_text: "一张自然语言中文提示词，描绘上传图片中的主体置于柔和电影侧光下，保留原案例的浅景深和精致构图。",
        preserved_parts: ["电影侧光", "浅景深"],
        changed_parts: ["主体锚定为上传图片"]
      })));

    await expect(rewrite({
      source_image_storage_path: "source/source.png",
      case_number: caseNumber,
      original_prompt_text: "Original prompt"
    }, {
      fetch: fetchMock,
      resolveSourceImageDataUrl: vi.fn(async () => sourceImageDataUrl),
      config: testConfig()
    })).resolves.toEqual({
      rewritten_prompt_text: "一张自然语言中文提示词，描绘上传图片中的主体置于柔和电影侧光下，保留原案例的浅景深和精致构图。",
      preserved_parts: ["电影侧光", "浅景深"],
      changed_parts: ["主体锚定为上传图片"]
    });
  });

  it("rejects JSON-like rewritten prompt text", async () => {
    const caseNumber = 1;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(chatResponse("图片描述"))
      .mockResolvedValueOnce(chatResponse(JSON.stringify({
        rewritten_prompt_text: "{\"type\":\"portrait\"}",
        preserved_parts: ["subject"],
        changed_parts: ["style"]
      })));

    await expect(rewrite({
      source_image_storage_path: "source/source.png",
      case_number: caseNumber,
      original_prompt_text: "Original prompt"
    }, {
      fetch: fetchMock,
      resolveSourceImageDataUrl: vi.fn(async () => sourceImageDataUrl),
      config: testConfig()
    })).rejects.toThrow(/natural-language prompt text/i);
  });
});
