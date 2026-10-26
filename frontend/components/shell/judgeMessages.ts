import { Role } from "../../providers/SessionProvider";

/**
 * Judge seats (#411) between the app inside a phone frame and the page around it. Same origin only.
 * - app → frame: this phone took a judge seat and signed in as `role`; in the split view the frame signs the other
 *   phone in to the other account of the same set.
 * - frame → app: sign in to an account of a judge set this browser already holds.
 */
export const JUDGE_SEAT = "goldito:judge-seat";
export const JUDGE_SIGN_IN = "goldito:judge-sign-in";

export type JudgeSeatMessage = { type: typeof JUDGE_SEAT; pane: string; set: string; role: Role };
export type JudgeSignInMessage = { type: typeof JUDGE_SIGN_IN; set: string; role: Role };

function typed(data: unknown, type: string): boolean {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === type;
}

export function isJudgeSeatMessage(data: unknown): data is JudgeSeatMessage {
  return typed(data, JUDGE_SEAT);
}

export function isJudgeSignInMessage(data: unknown): data is JudgeSignInMessage {
  return typed(data, JUDGE_SIGN_IN);
}

/** Tells the frame around this phone (if any) that it took a judge seat. */
export function postJudgeSeat(set: string, role: Role): void {
  if (typeof window === "undefined" || window.parent === window) return;
  const message: JudgeSeatMessage = { type: JUDGE_SEAT, pane: window.name, set, role };
  try {
    window.parent.postMessage(message, window.location.origin);
  } catch {
    // The page around us is not ours.
  }
}

/** The phone iframe the frame page shows under this name ("" for the one-phone frame). */
export function paneWindow(name: string): Window | null {
  if (typeof document === "undefined") return null;
  const frames = Array.from(document.querySelectorAll("iframe"));
  return frames.find((frame) => (frame.getAttribute("name") ?? "") === name)?.contentWindow ?? null;
}

export function otherRole(role: Role): Role {
  return role === "owner" ? "sitter" : "owner";
}
