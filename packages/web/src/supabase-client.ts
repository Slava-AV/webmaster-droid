import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { ResolvedWebmasterDroidConfig } from "./types";

const supabaseClientCache = new Map<string, SupabaseClient>();

export function getSupabaseBrowserClient(
  config: ResolvedWebmasterDroidConfig
): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return null;
  }

  const cacheKey = `${config.supabaseUrl}::${config.supabaseAnonKey}`;
  const cached = supabaseClientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  supabaseClientCache.set(cacheKey, client);
  return client;
}
