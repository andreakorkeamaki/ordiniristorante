import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerSecretEnv } from "@/lib/supabase/config";

let adminClient: SupabaseClient | null = null;

export function createAdminClient() {
  if (adminClient) return adminClient;

  const { url, key } = getSupabaseServerSecretEnv();
  adminClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return adminClient;
}
