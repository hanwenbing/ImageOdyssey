import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { getHuaweiMaasConfig, loadServerEnvFromDir } from "../server/env";
import { getLocalCaseByNumber } from "../server/localCorpus";

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
  chat_template_kwargs?: {
    thinking?: boolean;
  };
};

type ChatCompletionResult = {
  content: string;
  reasoningContent: string | null;
  responseText: string;
  status: number;
  ms: number;
  requestBodySize: number;
};

const reasoningPreviewLimit = 1000;

function usage(exitCode = 1): never {
  console.error([
    "Usage:",
    "  npm -C web exec tsx -- web/scripts/testMaasModels.ts <image-path> [case-number] [--full-reasoning] [--no-thinking]",
    "  cd web && npm exec tsx -- scripts/testMaasModels.ts <image-path> [case-number] [--full-reasoning] [--no-thinking]",
    "",
    "Examples:",
    "  npm -C web exec tsx -- web/scripts/testMaasModels.ts data/images/苗雨婷3.JPG 7",
    "  cd web && npm exec tsx -- scripts/testMaasModels.ts ../data/images/苗雨婷3.JPG 7",
    "  cd web && npm exec tsx -- scripts/testMaasModels.ts ../data/images/苗雨婷3.JPG 7 --full-reasoning",
    "  cd web && npm exec tsx -- scripts/testMaasModels.ts ../data/images/苗雨婷3.JPG 7 --no-thinking"
  ].join("\n"));
  process.exit(exitCode);
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage(0);
  }

  const flags = new Set(args.filter((arg) => arg.startsWith("--")));
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const imagePath = positional[0];
  if (!imagePath) {
    usage();
  }

  const caseNumber = positional[1] ? Number(positional[1]) : 7;
  if (!Number.isInteger(caseNumber)) {
    throw new Error(`case-number must be an integer: ${positional[1]}`);
  }

  return {
    imagePath: resolve(imagePath),
    caseNumber,
    fullReasoning: flags.has("--full-reasoning"),
    thinking: !flags.has("--no-thinking")
  };
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
      throw new Error("Image must be JPEG, PNG, or WEBP");
  }
}

async function imageFileToDataUrl(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  if (buffer.length === 0) {
    throw new Error("Image file is empty");
  }

  return `data:${getMimeType(filePath)};base64,${buffer.toString("base64")}`;
}

function requireString(value: unknown, scope: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${scope} must be a non-empty string`);
  }

  return value.trim();
}

async function callChatCompletions(
  apiKey: string,
  url: string,
  payload: ChatCompletionPayload
): Promise<ChatCompletionResult> {
  const requestBody = JSON.stringify(payload);
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: requestBody
  });
  const responseText = await response.text();
  const ms = Date.now() - startedAt;

  if (!response.ok) {
    throw new Error(
      `Huawei MaaS request failed status=${response.status} ms=${ms}: ${responseText.slice(0, 500)}`
    );
  }

  const responseBody = JSON.parse(responseText) as {
    choices?: Array<{
      message?: {
        content?: unknown;
        reasoning_content?: unknown;
      };
    }>;
  };
  const message = responseBody.choices?.[0]?.message;

  return {
    content: requireString(message?.content, "message.content"),
    reasoningContent:
      typeof message?.reasoning_content === "string" && message.reasoning_content.trim().length > 0
        ? message.reasoning_content
        : null,
    responseText,
    status: response.status,
    ms,
    requestBodySize: requestBody.length
  };
}

function buildVisionPayload(model: string, imageDataUrl: string): ChatCompletionPayload {
  return {
    model,
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
            text: "请为后续 GPT Image 2 中文提示词匹配生成一段紧凑但信息充分的图片描述。"
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
  };
}

function buildRewritePayload(
  model: string,
  thinking: boolean,
  imageDescription: string,
  caseNumber: number,
  caseTitle: string,
  originalPromptText: string
): ChatCompletionPayload {
  return {
    model,
    chat_template_kwargs: {
      thinking
    },
    messages: [
      {
        role: "system",
        content:
          "你是中文 GPT Image 2 提示词改写助手。只返回一个 JSON 对象，不要 Markdown、代码块或解释。"
      },
      {
        role: "user",
        content: [
          "请把 Source image 的主体锚定到选中案例 prompt 中，尽量保留案例的目标场景、风格、构图、光线、道具、文字和视觉语言。",
          'JSON schema: {"rewritten_prompt_text":string,"preserved_parts":[string],"changed_parts":[string]}',
          "rewritten_prompt_text 必须是可直接复制到 ChatGPT / GPT Image 2 的自然语言中文提示词。",
          "",
          "Source image description:",
          imageDescription,
          "",
          "Case:",
          JSON.stringify(
            {
              case_number: caseNumber,
              title: caseTitle,
              original_prompt_text: originalPromptText
            },
            null,
            2
          )
        ].join("\n")
      }
    ]
  };
}

function printSection(title: string, content: string): void {
  console.log(`\n${title}`);
  console.log(content);
}

function previewReasoning(reasoningContent: string | null, fullReasoning: boolean): string {
  if (!reasoningContent) {
    return "empty or not returned";
  }

  if (fullReasoning || reasoningContent.length <= reasoningPreviewLimit) {
    return reasoningContent;
  }

  return `${reasoningContent.slice(0, reasoningPreviewLimit)}\n... <truncated ${reasoningContent.length - reasoningPreviewLimit} chars; use --full-reasoning>`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  loadServerEnvFromDir();
  const config = getHuaweiMaasConfig();
  const caseRecord = getLocalCaseByNumber(args.caseNumber);
  const imageDataUrl = await imageFileToDataUrl(args.imagePath);
  const totalStartedAt = Date.now();

  console.log(`[input] image=${args.imagePath}`);
  console.log(`[input] case=${caseRecord.case_number} ${caseRecord.title}`);
  console.log(`[input] image_data_url_chars=${imageDataUrl.length}`);
  console.log(`[input] thinking=${args.thinking}`);

  const visionResult = await callChatCompletions(
    config.apiKey,
    config.visionChatCompletionsUrl,
    buildVisionPayload(config.visionModel, imageDataUrl)
  );

  console.log(
    `[vision] model=${config.visionModel} status=${visionResult.status} ms=${visionResult.ms} body_chars=${visionResult.requestBodySize}`
  );
  printSection("[vision] description", visionResult.content);

  const rewriteResult = await callChatCompletions(
    config.apiKey,
    config.chatCompletionsUrl,
    buildRewritePayload(
      config.model,
      args.thinking,
      visionResult.content,
      caseRecord.case_number,
      caseRecord.title,
      caseRecord.prompt_text
    )
  );

  console.log(
    `[deepseek] model=${config.model} status=${rewriteResult.status} ms=${rewriteResult.ms} body_chars=${rewriteResult.requestBodySize}`
  );
  console.log(
    `[deepseek reasoning] chars=${rewriteResult.reasoningContent?.length ?? 0}`
  );
  printSection(
    "[deepseek reasoning]",
    previewReasoning(rewriteResult.reasoningContent, args.fullReasoning)
  );
  printSection("[deepseek final]", rewriteResult.content);

  console.log(`[summary] total_ms=${Date.now() - totalStartedAt}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[error] ${message}`);
  process.exit(1);
});
