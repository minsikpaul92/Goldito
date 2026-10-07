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
