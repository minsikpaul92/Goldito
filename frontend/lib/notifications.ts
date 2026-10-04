import { getSupabase } from "./supabase";
import type { NotificationRow } from "../types/db";

/** Types that should refresh Owner Diary Live when a notice arrives (Phase 06–07). */
export const DIARY_NOTIFICATION_TYPES = new Set([
  "feed_post",
  "task_done",
  "care_checkin",
  "report_sent",
]);

/** Unread rows for the signed-in user (RLS: user_id = auth.uid()). */
export async function countUnreadNotifications(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export type { NotificationRow };
