import { tokens } from "../../theme/tokens";

export type Presentation = "direct" | "framed";

export type FrameOverride = "on" | "off" | null;

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
  /** Browser window width in CSS px. */
  width: number;
  override: FrameOverride;
};

/** Single place that decides how the web app is shown (architecture D25). */
export function resolvePresentation({
  embedded,
  width,
  override,
}: PresentationInput): Presentation {
  if (embedded || override === "off") return "direct";
  if (override === "on") return "framed";
  return width >= tokens.breakpoint.framed ? "framed" : "direct";
}
