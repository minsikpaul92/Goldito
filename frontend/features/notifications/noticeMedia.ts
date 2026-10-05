import { useEffect, useMemo, useState } from "react";

import { getSupabase } from "../../lib/supabase";
import type { AppNotification } from "../../lib/notifications";
import type { MediaResourceType } from "../../types/db";
import type { DiaryMedia } from "../diary/diaryApi";

/** Notices about what the sitter did; these are the ones that can carry a photo (and a memo). */
export const DETAIL_TYPES = new Set(["task_done", "care_checkin", "feed_post", "care_request_declined", "care_request_countered"]);

export function detailNextLabel(type: string, role: "owner" | "sitter"): string {
  if (type === "feed_post") return "See in Feed";
  if (type.startsWith("care_request")) return "Open the request";
  return role === "owner" ? "See in History" : "Continue";
}

const TABLE: Record<string, string> = { task_done: "task_logs", care_checkin: "care_checkins", feed_post: "feed_posts" };

type Row = {
  id: string;
  media: { cloudinary_public_id: string; resource_type: MediaResourceType } | { cloudinary_public_id: string; resource_type: MediaResourceType }[] | null;
};

/**
 * Which of these notices came with a photo → that photo. A notice points at its record (`ref_id`:
 * the finished task, the check-in, or the feed post), and the record holds the photo, so nothing
 * extra is stored on the notice.
 */
export async function loadNoticeMedia(items: AppNotification[]): Promise<Record<string, DiaryMedia>> {
  const result: Record<string, DiaryMedia> = {};
  for (const [type, table] of Object.entries(TABLE)) {
    const mine = items.filter((n) => n.type === type && n.refId);
    if (mine.length === 0) continue;
    const { data, error } = await getSupabase()
      .from(table)
      .select("id, media (cloudinary_public_id, resource_type)")
      .in("id", mine.map((n) => n.refId as string));
    if (error) continue; // A missing thumbnail must never break the list.
    const byRecord = new Map(((data ?? []) as unknown as Row[]).map((r) => [r.id, Array.isArray(r.media) ? r.media[0] : r.media]));
    for (const n of mine) {
      const m = byRecord.get(n.refId as string);
      if (m) result[n.id] = { publicId: m.cloudinary_public_id, resourceType: m.resource_type };
    }
  }
  return result;
}

/** Photo per notice id for the notices currently shown. */
export function useNoticeMedia(items: AppNotification[] | null): Record<string, DiaryMedia> {
  const [media, setMedia] = useState<Record<string, DiaryMedia>>({});
  const key = useMemo(() => (items ?? []).map((n) => n.id).join(","), [items]);
  useEffect(() => {
    if (!items || items.length === 0) return;
    let live = true;
    void loadNoticeMedia(items)
      .then((m) => live && setMedia((prev) => ({ ...prev, ...m })))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // `key` changes exactly when the set of notices changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return media;
}
