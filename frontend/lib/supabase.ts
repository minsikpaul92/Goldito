import AsyncStorage from "@react-native-async-storage/async-storage";
import { SupabaseClient, createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const SUPABASE_NOT_CONFIGURED =
  "Supabase is not set up. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to frontend/.env and restart Expo.";

/**
 * Where the session is stored. The split view (Phase 10.10) names each phone's iframe `pane-left` /
 * `pane-right`, and each gets its own key so two accounts are signed in at once; everywhere else
 * it is the one fixed key.
 */
export function getAuthStorageKey(): string {
  const name = typeof window !== "undefined" && typeof window.name === "string" ? window.name : "";
  return name.startsWith("pane-") ? `goldito-auth-${name}` : "goldito-auth";
}

let client: SupabaseClient | null = null;

/**
 * Created on first use, so the desktop frame's outer page (which renders no app)
 * never starts a second client that refreshes the same session.
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(SUPABASE_NOT_CONFIGURED);
  }
  client ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      storageKey: getAuthStorageKey(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
