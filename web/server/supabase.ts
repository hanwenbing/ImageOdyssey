import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/types";
import { getSupabaseServerConfig } from "./env";

let cachedServiceRoleClient: SupabaseClient<Database> | null = null;

export function getServiceRoleClient(): SupabaseClient<Database> {
  if (cachedServiceRoleClient) {
    return cachedServiceRoleClient;
  }

  const { supabaseUrl, secretKey } = getSupabaseServerConfig();
  cachedServiceRoleClient = createClient<Database>(supabaseUrl, secretKey, {
    auth: {
      persistSession: false
    }
  });

  return cachedServiceRoleClient;
}
