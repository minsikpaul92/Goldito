import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

/**
 * Header trial (team pick, Oct 22): who you're signed in as.
 * - `now`: today's header — role chip, bell, ≡.
 * - `a`: the avatar is the menu (Instagram style); the role chip stays.
 * - `c`: "Name · Role" under the screen title and the avatar menu; no role chip.
 * Pick with `?header=a|c|now` or the switch under the desktop phone frame. Saved in localStorage, which the frame
 * and the app inside it share, so flipping it outside the phone updates the header live. Remove once the team picks.
 */
export type HeaderStyle = "now" | "a" | "c";

export const HEADER_STYLES: { value: HeaderStyle; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "a", label: "A · Avatar" },
  { value: "c", label: "C · Name" },
];

const KEY = "goldito.header";
const DEFAULT: HeaderStyle = "a";
const CHANGE = "goldito-header";
const web = Platform.OS === "web" && typeof window !== "undefined";

const isStyle = (v: unknown): v is HeaderStyle => v === "now" || v === "a" || v === "c";

// The URL param is applied once per page load, so the switch can change it afterwards.
let paramApplied = false;

function read(): HeaderStyle {
  if (!web) return DEFAULT;
  try {
    const param = new URLSearchParams(window.location.search).get("header");
    if (!paramApplied && isStyle(param)) {
      paramApplied = true;
      window.localStorage.setItem(KEY, param);
      return param;
    }
    const saved = window.localStorage.getItem(KEY);
    return isStyle(saved) ? saved : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setHeaderStyle(style: HeaderStyle) {
  if (!web) return;
  try {
    window.localStorage.setItem(KEY, style);
  } catch {
    // Storage blocked: nothing to switch.
  }
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onChange: () => void) {
  if (!web) return () => undefined;
  // `storage` fires in the app iframe when the frame outside it writes the key; CHANGE covers the same window.
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE, onChange);
  };
}

export function useHeaderStyle(): HeaderStyle {
  return useSyncExternalStore(subscribe, read, () => DEFAULT);
}
