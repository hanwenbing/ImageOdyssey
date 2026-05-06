import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(serverDir, "..");

export function loadServerEnvFromDir(baseDir = webRoot): void {
  config({ path: resolve(baseDir, ".env.local") });
  config({ path: resolve(baseDir, ".env") });
}

export function getSupabaseServerConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl || !secretKey) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_SECRET_KEY for Supabase routes");
  }

  return {
    supabaseUrl,
    secretKey
  };
}

export function getHuaweiMaasConfig() {
  const apiKey = process.env.HUAWEI_MAAS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing HUAWEI_MAAS_API_KEY for MaaS AI routes");
  }

  return {
    apiKey,
    chatCompletionsUrl:
      process.env.HUAWEI_MAAS_CHAT_COMPLETIONS_URL?.trim() ||
      "https://api.modelarts-maas.com/v2/chat/completions",
    model: process.env.HUAWEI_MAAS_MODEL?.trim() || "deepseek-v4-flash",
    visionChatCompletionsUrl:
      process.env.HUAWEI_MAAS_VISION_CHAT_COMPLETIONS_URL?.trim() ||
      "https://api.modelarts-maas.com/v1/chat/completions",
    visionModel: process.env.HUAWEI_MAAS_VISION_MODEL?.trim() || "qwen2.5-vl-72b"
  };
}
