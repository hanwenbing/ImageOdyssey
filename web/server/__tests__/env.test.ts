// @vitest-environment node

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getSupabaseServerConfig, loadServerEnvFromDir } from "../env";

const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  SAMPLE_ONLY_IN_ENV: process.env.SAMPLE_ONLY_IN_ENV
};

afterEach(() => {
  process.env.SUPABASE_URL = originalEnv.SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = originalEnv.SUPABASE_SECRET_KEY;
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
});
