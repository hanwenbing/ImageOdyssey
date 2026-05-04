import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/types";
import { getSupabaseServiceRoleConfig } from "./env";

let cachedServiceRoleClient: SupabaseClient<Database> | null = null;

export function getServiceRoleClient(): SupabaseClient<Database> {
  if (cachedServiceRoleClient) {
    return cachedServiceRoleClient;
  }

  const { supabaseUrl, serviceRoleKey } = getSupabaseServiceRoleConfig();
  cachedServiceRoleClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  });

  return cachedServiceRoleClient;
}
