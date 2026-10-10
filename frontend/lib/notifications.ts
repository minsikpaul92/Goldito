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

/**
 * Types that change a booking or an inquiry (FB-2): a new request or question, an answer, a handoff, a
 * Meet & Greet, a care request, a review. Lists and booking screens re-read when one arrives — no refresh.
 */
const BOOKING_NOTIFICATION = /^(booking|handoff|meet_greet|checkout|inquiry|care_request|review|access)_?/;

export function isBookingNotification(type: string): boolean {
  return BOOKING_NOTIFICATION.test(type);
}

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

/** Delete just these notices (Home's "Clear all" only clears the live updates). */
export async function deleteNotifications(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await getSupabase().from("notifications").delete().in("id", ids);
  if (error) throw new Error("Couldn't clear your updates. Try again.");
}

/**
 * Where tapping a notice should go (architecture §7). Returns null when there is
 * no screen yet or the type doesn't apply to this role — still mark as read.
 */
export function hrefForNotification(
  notice: Pick<AppNotification, "type" | "bookingId" | "petId"> & { refId?: string | null },
  role: Role,
): Href | null {
  const bookingHref = (id: string | null): Href | null => {
    if (!id) return role === "owner" ? "/owner/bookings" : "/sitter/bookings";
    return role === "owner" ? `/owner/bookings/${id}` : `/sitter/bookings/${id}`;
  };

  switch (notice.type) {
    case "feed_post":
      if (role === "owner") return notice.petId ? `/owner/feed?pet=${notice.petId}` : "/owner/feed";
      return notice.petId ? `/sitter/feed/${notice.petId}` : "/sitter/feed";
    case "task_done":
    case "care_checkin":
      // The record of what the sitter did lives in History; the written diary is a later feature.
      if (role !== "owner") return null;
      return notice.petId ? `/owner/history?pet=${notice.petId}` : "/owner/history";
    case "care_request":
      return role === "sitter" && notice.refId ? `/sitter/care-request/${notice.refId}` : null;
    case "care_request_approved":
    case "care_request_declined":
    case "care_request_countered":
      return role === "owner" && notice.petId ? `/owner/pets/${notice.petId}` : null;
    case "care_counter_accepted":
      return role === "sitter" ? "/sitter/tasks" : null;
    case "inquiry_replied":
      return role === "owner" && notice.refId ? `/owner/inquiries/${notice.refId}` : null;
    case "inquiry_received":
    case "inquiry_needs_you":
      return role === "sitter" && notice.refId ? `/sitter/inquiries/${notice.refId}` : null;
    case "report_sent":
      if (role !== "owner") return null;
      return notice.refId ? `/owner/diary/${notice.refId}` : "/owner/diary";
    case "booking_requested":
      return role === "sitter" ? bookingHref(notice.bookingId) : null;
    case "checkout_needed":
      // An agreed change needs a new consent (009d) — straight to Checkout.
      if (role !== "owner") return null;
      return notice.bookingId ? `/owner/bookings/${notice.bookingId}/checkout` : "/owner/bookings";
    case "price_updated":
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
      return role === "owner" && notice.petId ? `/owner/pets/${notice.petId}/record` : null;
    case "safety_danger":
    case "photo_request":
    case "task_due":
      return null;
    default:
      return null;
  }
}

export type { NotificationRow };
