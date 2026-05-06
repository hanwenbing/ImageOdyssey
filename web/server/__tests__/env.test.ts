// @vitest-environment node

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getHuaweiMaasConfig, getSupabaseServerConfig, loadServerEnvFromDir } from "../env";

const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  HUAWEI_MAAS_API_KEY: process.env.HUAWEI_MAAS_API_KEY,
  HUAWEI_MAAS_CHAT_COMPLETIONS_URL: process.env.HUAWEI_MAAS_CHAT_COMPLETIONS_URL,
  HUAWEI_MAAS_MODEL: process.env.HUAWEI_MAAS_MODEL,
  HUAWEI_MAAS_VISION_CHAT_COMPLETIONS_URL: process.env.HUAWEI_MAAS_VISION_CHAT_COMPLETIONS_URL,
  HUAWEI_MAAS_VISION_MODEL: process.env.HUAWEI_MAAS_VISION_MODEL,
  SAMPLE_ONLY_IN_ENV: process.env.SAMPLE_ONLY_IN_ENV
};

afterEach(() => {
  process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = originalEnv.SUPABASE_SECRET_KEY;
  process.env.HUAWEI_MAAS_API_KEY = originalEnv.HUAWEI_MAAS_API_KEY;
  process.env.HUAWEI_MAAS_CHAT_COMPLETIONS_URL = originalEnv.HUAWEI_MAAS_CHAT_COMPLETIONS_URL;
  process.env.HUAWEI_MAAS_MODEL = originalEnv.HUAWEI_MAAS_MODEL;
  process.env.HUAWEI_MAAS_VISION_CHAT_COMPLETIONS_URL =
    originalEnv.HUAWEI_MAAS_VISION_CHAT_COMPLETIONS_URL;
  process.env.HUAWEI_MAAS_VISION_MODEL = originalEnv.HUAWEI_MAAS_VISION_MODEL;
  process.env.SAMPLE_ONLY_IN_ENV = originalEnv.SAMPLE_ONLY_IN_ENV;
});

describe("server env loading", () => {
  it("keeps shell env ahead of .env.local and .env", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "imageodyssey-env-"));
    writeFileSync(
      join(tempDir, ".env"),
      ["SUPABASE_URL=https://env.example", "SAMPLE_ONLY_IN_ENV=from-env"].join("\n"),
      "utf8"
    );
    writeFileSync(
      join(tempDir, ".env.local"),
      [
        "SUPABASE_URL=https://local.example",
        "SUPABASE_SECRET_KEY=local-secret-key",
        "SAMPLE_ONLY_IN_ENV=from-local"
      ].join("\n"),
      "utf8"
    );

    process.env.SUPABASE_URL = "https://shell.example";
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SAMPLE_ONLY_IN_ENV;

    loadServerEnvFromDir(tempDir);

    const config = getSupabaseServerConfig();
    expect(config).toEqual({
      supabaseUrl: "https://shell.example",
      secretKey: "local-secret-key"
    });
    expect(process.env.SAMPLE_ONLY_IN_ENV).toBe("from-local");
  });

  it("fails explicitly when the Supabase server config is missing", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;

    expect(() => getSupabaseServerConfig()).toThrow(
      /SUPABASE_URL and SUPABASE_SECRET_KEY/
    );
  });

  it("returns MaaS defaults with a configured API key", () => {
    process.env.HUAWEI_MAAS_API_KEY = "maas-key";
    delete process.env.HUAWEI_MAAS_CHAT_COMPLETIONS_URL;
    delete process.env.HUAWEI_MAAS_MODEL;
    delete process.env.HUAWEI_MAAS_VISION_CHAT_COMPLETIONS_URL;
    delete process.env.HUAWEI_MAAS_VISION_MODEL;

    expect(getHuaweiMaasConfig()).toEqual({
      apiKey: "maas-key",
      chatCompletionsUrl: "https://api.modelarts-maas.com/v2/chat/completions",
      model: "deepseek-v4-flash",
      visionChatCompletionsUrl: "https://api.modelarts-maas.com/v1/chat/completions",
      visionModel: "qwen2.5-vl-72b"
    });
  });

  it("fails explicitly when MaaS API key is missing", () => {
    delete process.env.HUAWEI_MAAS_API_KEY;

    expect(() => getHuaweiMaasConfig()).toThrow(/HUAWEI_MAAS_API_KEY/);
  });
});
