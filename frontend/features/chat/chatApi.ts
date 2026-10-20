import { getSupabase } from "../../lib/supabase";

export type ChatPet = { id: string; name: string };

/** The cards a chat can carry. Later steps add quote, Meet & Greet, trip and diary cards. */
export type ChatPlace = { type: "sitter_home" | "owner_home" | "other"; note: string | null };

export type ChatCard =
  | { type: "stay"; dropOffAt: string; pickUpAt: string; pets: ChatPet[] }
  | {
      type: "request";
      bookingId: string;
      serviceType: "boarding" | "house_sitting";
      note: string | null;
      dropOffAt: string;
      pickUpAt: string;
      dropOffPlace: ChatPlace;
      pickUpPlace: ChatPlace;
      pets: ChatPet[];
    }
  | { type: "unknown" };

export type ChatMessage = {
  id: string;
  senderId: string | null;
  kind: "text" | "card";
  body: string | null;
  card: ChatCard | null;
  at: string;
};

export type ChatHeader = {
  threadId: string;
  ownerId: string;
  sitterId: string;
  otherId: string;
  otherName: string;
  myRole: "owner" | "sitter";
};

/** One row of the chat list. */
export type ChatListItem = {
  threadId: string;
  otherId: string;
  otherName: string;
  lastKind: "text" | "card";
  lastBody: string | null;
  lastAt: string;
  unread: number;
};

export type Stay = { dropOffAt: string; pickUpAt: string; petIds: string[] };

export class ChatError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  forbidden: "You can't open this chat.",
  body_required: "Write a message first.",
  body_too_long: "That message is too long.",
  invalid_stay: "Pick a drop-off and a later pick-up.",
};

function fail(error: { message: string }, fallback: string): never {
  throw new ChatError(error.message, MESSAGES[error.message] ?? fallback);
}

/** The preview line of a message in the list. */
export function previewOf(item: Pick<ChatListItem, "lastKind" | "lastBody">): string {
  return item.lastKind === "card" ? "Stay details" : (item.lastBody ?? "");
}

function toCard(raw: unknown): ChatCard {
  const c = raw as {
    type?: string;
    drop_off_at?: string;
    pick_up_at?: string;
    pets?: ChatPet[];
    booking_id?: string;
    service_type?: "boarding" | "house_sitting";
    note?: string | null;
    drop_off_place?: ChatPlace;
    pick_up_place?: ChatPlace;
  } | null;
  if (c?.type === "request" && c.booking_id && c.drop_off_at && c.pick_up_at) {
    return {
      type: "request",
      bookingId: c.booking_id,
      serviceType: c.service_type ?? "boarding",
      note: c.note ?? null,
      dropOffAt: c.drop_off_at,
      pickUpAt: c.pick_up_at,
      dropOffPlace: c.drop_off_place ?? { type: "sitter_home", note: null },
      pickUpPlace: c.pick_up_place ?? { type: "sitter_home", note: null },
      pets: c.pets ?? [],
    };
  }
  if (c?.type === "stay" && c.drop_off_at && c.pick_up_at) {
    return { type: "stay", dropOffAt: c.drop_off_at, pickUpAt: c.pick_up_at, pets: c.pets ?? [] };
  }
  return { type: "unknown" };
}

/** Opens (or finds) the chat with someone; with a stay it posts the first card. Returns the thread id. */
export async function openChatThread(otherId: string, stay?: Stay): Promise<string> {
  const { data, error } = await getSupabase().rpc("open_chat_thread", {
    p_other: otherId,
    p_drop_off_at: stay?.dropOffAt ?? null,
    p_pick_up_at: stay?.pickUpAt ?? null,
    p_pet_ids: stay?.petIds ?? null,
  });
  if (error || !data) fail(error ?? { message: "" }, "Couldn't open the chat. Try again.");
  return (data as { id: string }).id;
}

export async function listMyChats(): Promise<ChatListItem[]> {
  const { data, error } = await getSupabase().rpc("list_my_chats");
  if (error) fail(error, "Couldn't load your chats. Check your connection and try again.");
  return ((data ?? []) as {
    thread_id: string;
    other_id: string;
    other_name: string;
    last_kind: "text" | "card";
    last_body: string | null;
    last_at: string;
    unread_count: number;
  }[]).map((r) => ({
    threadId: r.thread_id,
    otherId: r.other_id,
    otherName: r.other_name,
    lastKind: r.last_kind,
    lastBody: r.last_body,
    lastAt: r.last_at,
    unread: r.unread_count,
  }));
}

export async function getChatHeader(threadId: string): Promise<ChatHeader | null> {
  const { data, error } = await getSupabase().rpc("get_chat_thread", { p_thread: threadId });
  if (error) fail(error, "Couldn't load this chat. Check your connection and try again.");
  const row = ((data ?? []) as {
    thread_id: string;
    owner_id: string;
    sitter_id: string;
    other_id: string;
    other_name: string;
    my_role: "owner" | "sitter";
  }[])[0];
  if (!row) return null;
  return {
    threadId: row.thread_id,
    ownerId: row.owner_id,
    sitterId: row.sitter_id,
    otherId: row.other_id,
    otherName: row.other_name,
    myRole: row.my_role,
  };
}

export async function loadChatMessages(threadId: string): Promise<ChatMessage[]> {
  const { data, error } = await getSupabase()
    .from("chat_messages")
    .select("id, sender_id, kind, body, card, created_at")
    .eq("thread_id", threadId)
    .order("created_at");
  if (error) fail(error, "Couldn't load the messages. Check your connection and try again.");
  return ((data ?? []) as {
    id: string;
    sender_id: string | null;
    kind: "text" | "card";
    body: string | null;
    card: unknown;
    created_at: string;
  }[]).map((m) => ({
    id: m.id,
    senderId: m.sender_id,
    kind: m.kind,
    body: m.body,
    card: m.kind === "card" ? toCard(m.card) : null,
    at: m.created_at,
  }));
}

export async function sendChatMessage(threadId: string, body: string): Promise<void> {
  const { error } = await getSupabase().rpc("send_chat_message", { p_thread: threadId, p_body: body });
  if (error) fail(error, "Couldn't send that. Try again.");
}

export async function markChatRead(threadId: string): Promise<void> {
  await getSupabase().rpc("mark_chat_read", { p_thread: threadId });
}

export async function leaveChat(threadId: string): Promise<void> {
  const { error } = await getSupabase().rpc("leave_chat", { p_thread: threadId });
  if (error) fail(error, "Couldn't leave the chat. Try again.");
}

/** After request_booking from the chat: the request goes into the thread as one card for the sitter to read. */
export async function postBookingRequestCard(threadId: string, bookingId: string): Promise<void> {
  const { error } = await getSupabase().rpc("post_booking_request_card", { p_thread: threadId, p_booking: bookingId });
  if (error) fail(error, "The request was sent, but it did not show in the chat.");
}
