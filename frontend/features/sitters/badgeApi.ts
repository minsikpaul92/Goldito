import { getSupabase } from "../../lib/supabase";

/** A sitter badge (11.12): earned on the day it happened, or not yet (`at` null). Worked out from the data, nothing stored. */
export type SitterBadge = { key: "first_stay" | "first_five_star"; emoji: string; title: string; at: string | null };

const first = (dates: (string | null | undefined)[]) =>
  dates.filter((d): d is string => !!d).sort()[0] ?? null;

/**
 * The sitter's own badges: the first stay finished (the first pick-up done) and the first 5-star review.
 * RLS: a sitter reads their own bookings, handoffs and reviews. A failed read counts as not yet.
 */
export async function listSitterBadges(sitterId: string): Promise<SitterBadge[]> {
  const supabase = getSupabase();
  const [bookings, reviews] = await Promise.all([
    supabase.from("bookings").select("id").eq("sitter_id", sitterId),
    supabase.from("reviews").select("created_at").eq("sitter_id", sitterId).eq("rating", 5),
  ]);
  const ids = ((bookings.data ?? []) as { id: string }[]).map((b) => b.id);
  let firstStay: string | null = null;
  if (ids.length > 0) {
    const { data } = await supabase
      .from("booking_handoffs")
      .select("completed_at")
      .in("booking_id", ids)
      .eq("kind", "pick_up")
      .eq("status", "agreed");
    firstStay = first(((data ?? []) as { completed_at: string | null }[]).map((h) => h.completed_at));
  }
  const firstFive = first(((reviews.data ?? []) as { created_at: string }[]).map((r) => r.created_at));
  return [
    { key: "first_stay", emoji: "🐾", title: "First stay", at: firstStay },
    { key: "first_five_star", emoji: "⭐", title: "First 5-star review", at: firstFive },
  ];
}
