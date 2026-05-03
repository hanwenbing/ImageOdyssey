import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(serverDir, "..");

export function loadServerEnvFromDir(baseDir = webRoot): void {
  config({ path: resolve(baseDir, ".env.local") });
  config({ path: resolve(baseDir, ".env") });
}

export function getSupabaseServiceRoleConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for Supabase routes");
  }

  return {
    supabaseUrl,
    serviceRoleKey
  };
}
