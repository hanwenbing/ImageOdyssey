import type { HuaweiMaasConfig } from "../config/env";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type TextCompletion = (messages: ChatMessage[]) => Promise<{ content: string }>;

type MaaSChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export function createHuaweiMaasClient(
  config: HuaweiMaasConfig,
  fetchImpl: typeof fetch = fetch
): { complete: TextCompletion } {
  return {
    async complete(messages) {
      const response = await fetchImpl(config.chatCompletionsUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.2
        })
      });

      if (!response.ok) {
        throw new Error(`Huawei MaaS rewrite request failed with status ${response.status}`);
      }

      const body = (await response.json()) as MaaSChatResponse;
      const content = body.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("Huawei MaaS rewrite response did not include message content");
      }

      return { content };
    }
  };
}
