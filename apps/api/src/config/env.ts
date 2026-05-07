import { config } from "dotenv";
import { resolve } from "node:path";

export type HuaweiMaasConfig = {
  apiKey: string;
  chatCompletionsUrl: string;
  model: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} for Huawei MaaS rewrite API`);
  }
  return value;
}

export function loadApiEnv(baseDir = process.cwd()): void {
  config({ path: resolve(baseDir, ".env.local") });
  config({ path: resolve(baseDir, ".env") });
}

export function getHuaweiMaasConfig(): HuaweiMaasConfig {
  return {
    apiKey: requireEnv("HUAWEI_MAAS_API_KEY"),
    chatCompletionsUrl: requireEnv("HUAWEI_MAAS_CHAT_COMPLETIONS_URL"),
    model: requireEnv("HUAWEI_MAAS_MODEL")
  };
}

export function getPort(): number {
  const value = process.env.PORT?.trim() ?? "8787";
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, received: ${value}`);
  }
  return port;
}
