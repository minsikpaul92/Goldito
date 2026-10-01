export type Presentation = "direct" | "framed";

export type FrameOverride = "on" | "off" | null;

/** Primary input is a finger (phones, tablets). Mouse and trackpad report `fine`. */
export const TOUCH_PRIMARY_QUERY = "(pointer: coarse)";

/** Reads `?frame=1` (force on) / `?frame=0` (force off) from a URL search string. */
export function readFrameOverride(search: string): FrameOverride {
  const value = new URLSearchParams(search).get("frame");
  if (value === "1") return "on";
  if (value === "0") return "off";
  return null;
}

type PresentationInput = {
  /** Already running inside the phone frame's iframe. */
  embedded: boolean;
  /** The device's primary input is touch (see TOUCH_PRIMARY_QUERY). */
  touchPrimary: boolean;
  override: FrameOverride;
};

/**
 * Single place that decides how the web app is shown (architecture D25).
 * Computers (mouse / trackpad) always get the phone frame, whatever the window width;
 * phones and tablets get the app full screen.
 */
export function resolvePresentation({
  embedded,
  touchPrimary,
  override,
}: PresentationInput): Presentation {
  if (embedded || override === "off") return "direct";
  if (override === "on") return "framed";
  return touchPrimary ? "direct" : "framed";
}
