import { ApiError, apiPost } from "../../lib/api";
import type { LocationType, PriceQuote } from "../../lib/bookings";
import { getSupabase } from "../../lib/supabase";
import { formatDay, isoToZoned } from "../schedule/dates";
import { SERVICE_LABEL, ServiceType } from "../sitters/sitterApi";

export const QUESTION_MAX = 300;

export type InquiryInput = {
  sitterId: string;
  serviceType: ServiceType;
  dropOff: { at: string; locationType: LocationType };
  pickUp: { at: string; locationType: LocationType };
  petIds: string[];
  /** Optional free text; a one-line summary of the trip is sent when it is empty. */
  question: string;
  petNames: string[];
};

export type InquirySource = { id: string; type: string; label: string; text: string };

export type InquiryMessage = {
  id: string;
  author: "owner" | "sitter";
  body: string;
  at: string;
  /** Kept on a sent sitter reply: the quote and sources the draft stood on (owner can see these). */
  quote: PriceQuote | null;
  sources: InquirySource[];
  canHost: boolean | null;
  /** Owner messages only: when the sitter opened the thread (the only "read" mark, no faked ones). */
  readAt: string | null;
};

export type InquiryView = {
  id: string;
  ownerId: string;
  sitterId: string;
  sitterName: string;
  ownerName: string;
  serviceType: ServiceType;
  dropOffAt: string;
  pickUpAt: string;
  dropOffPlace: LocationType;
  pickUpPlace: LocationType;
  petIds: string[];
  petNames: string[];
  status: "open" | "booked" | "closed";
  bookingId: string | null;
  messages: InquiryMessage[];
  /** The newest AI draft — only the sitter's queries ever return one (RLS). */
  draft: InquiryDraft | null;
};

export type InquiryDraft = {
  id: string;
  body: string;
  at: string;
  quote: PriceQuote | null;
  sources: InquirySource[];
  canHost: boolean | null;
  needsSitter: boolean;
  intent: string | null;
};

type Embed<T> = T | T[] | null;
const first = <T,>(v: Embed<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function fail(action: string): never {
  throw new Error(`Couldn't ${action}. Check your connection and try again.`);
}

/** "Boarding · Oct 9 – Oct 12 · Max, Mochi" — what is sent when the owner writes no question. */
export function tripSummary(serviceType: ServiceType, dropOffAt: string, pickUpAt: string, petNames: string[]): string {
  const label = SERVICE_LABEL[serviceType].replace(/^\S+\s/, "");
  return `${label} · ${formatDay(isoToZoned(dropOffAt).day)} – ${formatDay(isoToZoned(pickUpAt).day)} · ${petNames.join(", ")}`;
}

/** Insert the inquiry and the owner's message (RLS: only the owner, only their own pets, only a sitter). */
export async function createInquiry(input: InquiryInput): Promise<string> {
  const supabase = getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const ownerId = sessionData.session?.user.id;
  if (!ownerId) throw new Error("Sign in to continue.");
  const { data, error } = await supabase
    .from("inquiries")
    .insert({
      owner_id: ownerId,
      sitter_id: input.sitterId,
      service_type: input.serviceType,
      drop_off_at: input.dropOff.at,
      pick_up_at: input.pickUp.at,
      drop_off_location_type: input.dropOff.locationType,
      pick_up_location_type: input.pickUp.locationType,
      pet_ids: input.petIds,
    })
    .select("id")
    .single();
  if (error || !data) fail("send your question");
  const body = input.question.trim() || tripSummary(input.serviceType, input.dropOff.at, input.pickUp.at, input.petNames);
  const sent = await supabase
    .from("inquiry_messages")
    .insert({ inquiry_id: data.id, author: "owner", sender_id: ownerId, body: body.slice(0, 2000) });
  if (sent.error) fail("send your question");
  return data.id as string;
}

/** Ask for the sitter's draft. Never throws: the thread stays and says the sitter will reply soon. */
export async function requestInquiryReply(inquiryId: string): Promise<boolean> {
  try {
    await apiPost("/api/ai/inquiry-reply", { inquiry_id: inquiryId });
    return true;
  } catch (error) {
    if (!(error instanceof ApiError)) return false;
    return false;
  }
}

type MessageRow = {
  id: string;
  author: "owner" | "sitter" | "ai";
  body: string;
  created_at: string;
  read_at: string | null;
  grounding: {
    quote?: PriceQuote | null;
    sources?: InquirySource[];
    availability?: { can_host?: boolean };
    needs_sitter?: boolean;
    intent?: string | null;
  } | null;
};

const COLUMNS =
  "id, owner_id, sitter_id, service_type, drop_off_at, pick_up_at, drop_off_location_type, pick_up_location_type, " +
  "pet_ids, status, booking_id, created_at, sitter:profiles!inquiries_sitter_id_fkey(display_name), " +
  "owner:profiles!inquiries_owner_id_fkey(display_name)";

type InquiryRow = {
  id: string;
  owner_id: string;
  sitter_id: string;
  service_type: ServiceType;
  drop_off_at: string;
  pick_up_at: string;
  drop_off_location_type: LocationType;
  pick_up_location_type: LocationType;
  pet_ids: string[];
  status: "open" | "booked" | "closed";
  booking_id: string | null;
  created_at: string;
  sitter: Embed<{ display_name: string }>;
  owner: Embed<{ display_name: string }>;
};

/** One thread as the signed-in party may see it (RLS hides drafts and unsent replies from the owner). */
export async function getInquiry(id: string): Promise<InquiryView | null> {
  const supabase = getSupabase();
  const found = await supabase.from("inquiries").select(COLUMNS).eq("id", id).maybeSingle();
  if (found.error) fail("load this conversation");
  if (!found.data) return null;
  const row = found.data as unknown as InquiryRow;
  const [msgs, pets] = await Promise.all([
    supabase
      .from("inquiry_messages")
      .select("id, author, body, created_at, read_at, grounding")
      .eq("inquiry_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("pets").select("id, name").in("id", row.pet_ids),
  ]);
  if (msgs.error) fail("load this conversation");
  const names = new Map(((pets.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  return {
    id: row.id,
    ownerId: row.owner_id,
    sitterId: row.sitter_id,
    sitterName: first(row.sitter)?.display_name ?? "Your sitter",
    ownerName: first(row.owner)?.display_name ?? "The owner",
    serviceType: row.service_type,
    dropOffAt: row.drop_off_at,
    pickUpAt: row.pick_up_at,
    dropOffPlace: row.drop_off_location_type,
    pickUpPlace: row.pick_up_location_type,
    petIds: row.pet_ids,
    petNames: row.pet_ids.map((p) => names.get(p)).filter((n): n is string => !!n),
    status: row.status,
    bookingId: row.booking_id,
    draft: latestDraft((msgs.data ?? []) as MessageRow[]),
    messages: ((msgs.data ?? []) as MessageRow[])
      .filter((m) => m.author !== "ai")
      .map((m) => ({
        id: m.id,
        author: m.author as "owner" | "sitter",
        body: m.body,
        at: m.created_at,
        quote: m.grounding?.quote ?? null,
        sources: m.grounding?.sources ?? [],
        canHost: m.grounding?.availability?.can_host ?? null,
        readAt: m.read_at,
      })),
  };
}

function latestDraft(rows: MessageRow[]): InquiryDraft | null {
  const drafts = rows.filter((m) => m.author === "ai");
  const m = drafts[drafts.length - 1];
  if (!m) return null;
  return {
    id: m.id,
    body: m.body,
    at: m.created_at,
    quote: m.grounding?.quote ?? null,
    sources: m.grounding?.sources ?? [],
    canHost: m.grounding?.availability?.can_host ?? null,
    needsSitter: !!m.grounding?.needs_sitter,
    intent: m.grounding?.intent ?? null,
  };
}

export type ReplyIntent = "accept" | "decline" | "suggest_dates";

/** Sitter: another draft, optionally leaning one way (the intent chips). Throws a message the sitter can read. */
export async function regenerateDraft(inquiryId: string, intent?: ReplyIntent): Promise<void> {
  try {
    await apiPost("/api/ai/inquiry-reply", { inquiry_id: inquiryId, regenerate: true, ...(intent ? { intent } : {}) });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 409)) throw new Error(error.message);
    throw new Error("Couldn't write another draft. Check your connection and try again.");
  }
}

/** Sitter: send the text they approved (the draft as is, or their edit). `draftId` keeps the quote and sources. */
export async function sendInquiryReply(inquiryId: string, body: string, draftId: string | null): Promise<void> {
  const { error } = await getSupabase().rpc("send_inquiry_reply", { p_inquiry: inquiryId, p_body: body, p_draft: draftId });
  if (!error) return;
  if (error.message.includes("body_required")) throw new Error("Write something before sending.");
  if (error.message.includes("body_too_long")) throw new Error("Keep the reply under 2000 characters.");
  if (error.message.includes("inquiry_closed")) throw new Error("The owner closed this question.");
  fail("send the reply");
}

/** After a send: let the assistant learn from what the sitter did with the draft. Never blocks or fails. */
export async function recordReplySample(inquiryId: string): Promise<void> {
  try {
    await apiPost("/api/tone/record-reply", { inquiry_id: inquiryId });
  } catch {
    // Learning is a bonus; the reply is already sent.
  }
}

/** The sitter opened the thread: the owner's messages become read (the only read mark there is). */
export async function markInquiryRead(inquiryId: string): Promise<void> {
  await getSupabase().rpc("mark_inquiry_read", { p_inquiry: inquiryId });
}

export type SitterInquiryCard = {
  id: string;
  ownerName: string;
  petNames: string[];
  serviceType: ServiceType;
  dropOffAt: string;
  pickUpAt: string;
  createdAt: string;
  status: "open" | "booked" | "closed";
  /** "waiting" = no draft yet · "draft" = draft ready, not sent · "replied" = the sitter has sent a reply. */
  state: "waiting" | "draft" | "replied";
};

/** The sitter's inquiries, newest first, each with where it stands. */
export async function listSitterInquiries(): Promise<SitterInquiryCard[]> {
  const supabase = getSupabase();
  const found = await supabase
    .from("inquiries")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(50);
  if (found.error) fail("load your questions");
  const rows = (found.data ?? []) as unknown as InquiryRow[];
  if (rows.length === 0) return [];
  const [msgs, pets] = await Promise.all([
    supabase.from("inquiry_messages").select("inquiry_id, author, created_at").in("inquiry_id", rows.map((r) => r.id)),
    supabase.from("pets").select("id, name").in("id", [...new Set(rows.flatMap((r) => r.pet_ids))]),
  ]);
  const names = new Map(((pets.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const byInquiry = new Map<string, { author: string; created_at: string }[]>();
  for (const m of (msgs.data ?? []) as { inquiry_id: string; author: string; created_at: string }[]) {
    byInquiry.set(m.inquiry_id, [...(byInquiry.get(m.inquiry_id) ?? []), m]);
  }
  return rows.map((r) => {
    const list = byInquiry.get(r.id) ?? [];
    const replied = list.some((m) => m.author === "sitter");
    return {
      id: r.id,
      ownerName: first(r.owner)?.display_name ?? "An owner",
      petNames: r.pet_ids.map((p) => names.get(p)).filter((n): n is string => !!n),
      serviceType: r.service_type,
      dropOffAt: r.drop_off_at,
      pickUpAt: r.pick_up_at,
      createdAt: r.created_at,
      status: r.status,
      state: replied ? "replied" : list.some((m) => m.author === "ai") ? "draft" : "waiting",
    };
  });
}

/** After the booking request went out: the inquiry is booked (RLS lets the owner set only this). */
export async function markInquiryBooked(inquiryId: string, bookingId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("inquiries")
    .update({ status: "booked", booking_id: bookingId })
    .eq("id", inquiryId);
  if (error) fail("link this question to your booking");
}
