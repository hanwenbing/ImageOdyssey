import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { getHuaweiMaasConfig } from "./env";
import {
  getLocalCaseByNumber,
  type LocalCaseRecord
} from "./localCorpus";
import { resolveSourceImagePath as defaultResolveSourceImagePath } from "./sourceImageCache";
import type {
  CaseIndexItem,
  RecommendRequest,
  RecommendResponse,
  RewriteRequest,
  RewriteResponse
} from "./types";

type MaasBridgeDependencies = {
  fetch?: typeof fetch;
  resolveSourceImagePath?: (storagePath: string) => Promise<string>;
  config?: ReturnType<typeof getHuaweiMaasConfig>;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

type ChatCompletionPayload = {
  model: string;
  messages: ChatMessage[];
};

const expectedRecommendationCount = 6;

function getConfig(dependencies: MaasBridgeDependencies) {
  return dependencies.config ?? getHuaweiMaasConfig();
}

function getFetch(dependencies: MaasBridgeDependencies): typeof fetch {
  return dependencies.fetch ?? fetch;
}

function requireNonEmptyString(value: unknown, scope: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${scope} must be a non-empty string`);
  }

  return value.trim();
}

function requireInteger(value: unknown, scope: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isFinite(value)
  ) {
    throw new Error(`${scope} must be an integer`);
  }

  return value;
}

function extractFirstJsonObject(text: string): string | null {
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let index = start; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }

        if (character === "\\") {
          escape = true;
          continue;
        }

        if (character === '"') {
          inString = false;
        }

        continue;
      }

      if (character === '"') {
        inString = true;
        continue;
      }

      if (character === "{") {
        depth += 1;
        continue;
      }

      if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, index + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
              return candidate;
            }
          } catch {
            break;
          }
        }
      }
    }
  }

  return null;
}

function parseJsonObject(scope: string, text: string): Record<string, unknown> {
  const jsonText = extractFirstJsonObject(text);
  if (!jsonText) {
    throw new Error(`${scope} did not return a valid JSON object`);
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${scope} JSON payload must be an object`);
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${scope} returned invalid JSON: ${message}`, { cause: error });
  }
}

function looksLikeStructuredPromptText(value: string): boolean {
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith("```")) {
    return true;
  }

  if (/^(?:\{\s*(?:["{}]|\}|[a-z\u4e00-\u9fff])|\[\s*(?:["{[]|\]))/i.test(trimmedValue)) {
    return true;
  }

  const schemaKeyPattern =
    /(?:^|\n)\s*["“”]?(?:type|subject|style|prompt|layout|theme|background|instruction|主题|主体|风格|构图|布局|背景|提示词|说明)["“”]?\s*[:：=]/i;
  const schemaKeyMatches = trimmedValue.match(new RegExp(schemaKeyPattern, "gi")) ?? [];
  if (schemaKeyMatches.length >= 2) {
    return true;
  }

  const inlineSchemaKeyPattern =
    /["“”]?(?:type|subject|style|prompt|layout|theme|background|instruction|主题|主体|风格|构图|布局|背景|提示词|说明)["“”]?\s*[:：=]/gi;
  const inlineSchemaKeyMatches = trimmedValue.match(inlineSchemaKeyPattern) ?? [];
  if (inlineSchemaKeyMatches.length >= 2) {
    return true;
  }

  const structuredListPattern =
    /(?:^|\n)\s*(?:[-*•]|\d+[.)、])\s*(?:type|subject|style|prompt|layout|theme|background|instruction|主题|主体|风格|构图|布局|背景|提示词|说明)(?=\s|[:：=]|$)/i;
  const structuredListMatches =
    trimmedValue.match(new RegExp(structuredListPattern, "gi")) ?? [];
  if (structuredListMatches.length >= 2) {
    return true;
  }

  const genericListMatches =
    trimmedValue.match(/(?:^|\n)\s*(?:[-*•]|\d+[.)、])\s+\S+/g) ?? [];
  if (genericListMatches.length >= 2) {
    return true;
  }

  return /^"?(?:type|subject|style|prompt|layout|theme|background|instruction)"?\s*[:=]/i.test(
    trimmedValue
  ) || /^(?:主题|主体|风格|构图|布局|背景|说明)\s*[:：=]/.test(trimmedValue);
}

function getMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function imageFileToDataUrl(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  if (buffer.length === 0) {
    throw new Error("Source image cache file is empty");
  }

  return `data:${getMimeType(filePath)};base64,${buffer.toString("base64")}`;
}

async function callChatCompletions(
  fetchImpl: typeof fetch,
  apiKey: string,
  url: string,
  payload: ChatCompletionPayload
): Promise<string> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Huawei MaaS request failed with status ${response.status}: ${text.slice(0, 300)}`
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error("Huawei MaaS returned invalid JSON", { cause: error });
  }

  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("Huawei MaaS returned no choices");
  }

  const content = (choices[0] as { message?: { content?: unknown } } | undefined)
    ?.message?.content;
  return requireNonEmptyString(content, "Huawei MaaS message content");
}

async function describeSourceImage(
  request: { source_image_storage_path: string },
  dependencies: MaasBridgeDependencies
): Promise<string> {
  const config = getConfig(dependencies);
  const resolveSourceImagePath =
    dependencies.resolveSourceImagePath ?? defaultResolveSourceImagePath;
  const sourceImagePath = await resolveSourceImagePath(request.source_image_storage_path);
  const imageDataUrl = await imageFileToDataUrl(sourceImagePath);

  return callChatCompletions(
    getFetch(dependencies),
    config.apiKey,
    config.visionChatCompletionsUrl,
    {
      model: config.visionModel,
      messages: [
        {
          role: "system",
          content:
            "你是图像理解助手。请只根据用户提供的图片内容，用中文提炼主体、场景、风格、构图、色彩、光线、可见文字和不确定点。"
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "请为后续 GPT Image 2 中文提示词匹配生成一段紧凑但信息充分的图片描述。"
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl
              }
            }
          ]
        }
      ]
    }
  );
}

function validateRequestedCaseNumbers(caseNumbers: number[]): number[] {
  if (!Array.isArray(caseNumbers) || caseNumbers.length < expectedRecommendationCount) {
    throw new Error(
      `recommend request must include at least ${expectedRecommendationCount} case numbers`
    );
  }

  const seenCaseNumbers = new Set<number>();
  for (const caseNumber of caseNumbers) {
    requireInteger(caseNumber, "case_number");
    if (seenCaseNumbers.has(caseNumber)) {
      throw new Error(`recommend request includes duplicate case number: ${caseNumber}`);
    }

    getLocalCaseByNumber(caseNumber);
    seenCaseNumbers.add(caseNumber);
  }

  return caseNumbers;
}

function getRequestedLocalCases(caseNumbers: number[]): CaseIndexItem[] {
  return caseNumbers.map((caseNumber) => {
    const localCase = getLocalCaseByNumber(caseNumber);
    return {
      case_number: localCase.case_number,
      title: localCase.title,
      category_name: localCase.category_name,
      summary: localCase.summary,
      tags: localCase.tags,
      prompt_excerpt: localCase.prompt_text.replace(/\s+/g, " ").trim().slice(0, 220),
      image_storage_path: localCase.image_storage_path
    };
  });
}

function buildRecommendPrompt(
  request: RecommendRequest,
  imageDescription: string,
  cases: CaseIndexItem[]
): string {
  return [
    "你是本地中文提示词案例库的推荐器。",
    "请根据 source image 的视觉描述、用户搜索词和候选案例，选择最适合用于后续主体锚点式改写的 6 个案例。",
    "只返回一个 JSON 对象，不要 Markdown、代码块或解释。",
    'JSON schema: {"recommendations":[{"case_number":number,"reason":string}]}',
    `必须正好返回 ${expectedRecommendationCount} 条 recommendations。`,
    "case_number 必须来自候选案例，不能重复。reason 必须是中文非空字符串。",
    "",
    "Source image description:",
    imageDescription,
    "",
    "Request:",
    JSON.stringify(
      {
        user_query: request.user_query,
        category_filter: request.category_filter,
        cases
      },
      null,
      2
    )
  ].join("\n");
}

function buildRewritePrompt(
  request: RewriteRequest,
  imageDescription: string,
  caseRecord: LocalCaseRecord
): string {
  return [
    "你是中文 GPT Image 2 提示词改写助手。",
    "请把 Source image 的主体锚定到选中案例 prompt 中，尽量保留案例的目标场景、风格、构图、光线、道具、文字和视觉语言。",
    "只返回一个 JSON 对象，不要 Markdown、代码块或解释。",
    'JSON schema: {"rewritten_prompt_text":string,"preserved_parts":[string],"changed_parts":[string]}',
    "rewritten_prompt_text 必须是可直接复制到 ChatGPT / GPT Image 2 的自然语言中文提示词。",
    "不要把 JSON、字段清单、Markdown、key-value 对象或 schema-like 文本放进 rewritten_prompt_text。",
    "",
    "Source image description:",
    imageDescription,
    "",
    "Case:",
    JSON.stringify(
      {
        case_number: caseRecord.case_number,
        title: caseRecord.title,
        category_name: caseRecord.category_name,
        summary: caseRecord.summary,
        tags: caseRecord.tags,
        original_prompt_text: request.original_prompt_text
      },
      null,
      2
    )
  ].join("\n");
}

function parseRecommendationResponse(
  response: Record<string, unknown>,
  allowedCaseNumbers: Set<number>
): RecommendResponse {
  const rawRecommendations = response.recommendations;
  if (!Array.isArray(rawRecommendations)) {
    throw new Error("recommend: expected recommendations array");
  }

  if (rawRecommendations.length !== expectedRecommendationCount) {
    throw new Error(
      `recommend: expected exactly ${expectedRecommendationCount} recommendations`
    );
  }

  const recommendations: RecommendResponse["recommendations"] = [];
  const seenCaseNumbers = new Set<number>();
  for (const rawRecommendation of rawRecommendations) {
    if (rawRecommendation === null || typeof rawRecommendation !== "object" || Array.isArray(rawRecommendation)) {
      throw new Error("recommend: every recommendation must be an object");
    }

    const caseNumber = requireInteger(
      (rawRecommendation as { case_number?: unknown }).case_number,
      "recommendation case_number"
    );
    if (!allowedCaseNumbers.has(caseNumber)) {
      throw new Error(`recommend: invalid case_number ${caseNumber}`);
    }

    if (seenCaseNumbers.has(caseNumber)) {
      throw new Error(`recommend: duplicate case_number ${caseNumber}`);
    }

    recommendations.push({
      case_number: caseNumber,
      reason: requireNonEmptyString(
        (rawRecommendation as { reason?: unknown }).reason,
        `recommendation reason for case ${caseNumber}`
      )
    });
    seenCaseNumbers.add(caseNumber);
  }

  return { recommendations };
}

function parseRewriteResponse(response: Record<string, unknown>): RewriteResponse {
  const rewrittenPromptText = requireNonEmptyString(
    response.rewritten_prompt_text,
    "rewritten_prompt_text"
  );

  if (looksLikeStructuredPromptText(rewrittenPromptText)) {
    throw new Error("rewritten_prompt_text must be natural-language prompt text");
  }

  const preservedParts = response.preserved_parts;
  const changedParts = response.changed_parts;
  if (!Array.isArray(preservedParts) || !Array.isArray(changedParts)) {
    throw new Error("rewrite: expected preserved_parts and changed_parts arrays");
  }

  return {
    rewritten_prompt_text: rewrittenPromptText,
    preserved_parts: preservedParts.map((part, index) =>
      requireNonEmptyString(part, `preserved_parts[${index}]`)
    ),
    changed_parts: changedParts.map((part, index) =>
      requireNonEmptyString(part, `changed_parts[${index}]`)
    )
  };
}

export async function recommend(
  request: RecommendRequest,
  dependencies: MaasBridgeDependencies = {}
): Promise<RecommendResponse> {
  const caseNumbers = validateRequestedCaseNumbers(request.case_numbers);
  const cases = getRequestedLocalCases(caseNumbers);
  const imageDescription = await describeSourceImage(request, dependencies);
  const config = getConfig(dependencies);
  const content = await callChatCompletions(
    getFetch(dependencies),
    config.apiKey,
    config.chatCompletionsUrl,
    {
      model: config.model,
      messages: [
        {
          role: "system",
          content: "你是严格返回 JSON 的中文推荐服务。"
        },
        {
          role: "user",
          content: buildRecommendPrompt(request, imageDescription, cases)
        }
      ]
    }
  );
  return parseRecommendationResponse(parseJsonObject("recommend", content), new Set(caseNumbers));
}

export async function rewrite(
  request: RewriteRequest,
  dependencies: MaasBridgeDependencies = {}
): Promise<RewriteResponse> {
  const caseRecord = getLocalCaseByNumber(request.case_number);
  const imageDescription = await describeSourceImage(request, dependencies);
  const config = getConfig(dependencies);
  const content = await callChatCompletions(
    getFetch(dependencies),
    config.apiKey,
    config.chatCompletionsUrl,
    {
      model: config.model,
      messages: [
        {
          role: "system",
          content: "你是严格返回 JSON 的中文提示词改写服务。"
        },
        {
          role: "user",
          content: buildRewritePrompt(request, imageDescription, caseRecord)
        }
      ]
    }
  );
  return parseRewriteResponse(parseJsonObject("rewrite", content));
}
