import { ApiError, getApiBaseUrl } from "./api";
import { DemoSet, JUDGE_SETS, findDemoAccount } from "./demo";
import { getSupabase } from "./supabase";

/**
 * Judge seats (#411, migration 015t): a judge set is held by one browser at a time. The browser keeps a random holder
 * id (both phones of the split view share it, same origin); the backend takes a seat and resets the set for a new
 * judge, the app keeps it with a heartbeat and frees it on sign-out. A seat without a heartbeat for 10 minutes is free.
 */

export const HEARTBEAT_MS = 60_000;

const HOLDER_KEY = "goldito-judge-holder";
const CHANNEL = "goldito-judge";

export type SeatStatus = { set: string; inUse: boolean; mine: boolean };

let memoryHolder: string | null = null;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // RFC 4122 v4 from Math.random, for an old browser (the id only has to be hard to guess, not secret).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** This browser's holder id, made once and kept in localStorage (memory only when storage is blocked). */
export function holderId(): string {
  try {
    const stored = window.localStorage.getItem(HOLDER_KEY);
    if (stored) return stored;
    const id = newId();
    window.localStorage.setItem(HOLDER_KEY, id);
    return id;
  } catch {
    memoryHolder ??= newId();
    return memoryHolder;
  }
}

/** The judge set an email belongs to, or null (team sets and real accounts have no seat). */
export function judgeSetFor(email: string | undefined | null): DemoSet | null {
  const found = findDemoAccount(email);
  return found?.set.judge ? found.set : null;
}

export async function fetchSeats(): Promise<SeatStatus[]> {
  const { data, error } = await getSupabase().rpc("judge_seat_status", { p_holder: holderId() });
  if (error) throw error;
  return ((data ?? []) as { set_key: string; in_use: boolean; mine: boolean }[]).map((row) => ({
    set: row.set_key,
    inUse: row.in_use,
    mine: row.mine,
  }));
}

/** Takes a seat (the backend resets the set when another judge had it). Throws with a short message when it is taken. */
export async function takeSeat(set: string): Promise<{ fresh: boolean }> {
  const base = getApiBaseUrl();
  if (!base) throw new ApiError("API URL is not set.", 0, "not_configured");
  let response: Response;
  try {
    response = await fetch(`${base}/api/demo/seat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ set, holder: holderId() }),
    });
  } catch {
    throw new ApiError("Can't reach Goldito. Try again.", 0, "network");
  }
  const payload = (await response.json().catch(() => ({}))) as { fresh?: boolean; detail?: string };
  if (!response.ok) throw new ApiError(payload.detail || "Try again.", response.status, "http_error");
  return { fresh: Boolean(payload.fresh) };
}

/** False when the seat is gone (released in the other phone, or another judge took it after a timeout). */
export async function heartbeat(set: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("judge_seat_heartbeat", { p_set: set, p_holder: holderId() });
  // A network blip is not a lost seat; the next beat tries again.
  if (error) return true;
  return data === true;
}

/** Frees the seat and tells this browser's other phone, which signs out too. */
export async function releaseSeat(set: string): Promise<void> {
  try {
    await getSupabase().rpc("release_judge_seat", { p_set: set, p_holder: holderId() });
  } catch {
    // The 10-minute timeout frees it anyway.
  }
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ released: set });
    channel.close();
  } catch {
    // No BroadcastChannel: the other phone's next heartbeat finds out.
  }
}

/** Calls back when this browser's other phone released a seat. */
export function onSeatReleased(listener: (set: string) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    const set = (event.data as { released?: unknown })?.released;
    if (typeof set === "string") listener(set);
  };
  return () => channel.close();
}

export function isJudgeSetKey(key: string): boolean {
  return JUDGE_SETS.some((set) => set.key === key);
}
