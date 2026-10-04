import { getSupabase } from "../../lib/supabase";
import type { CareCheckinKind, CareTaskType, MediaResourceType } from "../../types/db";
import { careTypeMeta } from "../care/careFormat";
import { addDays, appToday, zonedToIso } from "../schedule/dates";

/** How far back the owner's Diary reaches (phase-06 6.11: today + the last 7 days). */
export const DIARY_DAYS = 7;
const MISSED_AFTER_MS = 60 * 60_000;

export type DiaryMedia = { publicId: string; resourceType: MediaResourceType };

export type DiaryEntry = {
  id: string;
  /** When it happened (task: completed time, or the due time when missed). */
  at: string;
  kind: "task" | "checkin" | "feed";
  emoji: string;
  label: string;
  /** Sitter's memo / caption, shown under the label. */
  memo: string | null;
  media: DiaryMedia | null;
  by: string;
  missed: boolean;
};

type MediaEmbed = { id: string; cloudinary_public_id: string; resource_type: MediaResourceType } | null;
type Named = { display_name: string } | null;

type TaskLogRow = {
  id: string;
  due_at: string;
  status: "pending" | "done";
  completed_at: string | null;
  media_id: string | null;
  care_tasks: { type: CareTaskType; title: string } | null;
  media: MediaEmbed;
  completed: Named;
};
type CheckinRow = {
  id: string;
  kind: CareCheckinKind;
  value: string | null;
  note_text: string | null;
  created_at: string;
  media_id: string | null;
  media: MediaEmbed;
  by: Named;
};
type FeedRow = {
  id: string;
  caption: string | null;
  created_at: string;
  task_log_id: string | null;
  media_id: string;
  media: MediaEmbed;
  author: Named;
};

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);
const toMedia = (m: MediaEmbed | MediaEmbed[]): DiaryMedia | null => {
  const media = one(m as MediaEmbed);
  return media ? { publicId: media.cloudinary_public_id, resourceType: media.resource_type } : null;
};

const MEDIA = "media (id, cloudinary_public_id, resource_type)";

const MOODS: Record<string, string> = { happy: "😊 Happy", calm: "😌 Calm", tired: "😴 Tired" };
const MEALS: Record<string, string> = { all: "All", most: "Most", little: "A little", none: "None" };

/** "Fed · All", "Walk · 30 min", "Mood · Happy" … */
export function checkinLabel(kind: CareCheckinKind, value: string | null): { emoji: string; label: string } {
  switch (kind) {
    case "meal":
      return { emoji: "🍽️", label: `Fed · ${MEALS[value ?? ""] ?? value}` };
    case "potty":
      return { emoji: "💩", label: `Potty · ${value ? value[0].toUpperCase() + value.slice(1) : ""}` };
    case "walk":
      return { emoji: "🦮", label: `Walk · ${value} min` };
    case "mood": {
      const [emoji, ...rest] = (MOODS[value ?? ""] ?? `😊 ${value}`).split(" ");
      return { emoji, label: `Mood · ${rest.join(" ")}` };
    }
    default:
      return { emoji: "📝", label: "Note" };
  }
}

/**
 * Pure merge for the owner's Diary: finished tasks (+ missed ones) · check-ins · photos the
 * sitter shared. A photo that already belongs to a task or a check-in is shown once, on that row.
 * Newest first.
 */
export function buildDiary(
  tasks: TaskLogRow[],
  checkins: CheckinRow[],
  feed: FeedRow[],
  now = Date.now(),
): DiaryEntry[] {
  const entries: DiaryEntry[] = [];
  const usedMedia = new Set<string>();

  for (const log of tasks) {
    const task = one(log.care_tasks);
    if (!task) continue;
    const meta = careTypeMeta(task.type);
    const missed = log.status === "pending" && now > new Date(log.due_at).getTime() + MISSED_AFTER_MS;
    if (log.status !== "done" && !missed) continue;
    if (log.media_id) usedMedia.add(log.media_id);
    entries.push({
      id: `task-${log.id}`,
      at: log.status === "done" ? (log.completed_at ?? log.due_at) : log.due_at,
      kind: "task",
      emoji: missed ? "⚠️" : meta.emoji,
      label: `${task.title} · ${missed ? "Missed" : "Done"}`,
      memo: null,
      media: toMedia(log.media),
      by: one(log.completed)?.display_name ?? "Your sitter",
      missed,
    });
  }

  for (const c of checkins) {
    if (c.media_id) usedMedia.add(c.media_id);
    const { emoji, label } = checkinLabel(c.kind, c.value);
    entries.push({
      id: `checkin-${c.id}`,
      at: c.created_at,
      kind: "checkin",
      emoji,
      label,
      memo: c.note_text,
      media: toMedia(c.media),
      by: one(c.by)?.display_name ?? "Your sitter",
      missed: false,
    });
  }

  for (const post of feed) {
    if (post.task_log_id || usedMedia.has(post.media_id)) continue;
    entries.push({
      id: `feed-${post.id}`,
      at: post.created_at,
      kind: "feed",
      emoji: "📸",
      label: "Photo",
      memo: post.caption,
      media: toMedia(post.media),
      by: one(post.author)?.display_name ?? "Your sitter",
      missed: false,
    });
  }

  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

/** One pet's Diary for today + the last 7 days. Everything is read through RLS. */
export async function listDiary(petId: string): Promise<DiaryEntry[]> {
  const supabase = getSupabase();
  const from = zonedToIso(addDays(appToday(), -DIARY_DAYS), "00:00");

  const [tasks, checkins, feed] = await Promise.all([
    supabase
      .from("task_logs")
      .select(
        `id, due_at, status, completed_at, media_id, care_tasks (type, title), ${MEDIA}, completed:profiles!task_logs_completed_by_fkey (display_name)`,
      )
      .eq("pet_id", petId)
      .gte("due_at", from),
    supabase
      .from("care_checkins")
      .select(
        `id, kind, value, note_text, created_at, media_id, ${MEDIA}, by:profiles!care_checkins_created_by_fkey (display_name)`,
      )
      .eq("pet_id", petId)
      .gte("created_at", from),
    supabase
      .from("feed_posts")
      .select(
        `id, caption, created_at, task_log_id, media_id, ${MEDIA}, author:profiles!feed_posts_posted_by_fkey (display_name)`,
      )
      .eq("pet_id", petId)
      .gte("created_at", from),
  ]);
  if (tasks.error || checkins.error || feed.error) {
    throw new Error("Couldn't load the diary. Check your connection and try again.");
  }
  return buildDiary(
    (tasks.data ?? []) as unknown as TaskLogRow[],
    (checkins.data ?? []) as unknown as CheckinRow[],
    (feed.data ?? []) as unknown as FeedRow[],
  );
}
