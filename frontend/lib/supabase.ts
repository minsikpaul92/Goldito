import AsyncStorage from "@react-native-async-storage/async-storage";
import { SupabaseClient, createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const SUPABASE_NOT_CONFIGURED =
  "Supabase is not set up. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to frontend/.env and restart Expo.";

/**
 * Where the session is stored. One fixed key for now; the split view (Phase 10.10)
 * gives each phone pane its own key so two demo accounts can be signed in at once.
 */
export function getAuthStorageKey(): string {
  return "goldito-auth";
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
