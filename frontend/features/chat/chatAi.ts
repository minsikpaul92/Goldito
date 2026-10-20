import { apiPost } from "../../lib/api";

export type ChatChip = { id: string; label: string };

export type ChatChips = {
  chips: ChatChip[];
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
    const r = await apiPost<{ chips: ChatChip[]; for_message_id: string | null; source: "model" | "fallback" }>("/api/ai/chat-chips", {
      thread_id: threadId,
    });
    if (!r || !Array.isArray(r.chips)) return null; // anything but a list of chips is "no AI"
    return {
      chips: r.chips.filter((c) => c && typeof c.label === "string" && c.label.trim() !== ""),
      forMessageId: r.for_message_id ?? null,
      source: r.source,
    };
  } catch {
    return null;
  }
}

/** The tapped chip as one short message in my voice, to edit in the box. null when the AI could not be reached. */
export async function fetchChatDraft(threadId: string, chip: string): Promise<string | null> {
  try {
    const r = await apiPost<{ text?: string }>("/api/ai/chat-draft", { thread_id: threadId, chip });
    return typeof r?.text === "string" && r.text.trim() !== "" ? r.text : null;
  } catch {
    return null;
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
