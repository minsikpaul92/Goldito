import { getSupabase } from "../../lib/supabase";
import { addDays, appToday, zonedToIso } from "../schedule/dates";
import { previewOf } from "./reportApi";

/**
 * Sent diary pages in Feed (Diary book DB.4): one cell per page among the photos, by when it was sent, with the
 * day's first shared photo as its thumbnail (none: a 📔 cell). Tapping it opens the diary book on that page.
 */
export type DiaryCell = {
  kind: "diary";
  id: string;
  reportId: string;
  petName: string;
  day: string;
  sentAt: string;
  preview: string;
  thumb: { publicId: string; resourceType: "image" | "video" } | null;
};

type Embed<T> = T | T[] | null;
const first = <T,>(v: Embed<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export const isDiaryCell = (item: object): item is DiaryCell => (item as DiaryCell).kind === "diary";

/** This pet's sent pages that I can read (owner: all of them; sitter: their own), newest first. */
export async function listDiaryCells(petId: string): Promise<DiaryCell[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("daily_reports")
    .select("id, report_date, body, sent_at, pets(name)")
    .eq("pet_id", petId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(100);
  if (error || !data || data.length === 0) return []; // the photos still show; pages are a bonus here
  const rows = data as unknown as { id: string; report_date: string; body: string; sent_at: string | null; pets: Embed<{ name: string }> }[];

  // The first shared photo of each of those days, in one read.
  const days = rows.map((r) => r.report_date).sort();
  const thumbs = new Map<string, DiaryCell["thumb"]>();
  const photos = await supabase
    .from("feed_posts")
    .select("created_at, media(cloudinary_public_id, resource_type)")
    .eq("pet_id", petId)
    .eq("visibility", "shared")
    .gte("created_at", zonedToIso(days[0], "00:00"))
    .lt("created_at", zonedToIso(addDays(days[days.length - 1], 1), "00:00"))
    .order("created_at", { ascending: true });
  for (const p of (photos.data ?? []) as unknown as { created_at: string; media: Embed<{ cloudinary_public_id: string; resource_type: "image" | "video" }> }[]) {
    const day = appToday(new Date(p.created_at));
    const media = first(p.media);
    if (media && !thumbs.has(day)) thumbs.set(day, { publicId: media.cloudinary_public_id, resourceType: media.resource_type });
  }

  return rows.map((r) => ({
    kind: "diary",
    id: `diary-${r.id}`,
    reportId: r.id,
    petName: first(r.pets)?.name ?? "Your pet",
    day: r.report_date,
    sentAt: r.sent_at ?? `${r.report_date}T23:59:59Z`,
    preview: previewOf(r.body, 60),
    thumb: thumbs.get(r.report_date) ?? null,
  }));
}

/**
 * Photos (newest first) and pages, merged by time. While older photos are still to load, a page older than the
 * oldest photo on screen waits — it comes in with the next "Load more", in its place.
 */
export function withDiaryCells<T extends { createdAt: string }>(posts: T[], cells: DiaryCell[], hasMore: boolean): (T | DiaryCell)[] {
  const oldest = posts.length > 0 ? posts[posts.length - 1].createdAt : null;
  const shown = cells.filter((c) => !hasMore || oldest === null || c.sentAt >= oldest);
  const at = (item: T | DiaryCell) => (isDiaryCell(item) ? item.sentAt : item.createdAt);
  return [...posts, ...shown].sort((a, b) => at(b).localeCompare(at(a)));
}
