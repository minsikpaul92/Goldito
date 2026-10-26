import { apiPost } from "../../lib/api";

export type ChatChip = { id: string; label: string };

/** One thing to do next that their last message leads to (open a card or a sheet). The person presses it (D62). */
export type ChatAction = { id: string; label: string };

export type ChatChips = {
  chips: ChatChip[];
  action: ChatAction | null;
  /** The other person's latest text the chips answer; null at the start of a chat. */
  forMessageId: string | null;
  source: "model" | "fallback";
};

/**
 * Two or three short replies to what the other person just wrote (D62: only suggestions, the person presses Send).
 * Never throws: with no AI the chat simply has no chips, and typing always works.
 */
export async function fetchChatChips(threadId: string): Promise<ChatChips | null> {
  try {
    const r = await apiPost<{ chips: ChatChip[]; action?: ChatAction | null; for_message_id: string | null; source: "model" | "fallback" }>(
      "/api/ai/chat-chips",
      { thread_id: threadId },
    );
    if (!r || !Array.isArray(r.chips)) return null; // anything but a list of chips is "no AI"
    return {
      chips: r.chips.filter((c) => c && typeof c.label === "string" && c.label.trim() !== ""),
      action: r.action && typeof r.action.id === "string" && typeof r.action.label === "string" ? r.action : null,
      forMessageId: r.for_message_id ?? null,
      source: r.source,
    };
  } catch {
    return null;
  }
}

/** How long the box has to stay still before the chips follow what is typed in it (#235). */
export const TYPED_PAUSE_MS = 1500;

/**
 * Chips that fit the text being typed. Only labels come back; null means "keep the usual chips" (nothing useful, or the
 * AI could not be reached). Never throws and never sends anything.
 */
export async function fetchTypedChips(threadId: string, typed: string): Promise<ChatChip[] | null> {
  try {
    const r = await apiPost<{ chips: ChatChip[] }>("/api/ai/chat-chips", { thread_id: threadId, typed: typed.slice(0, 300) });
    if (!r || !Array.isArray(r.chips)) return null;
    const chips = r.chips.filter((c) => c && typeof c.label === "string" && c.label.trim() !== "");
    return chips.length > 0 ? chips : null;
  } catch {
    return null;
  }
}

/** The tapped chip as one short message in my voice, to edit in the box. null when the AI could not be reached. */
export async function fetchChatDraft(threadId: string, chip: string, typed?: string): Promise<string | null> {
  try {
    const r = await apiPost<{ text?: string }>("/api/ai/chat-draft", { thread_id: threadId, chip, ...(typed?.trim() ? { typed: typed.trim().slice(0, 300) } : {}) });
    return typeof r?.text === "string" && r.text.trim() !== "" ? r.text : null;
  } catch {
    return null;
  }
}

/** Whether the sitter's latest message says yes to the stay (the app then brings up the Meet & Greet). false when unsure or down. */
export async function fetchSitterYes(threadId: string): Promise<boolean> {
  try {
    const r = await apiPost<{ yes?: boolean }>("/api/ai/chat-yes", { thread_id: threadId });
    return r?.yes === true;
  } catch {
    return false;
  }
}

const TTL_MS = 10 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 1000;
const asked = new Map<string, { at: number; promise: Promise<ChatChips | null> }>();

/**
 * The chips for the latest message of a chat, asked once per (chat, message time) and shared: the list asks ahead for
 * chats with something new, so the chat opens with its chips ready. A failed ask is tried again after a minute.
 */
export function chipsFor(threadId: string, latestAt: string): Promise<ChatChips | null> {
  const key = `${threadId}:${latestAt}`;
  const hit = asked.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const entry = { at: Date.now(), promise: fetchChatChips(threadId) };
  asked.set(key, entry);
  void entry.promise.then((r) => {
    if (!r) entry.at = Date.now() - TTL_MS + RETRY_AFTER_MS;
  });
  return entry.promise;
}

export function prefetchChatChips(threadId: string, latestAt: string): void {
  void chipsFor(threadId, latestAt);
}
