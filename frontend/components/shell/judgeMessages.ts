import type { DemoState } from "../../lib/demoReset";
import type { Role } from "../../providers/SessionProvider";
import type { ScriptStep } from "./judgeScript";

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

/**
 * The judge panel (#413, frame page) → a phone: reset the judge's set, open a screen as one account of the set, or play
 * the part a judge cannot do alone. The phone answers each with JUDGE_DONE and the same id.
 */
export const JUDGE_COMMAND = "goldito:judge-command";
export const JUDGE_DONE = "goldito:judge-done";

export type JudgeCommand =
  | { type: typeof JUDGE_COMMAND; id: string; op: "reset"; state: DemoState }
  | {
      type: typeof JUDGE_COMMAND;
      id: string;
      op: "go";
      set: string;
      role: Role;
      path: string;
      highlight: string | null;
      /** Taps and typing the phone plays by itself once the screen is open (judgeScript); `pace` 2 is half speed. */
      script: ScriptStep[] | null;
      pace?: number;
    }
  | { type: typeof JUDGE_COMMAND; id: string; op: "play"; set: string; what: "reply" | "drive"; role: Role }
  /** Play steps on the screen that is open now (the second phone of a scene, after the first). */
  | { type: typeof JUDGE_COMMAND; id: string; op: "run"; script: ScriptStep[]; pace?: number }
  /** Stop the steps playing now; the judge carries on by hand. */
  | { type: typeof JUDGE_COMMAND; id: string; op: "stop" };

export type JudgeDone = { type: typeof JUDGE_DONE; id: string; ok: boolean; error?: string };

/** A phone finished playing a scene's script (after the full load that opened its screen). */
export const JUDGE_PLAYED = "goldito:judge-played";

export type JudgePlayed = { type: typeof JUDGE_PLAYED; pane: string; ok: boolean; stopped?: boolean; error?: string };

export function isJudgePlayed(data: unknown): data is JudgePlayed {
  return typed(data, JUDGE_PLAYED);
}

export function isJudgeCommand(data: unknown): data is JudgeCommand {
  return typed(data, JUDGE_COMMAND);
}

export function isJudgeDone(data: unknown): data is JudgeDone {
  return typed(data, JUDGE_DONE);
}

export function otherRole(role: Role): Role {
  return role === "owner" ? "sitter" : "owner";
}
