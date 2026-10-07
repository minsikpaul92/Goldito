import { ApiError, apiPost } from "../../lib/api";
import { getSupabase } from "../../lib/supabase";
import { previewOf } from "../diary/reportApi";

export type Review = { rating: number; comment: string | null; createdAt: string };

export type StaySummary = {
  reports: number;
  photos: number;
  tasksDone: number;
  /** First sentence of the newest report the sitter sent. */
  lastReport: string | null;
};

export type RatingSummary = {
  avg: number | null;
  count: number;
  recent: { rating: number; comment: string | null; reviewer: string; createdAt: string }[];
};

function fail(action: string): never {
  throw new Error(`Couldn't ${action}. Check your connection and try again.`);
}

export async function getReview(bookingId: string): Promise<Review | null> {
  const { data, error } = await getSupabase()
    .from("reviews")
    .select("rating, comment, created_at")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) fail("load your review");
  if (!data) return null;
  const row = data as { rating: number; comment: string | null; created_at: string };
  return { rating: row.rating, comment: row.comment, createdAt: row.created_at };
}

/** One review per stay, by its owner, once the pets are back (submit_review, 011). */
export async function submitReview(bookingId: string, rating: number, comment: string): Promise<void> {
  const { error } = await getSupabase().rpc("submit_review", {
    p_booking: bookingId,
    p_rating: rating,
    p_comment: comment.trim() || null,
  });
  if (!error) return;
  if (error.message.includes("already_reviewed")) throw new Error("You already reviewed this stay.");
  if (error.message.includes("stay_not_finished")) throw new Error("You can review once the pets are back home.");
  if (error.message.includes("comment_too_long")) throw new Error("Keep the comment under 500 characters.");
  if (error.message.includes("invalid_rating")) throw new Error("Pick 1 to 5 stars.");
  fail("send your review");
}

/** What happened during the stay, counted from records the owner can already read (no AI). */
export async function getStaySummary(petIds: string[], fromIso: string, toIso: string): Promise<StaySummary> {
  const supabase = getSupabase();
  const [reports, photos, tasks] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("body, sent_at")
      .in("pet_id", petIds)
      .eq("status", "sent")
      .gte("sent_at", fromIso)
      .lte("sent_at", toIso)
      .order("sent_at", { ascending: false }),
    supabase
      .from("feed_posts")
      .select("id", { count: "exact", head: true })
      .in("pet_id", petIds)
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
    supabase
      .from("task_logs")
      .select("id", { count: "exact", head: true })
      .in("pet_id", petIds)
      .eq("status", "done")
      .gte("due_at", fromIso)
      .lte("due_at", toIso),
  ]);
  if (reports.error || photos.error || tasks.error) fail("load the stay summary");
  const rows = (reports.data ?? []) as { body: string }[];
  return {
    reports: rows.length,
    photos: photos.count ?? 0,
    tasksDone: tasks.count ?? 0,
    lastReport: rows[0] ? previewOf(rows[0].body) : null,
  };
}

/** A sitter's average, review count and a few recent comments (public, signed-in only). */
export async function getRatingSummary(sitterId: string): Promise<RatingSummary> {
  const { data, error } = await getSupabase().rpc("sitter_rating_summary", { p_sitter: sitterId });
  if (error || !data) return { avg: null, count: 0, recent: [] };
  const row = data as {
    avg: number | null;
    count: number;
    recent: { rating: number; comment: string | null; reviewer: string; created_at: string }[];
  };
  return {
    avg: row.avg == null ? null : Number(row.avg),
    count: Number(row.count),
    recent: (row.recent ?? []).map((r) => ({ rating: r.rating, comment: r.comment, reviewer: r.reviewer, createdAt: r.created_at })),
  };
}

/** The six squares of a Pet Life Record (what one stay taught us, for the next sitter). */
export type LifeRecordSummary = {
  eats: string | null;
  meds: string | null;
  potty: string | null;
  behavior: string | null;
  heads_up: string[];
  sitter_tips: string[];
  changed_since_last: string[];
};

export type LifeRecord = {
  id: string;
  petId: string;
  bookingId: string;
  sitterName: string | null;
  stayFrom: string | null;
  stayTo: string | null;
  createdAt: string;
  summary: LifeRecordSummary;
};

type Embed<T> = T | T[] | null;
type RecordRow = {
  id: string;
  pet_id: string;
  booking_id: string;
  stay_from: string | null;
  stay_to: string | null;
  created_at: string;
  summary: Partial<LifeRecordSummary>;
  sitter: Embed<{ display_name: string }>;
};

const RECORD_COLUMNS =
  "id, pet_id, booking_id, stay_from, stay_to, created_at, summary, sitter:profiles!pet_life_records_sitter_id_fkey(display_name)";

function toRecord(row: RecordRow): LifeRecord {
  const sitter = Array.isArray(row.sitter) ? row.sitter[0] : row.sitter;
  const s = row.summary ?? {};
  return {
    id: row.id,
    petId: row.pet_id,
    bookingId: row.booking_id,
    sitterName: sitter?.display_name ?? null,
    stayFrom: row.stay_from,
    stayTo: row.stay_to,
    createdAt: row.created_at,
    summary: {
      eats: s.eats ?? null,
      meds: s.meds ?? null,
      potty: s.potty ?? null,
      behavior: s.behavior ?? null,
      heads_up: s.heads_up ?? [],
      sitter_tips: s.sitter_tips ?? [],
      changed_since_last: s.changed_since_last ?? [],
    },
  };
}

/** A pet's records, newest first (RLS decides who may read them; the raw source is never selected). */
export async function listLifeRecords(petId: string): Promise<LifeRecord[]> {
  const { data, error } = await getSupabase()
    .from("pet_life_records")
    .select(RECORD_COLUMNS)
    .eq("pet_id", petId)
    .order("created_at", { ascending: false });
  if (error) fail("load the Life Record");
  return ((data ?? []) as unknown as RecordRow[]).map(toRecord);
}

export async function listBookingRecords(petIds: string[], bookingId: string): Promise<LifeRecord[]> {
  if (petIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("pet_life_records")
    .select(RECORD_COLUMNS)
    .in("pet_id", petIds)
    .eq("booking_id", bookingId);
  if (error) fail("load the Life Record");
  return ((data ?? []) as unknown as RecordRow[]).map(toRecord);
}

/** Ask for the stay's Life Records (idempotent: what already exists is returned). Throws a message the owner can read. */
export async function requestLifeRecord(bookingId: string): Promise<void> {
  try {
    await apiPost("/api/ai/life-record", { booking_id: bookingId });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 503 || error.status === 409 || error.status === 403)) {
      throw new Error(error.message === "stay_not_finished" ? "The stay isn't finished yet." : error.message);
    }
    throw new Error("Couldn't write the Life Record. Check your connection and try again.");
  }
}
