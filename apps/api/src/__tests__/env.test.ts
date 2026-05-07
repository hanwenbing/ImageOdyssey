import { afterEach, describe, expect, it } from "vitest";
import { getHuaweiMaasConfig } from "../config/env";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("API env config", () => {
  it("requires every Huawei MaaS text config value", () => {
    delete process.env.HUAWEI_MAAS_API_KEY;
    process.env.HUAWEI_MAAS_CHAT_COMPLETIONS_URL = "https://api.modelarts-maas.com/v2/chat/completions";
    process.env.HUAWEI_MAAS_MODEL = "deepseek-v4-flash";

    expect(() => getHuaweiMaasConfig()).toThrow(/HUAWEI_MAAS_API_KEY/);
  });

  it("returns trimmed Huawei MaaS config", () => {
    process.env.HUAWEI_MAAS_API_KEY = " key ";
    process.env.HUAWEI_MAAS_CHAT_COMPLETIONS_URL = " https://api.modelarts-maas.com/v2/chat/completions ";
    process.env.HUAWEI_MAAS_MODEL = " deepseek-v4-flash ";

    expect(getHuaweiMaasConfig()).toEqual({
      apiKey: "key",
      chatCompletionsUrl: "https://api.modelarts-maas.com/v2/chat/completions",
      model: "deepseek-v4-flash"
    });
  });
});
