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
