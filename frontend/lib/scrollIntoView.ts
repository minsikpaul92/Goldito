import type { RefObject } from "react";
import { Platform, View } from "react-native";

/** Brings a view into sight (web): after chips arrive below the fold, the page scrolls down to them. */
export function scrollIntoView(ref: RefObject<View | null>): void {
  if (Platform.OS !== "web") return;
  const el = ref.current as unknown as HTMLElement | null;
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
}
