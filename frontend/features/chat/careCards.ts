import { useCallback, useEffect, useState } from "react";

import type { BookingSummary } from "../../lib/bookings";
import { getSupabase } from "../../lib/supabase";
import type { MediaResourceType } from "../../types/db";

/** The chat reads care news every few seconds while it is open; the cards are not stored in the chat. */
const POLL_MS = 10_000;

/** One care event of the stay as a chat card (3D.8): a photo asked for and answered, or the day's diary page. */
export type CareItem =
  | {
      kind: "photo";
      id: string;
      at: string;
      petId: string;
      petName: string;
      status: "open" | "fulfilled";
      /** The answering post: its one-line caption and the picture. */
      caption: string | null;
      media: { publicId: string; resourceType: MediaResourceType } | null;
    }
  | { kind: "diary"; id: string; at: string; petName: string; reportId: string };

/** The sitter has the pets (drop-off done) and has not given them back (pick-up not done). */
export function inCare(booking: BookingSummary): boolean {
  return booking.status === "confirmed" && !!booking.paidAt && !!booking.dropOff?.completedAt && !booking.pickUp?.completedAt;
}

type RequestRow = { id: string; pet_id: string; status: "open" | "fulfilled"; created_at: string; fulfilled_post_id: string | null; fulfilled_at: string | null };
type PostRow = { id: string; caption: string | null; media: { cloudinary_public_id: string; resource_type: MediaResourceType } | null };
type ReportRow = { id: string; pet_id: string; sent_at: string | null };

/** The photo asks of this stay (with the answer) and the diary pages the sitter sent since the drop-off, oldest first. */
export async function loadCareItems(booking: BookingSummary): Promise<CareItem[]> {
  const supabase = getSupabase();
  const since = booking.dropOff?.completedAt ?? booking.dropOff?.at ?? "";
  const petIds = booking.pets.flatMap((p) => (p.id ? [p.id] : []));
  const nameOf = (id: string) => booking.pets.find((p) => p.id === id)?.name ?? "your pet";

  const [requests, reports] = await Promise.all([
    supabase
      .from("photo_requests")
      .select("id, pet_id, status, created_at, fulfilled_post_id, fulfilled_at")
      .eq("booking_id", booking.id)
      .order("created_at", { ascending: true }),
    petIds.length === 0 || !since
      ? Promise.resolve({ data: [] as ReportRow[], error: null })
      : supabase
          .from("daily_reports")
          .select("id, pet_id, sent_at")
          .in("pet_id", petIds)
          .eq("sitter_id", booking.sitterId)
          .eq("status", "sent")
          .gte("sent_at", since),
  ]);
  if (requests.error || reports.error) throw new Error("Couldn't load care updates.");

  const asks = (requests.data ?? []) as RequestRow[];
  const postIds = asks.flatMap((r) => (r.fulfilled_post_id ? [r.fulfilled_post_id] : []));
  const posts = new Map<string, PostRow>();
  if (postIds.length > 0) {
    const { data } = await supabase.from("feed_posts").select("id, caption, media (cloudinary_public_id, resource_type)").in("id", postIds);
    for (const p of (data ?? []) as unknown as PostRow[]) posts.set(p.id, p);
  }

  const items: CareItem[] = asks.map((r) => {
    const post = r.fulfilled_post_id ? posts.get(r.fulfilled_post_id) : undefined;
    return {
      kind: "photo",
      id: r.id,
      at: r.fulfilled_at ?? r.created_at,
      petId: r.pet_id,
      petName: nameOf(r.pet_id),
      status: r.status,
      caption: post?.caption ?? null,
      media: post?.media ? { publicId: post.media.cloudinary_public_id, resourceType: post.media.resource_type } : null,
    };
  });
  for (const r of (reports.data ?? []) as ReportRow[]) {
    if (r.sent_at) items.push({ kind: "diary", id: r.id, at: r.sent_at, petName: nameOf(r.pet_id), reportId: r.id });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** The care cards of a stay, kept current while the chat is open. `null` = not loaded (or no stay to read). */
export function useCareItems(booking: BookingSummary | null): { items: CareItem[] | null; reload: () => void } {
  const [items, setItems] = useState<CareItem[] | null>(null);
  const live = !!booking && booking.status === "confirmed" && !!booking.paidAt && !!booking.dropOff?.completedAt;
  const reload = useCallback(() => {
    if (!booking || !live) return;
    loadCareItems(booking)
      .then(setItems)
      .catch(() => undefined);
    // the booking object is rebuilt on every chat reload; its identity and care state are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.id, booking?.pickUp?.completedAt, live]);

  useEffect(() => {
    if (!live) {
      setItems(null);
      return;
    }
    reload();
    const poll = setInterval(reload, POLL_MS);
    return () => clearInterval(poll);
  }, [live, reload]);

  return { items, reload };
}
