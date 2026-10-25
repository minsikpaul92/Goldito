import { PriceQuote, asQuote, priceErrorMessage } from "../../lib/bookings";
import { getSupabase } from "../../lib/supabase";
import type { Species } from "../../types/db";

export type ChatPet = { id: string; name: string };

/** The cards a chat can carry. Later steps add quote, Meet & Greet, trip and diary cards. */
export type ChatPlace = { type: "sitter_home" | "owner_home" | "other"; note: string | null };

export type ChatQuoteExtra = { id: string; label: string; amount: number; status: "offered" | "accepted" | "declined" };

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
  | {
      type: "quote";
      serviceType: "boarding" | "house_sitting" | "daycare";
      dropOffAt: string;
      pickUpAt: string;
      pets: ChatPet[];
      quote: PriceQuote;
      extras: ChatQuoteExtra[];
      total: number;
      status: "sent" | "confirmed" | "replaced";
    }
  // The booking's step cards (014o) hold only the booking id; the screen reads the booking itself to draw them.
  | { type: "meet_greet" | "agreement" | "payment"; bookingId: string }
  // A Meet & Greet change, posted at the bottom by the one who made it (015k, #264). Time and place as they were then.
  | {
      type: "meet_greet_update";
      bookingId: string;
      event: MeetGreetEvent;
      mode: "in_person" | "video" | null;
      at: string | null;
      place: string | null;
    }
  | { type: "unknown" };

export type MeetGreetEvent = "proposed" | "agreed" | "time_declined" | "skip_requested" | "skipped" | "done" | "declined";

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

/** A pet of the stay a chat is about, as the list and header show it (round face and name). */
export type ChatPetFace = { id: string; name: string; species: Species | null; photo: string | null };

/** One row of the chat list. */
export type ChatListItem = {
  threadId: string;
  otherId: string;
  otherName: string;
  lastKind: "text" | "card";
  lastBody: string | null;
  lastCardType: string | null;
  lastAt: string;
  unread: number;
  pets: ChatPetFace[];
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
  invalid_extra: "Check the fee and try again.",
  too_many_extras: "That's enough fees on one quote.",
  quote_closed: "This quote is closed.",
  extras_pending: "Answer each fee first.",
};

function fail(error: { message: string }, fallback: string): never {
  throw new ChatError(error.message, MESSAGES[error.message] ?? fallback);
}

/** The preview line of a message in the list. */
export function previewOf(item: Pick<ChatListItem, "lastKind" | "lastBody" | "lastCardType">): string {
  if (item.lastKind !== "card") return item.lastBody ?? "";
  switch (item.lastCardType) {
    case "quote":
      return "Quote";
    case "request":
      return "Booking request";
    case "meet_greet":
      return "Meet & Greet";
    case "meet_greet_update":
      return "Meet & Greet update";
    case "agreement":
      return "Booking";
    case "payment":
      return "Payment";
    default:
      return "Stay details";
  }
}

function toCard(raw: unknown): ChatCard {
  const c = raw as {
    type?: string;
    drop_off_at?: string;
    pick_up_at?: string;
    pets?: ChatPet[];
    booking_id?: string;
    service_type?: "boarding" | "house_sitting" | "daycare";
    note?: string | null;
    drop_off_place?: ChatPlace;
    pick_up_place?: ChatPlace;
    quote?: PriceQuote;
    extras?: { id: string; label: string; amount: number | string; status: ChatQuoteExtra["status"] }[];
    total?: number | string;
    status?: "sent" | "confirmed" | "replaced";
    event?: MeetGreetEvent;
    mode?: "in_person" | "video" | null;
    at?: string | null;
    place?: string | null;
  } | null;
  if (c?.type === "meet_greet_update" && c.booking_id && c.event) {
    return { type: "meet_greet_update", bookingId: c.booking_id, event: c.event, mode: c.mode ?? null, at: c.at ?? null, place: c.place ?? null };
  }
  if ((c?.type === "meet_greet" || c?.type === "agreement" || c?.type === "payment") && c.booking_id) {
    return { type: c.type, bookingId: c.booking_id };
  }
  if (c?.type === "request" && c.booking_id && c.drop_off_at && c.pick_up_at) {
    return {
      type: "request",
      bookingId: c.booking_id,
      serviceType: (c.service_type ?? "boarding") as "boarding" | "house_sitting",
      note: c.note ?? null,
      dropOffAt: c.drop_off_at,
      pickUpAt: c.pick_up_at,
      dropOffPlace: c.drop_off_place ?? { type: "sitter_home", note: null },
      pickUpPlace: c.pick_up_place ?? { type: "sitter_home", note: null },
      pets: c.pets ?? [],
    };
  }
  if (c?.type === "quote" && c.quote && c.drop_off_at && c.pick_up_at) {
    return {
      type: "quote",
      serviceType: c.service_type ?? "boarding",
      dropOffAt: c.drop_off_at,
      pickUpAt: c.pick_up_at,
      pets: c.pets ?? [],
      quote: asQuote(c.quote),
      extras: (c.extras ?? []).map((e) => ({ id: e.id, label: e.label, amount: Number(e.amount), status: e.status })),
      total: Number(c.total ?? c.quote.total),
      status: c.status ?? "sent",
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
    last_card_type: string | null;
    last_at: string;
    unread_count: number;
    pets: { id: string; name: string; species: Species | null; photo: string | null }[] | null;
  }[]).map((r) => ({
    threadId: r.thread_id,
    otherId: r.other_id,
    otherName: r.other_name,
    lastKind: r.last_kind,
    lastBody: r.last_body,
    lastCardType: r.last_card_type,
    lastAt: r.last_at,
    unread: r.unread_count,
    pets: (r.pets ?? []).map((p) => ({ id: p.id, name: p.name, species: p.species, photo: p.photo })),
  }));
}

/**
 * Species and first photo of pets, read as the signed-in person (RLS lets a sitter with a chat or booking read them).
 * A pet that cannot be read has no entry: the face falls back to the paw.
 */
export async function loadChatPetMeta(ids: string[]): Promise<Map<string, { species: Species; photo: string | null }>> {
  const meta = new Map<string, { species: Species; photo: string | null }>();
  if (ids.length === 0) return meta;
  const db = getSupabase();
  const [pets, photos] = await Promise.all([
    db.from("pets").select("id, species").in("id", ids),
    db.from("pet_photos").select("pet_id, public_id, position").in("pet_id", ids).order("position"),
  ]);
  for (const row of (pets.data ?? []) as { id: string; species: Species }[]) meta.set(row.id, { species: row.species, photo: null });
  for (const row of (photos.data ?? []) as { pet_id: string; public_id: string }[]) {
    const entry = meta.get(row.pet_id);
    if (entry && entry.photo === null) entry.photo = row.public_id;
  }
  return meta;
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

/** Quote errors from quote_booking (rates not set, service not offered ...) keep their own wording. */
function quoteFail(error: { message: string; details?: string | null }, fallback: string): never {
  throw new ChatError(error.message, MESSAGES[error.message] ?? priceErrorMessage(error.message, error.details ?? null, fallback));
}

/** The sitter prices the stay with their saved rates; the numbers come from the server. */
export async function sendChatQuote(threadId: string, input: { service: string; dropOffAt: string; pickUpAt: string; petIds: string[] }): Promise<string> {
  const { data, error } = await getSupabase().rpc("send_chat_quote", {
    p_thread: threadId,
    p_service: input.service,
    p_drop_off_at: input.dropOffAt,
    p_pick_up_at: input.pickUpAt,
    p_pet_ids: input.petIds,
  });
  if (error) quoteFail(error, "Couldn't send the quote. Try again.");
  return String((data as { id?: string } | null)?.id ?? "");
}

export async function confirmQuote(messageId: string): Promise<void> {
  const { error } = await getSupabase().rpc("confirm_chat_quote", { p_message: messageId });
  if (error) fail(error, "Couldn't confirm the quote. Try again.");
}
