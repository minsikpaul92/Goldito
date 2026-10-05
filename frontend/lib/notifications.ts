import { Href } from "expo-router";

import { getSupabase } from "./supabase";
import type { Role } from "../providers/SessionProvider";
import type { NotificationRow } from "../types/db";

/** Types that should refresh Owner Diary Live when a notice arrives (Phase 06–07). */
export const DIARY_NOTIFICATION_TYPES = new Set([
  "feed_post",
  "task_done",
  "care_checkin",
  "report_sent",
]);

/** Notification center page size (phase-05 5.5). */
export const NOTIFICATION_PAGE_SIZE = 50;

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  petId: string | null;
  bookingId: string | null;
  refId: string | null;
  readAt: string | null;
  createdAt: string;
};

const NOTIFICATION_COLUMNS =
  "id, type, title, body, pet_id, booking_id, ref_id, read_at, created_at";

function asNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    petId: row.pet_id,
    bookingId: row.booking_id,
    refId: row.ref_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** Unread rows for the signed-in user (RLS: user_id = auth.uid()). */
export async function countUnreadNotifications(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

/** Newest notifications for the signed-in user (RLS). */
export async function listNotifications(
  limit = NOTIFICATION_PAGE_SIZE,
): Promise<AppNotification[]> {
  const { data, error } = await getSupabase()
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Couldn't load notifications. Check your connection and try again.");
  return ((data ?? []) as NotificationRow[]).map(asNotification);
}

/** Mark one notice read (idempotent if already read). */
export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw new Error("Couldn't mark that notice as read.");
}

/** Mark every unread notice for the signed-in user. */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await getSupabase()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw new Error("Couldn't mark notices as read.");
}

/** Delete one notice (RLS: only the owner of the notice). The underlying record stays in History. */
export async function deleteNotification(id: string): Promise<void> {
  const { error } = await getSupabase().from("notifications").delete().eq("id", id);
  if (error) throw new Error("Couldn't delete that notice. Try again.");
}

/** "Clear all": every notice of the signed-in user (RLS limits the delete to their own). */
export async function deleteAllNotifications(): Promise<void> {
  const { error } = await getSupabase().from("notifications").delete().not("id", "is", null);
  if (error) throw new Error("Couldn't clear your notifications. Try again.");
}

/**
 * Where tapping a notice should go (architecture §7). Returns null when there is
 * no screen yet or the type doesn't apply to this role — still mark as read.
 */
export function hrefForNotification(
  notice: Pick<AppNotification, "type" | "bookingId" | "petId">,
  role: Role,
): Href | null {
  const bookingHref = (id: string | null): Href | null => {
    if (!id) return role === "owner" ? "/owner/bookings" : "/sitter/bookings";
    return role === "owner" ? `/owner/bookings/${id}` : `/sitter/bookings/${id}`;
  };

  switch (notice.type) {
    case "feed_post":
      if (role === "owner") return "/owner/feed";
      return notice.petId ? `/sitter/feed/${notice.petId}` : "/sitter/feed";
    case "task_done":
    case "care_checkin":
      // The record of what the sitter did lives in History; the written diary is a later feature.
      return role === "owner" ? "/owner/history" : null;
    case "report_sent":
      return role === "owner" ? "/owner/diary" : null;
    case "booking_requested":
      return role === "sitter" ? bookingHref(notice.bookingId) : null;
    case "booking_confirmed":
    case "booking_declined":
    case "booking_cancelled":
    case "booking_paid":
    case "access_unlocked":
    case "pet_dropped_off":
    case "pet_picked_up":
    case "handoff_proposed":
    case "handoff_agreed":
    case "handoff_declined":
    case "meet_greet_proposed":
    case "meet_greet_agreed":
    case "meet_greet_declined":
    case "meet_greet_skip_requested":
    case "meet_greet_skipped":
    case "meet_greet_link_ready":
    case "review_requested":
    case "review_received":
    case "trip_started":
    case "trip_arrived":
      return bookingHref(notice.bookingId);
    case "life_record_updated":
      return role === "owner" && notice.petId ? `/owner/pets/${notice.petId}` : null;
    case "inquiry_received":
      // Inquiry thread UI lands in 07B — Bookings is the closest home for sitters.
      return role === "sitter" ? "/sitter/bookings" : null;
    case "inquiry_replied":
      return role === "owner" ? "/owner/bookings" : null;
    case "safety_danger":
    case "photo_request":
    case "task_due":
      return null;
    default:
      return null;
  }
}

export type { NotificationRow };
