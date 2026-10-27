export type Presentation = "direct" | "framed" | "split";

/** Below this window width two phones don't fit side by side; `?view=split` falls back to one phone (10.10). */
export const SPLIT_MIN_WIDTH = 900;

/** `?view=split` asks for the owner and sitter phones side by side (10.10, judges' demo link). */
export function readSplitRequest(search: string): boolean {
  return new URLSearchParams(search).get("view") === "split";
}

const JUDGE_START_KEY = "goldito-judge-start";

/**
 * Try the demo took this Judge seat (#411): the page around the phone opens both phones, the owner left and the sitter
 * right. The seat goes by sessionStorage (shared with the phones, same origin), not the URL, so a reload after log out
 * never signs in again.
 */
export function openJudgeSplit(set: string): void {
  try {
    window.sessionStorage.setItem(JUDGE_START_KEY, set);
  } catch {
    // No storage: both phones open at Log in, where the seat is already this browser's.
  }
  (window.top ?? window).location.assign("/?view=split");
}

/** The Judge seat Try the demo just took (see openJudgeSplit), or null. */
export function readJudgeStart(): string | null {
  try {
    const set = window.sessionStorage.getItem(JUDGE_START_KEY);
    return set && /^judge\d+$/.test(set) ? set : null;
  } catch {
    return null;
  }
}

export function clearJudgeStart(): void {
  try {
    window.sessionStorage.removeItem(JUDGE_START_KEY);
  } catch {
    // Nothing stored.
  }
}

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
  /** `?view=split` is on the URL. */
  split: boolean;
  windowWidth: number;
};

/**
 * Single place that decides how the web app is shown (architecture D25).
 * Computers (mouse / trackpad) always get the phone frame, whatever the window width;
 * phones and tablets get the app full screen. `?view=split` shows two phones on a wide computer window.
 */
export function resolvePresentation({
  embedded,
  touchPrimary,
  override,
  split,
  windowWidth,
}: PresentationInput): Presentation {
  if (embedded || override === "off") return "direct";
  if (split && !touchPrimary && windowWidth >= SPLIT_MIN_WIDTH) return "split";
  if (override === "on") return "framed";
  return touchPrimary ? "direct" : "framed";
}
