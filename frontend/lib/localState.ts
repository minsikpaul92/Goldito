import { Platform } from "react-native";

/**
 * Small per-device memory for things that are not worth a table: "I dismissed this card", "I packed
 * the food". Web only for now (localStorage); on a phone it is a no-op until the native build, so the
 * value lasts until the screen closes. Blocked storage (private mode) never throws.
 */
export function loadLocal<T>(key: string, fallback: T): T {
  if (Platform.OS !== "web") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveLocal(key: string, value: unknown): void {
  if (Platform.OS !== "web") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the screen still works, it just forgets next time.
  }
}
