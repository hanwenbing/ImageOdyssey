import { rewriteResponseSchema, type RewriteRequest, type RewriteResponse } from "@imageodyssey/shared";
import { getHuaweiMaasConfig } from "../config/env";
import { createHuaweiMaasClient, type ChatMessage, type TextCompletion } from "./huaweiMaasClient";

export function buildRewriteMessages(originalPromptText: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是中文图像生成 Prompt 改写助手。任务是把现有 Prompt 改写成适合用户在 ChatGPT 中同时上传人物照片使用的版本。改写必须以用户上传图片中的人物为主体，保持其样貌、神态和人物身份特征基本不变。删除或弱化可能改变上传人物年龄、性别、样貌、神态、身份特征的描述；保留不冲突的场景、服装、动作、道具、构图、镜头、光线、色彩、文字和风格要求。不要新增图片上传说明以外的新设定。"
    },
    {
      role: "user",
      content: `请改写下面的中文 Prompt，使整体语义通顺一致。只返回 JSON，格式为 {"rewritten_prompt_text":"..."}。\n\n原始 Prompt：\n${originalPromptText}`
    }
  ];
}

function parseRewriteContent(content: string): RewriteResponse {
  try {
    return rewriteResponseSchema.parse(JSON.parse(content));
  } catch {
    return rewriteResponseSchema.parse({ rewritten_prompt_text: content.trim() });
  }
}

export async function rewritePrompt(
  request: RewriteRequest,
  complete: TextCompletion = createHuaweiMaasClient(getHuaweiMaasConfig()).complete
): Promise<RewriteResponse> {
  const completion = await complete(buildRewriteMessages(request.original_prompt_text));
  return parseRewriteContent(completion.content);
}
