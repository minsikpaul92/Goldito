import { ApiError, apiDelete, apiPost } from "./api";
import { getSupabase } from "./supabase";
import type { Role } from "../providers/SessionProvider";
import type { CaptionSource, FeedCategory, FeedPostRow, FeedVisibility, MediaResourceType } from "../types/db";

/**
 * Feed post insert + owner/sitter timeline query (Phase 05).
 * Sitter RLS on insert: on-duty + media belongs to the pet.
 * Phase 09 plugs AI caption in front of createFeedPost; Phase 06 may pass captionSource='task'.
 */

export type { CaptionSource, FeedCategory, FeedVisibility };

/** Used when the caption call fails (the server has its own, name-based one). */
export const FALLBACK_CAPTION = "A moment from today's care 🐾";

/** Owner Feed page size (phase-05 5.2 — range(0, 19)). */
export const FEED_PAGE_SIZE = 20;

export type CreateFeedPostInput = {
  petId: string;
  mediaId: string;
  caption: string;
  captionSource: CaptionSource;
  /** Album bucket picked by the vision model; none for owner posts and when the caption call failed. */
  category?: FeedCategory | null;
  /** Who is posting: sitter posts carry `sitter_id`, owner posts don't. */
  role: Role;
  /** Sitter default `shared`; owner default `private` (5.8). */
  visibility: FeedVisibility;
};

export type FeedPost = {
  id: string;
  petId: string;
  sitterId: string | null;
  postedBy: string;
  visibility: FeedVisibility;
  mediaId: string;
  caption: string | null;
  captionSource: CaptionSource | null;
  category: FeedCategory | null;
  taskLogId: string | null;
  createdAt: string;
};

export type FeedMedia = {
  id: string;
  publicId: string;
  resourceType: MediaResourceType;
  width: number | null;
  height: number | null;
  durationS: number | null;
};

/** One timeline card: post + media + author display name. */
export type FeedTimelinePost = FeedPost & {
  media: FeedMedia;
  authorName: string;
};

const FEED_COLUMNS =
  "id, pet_id, sitter_id, posted_by, visibility, media_id, caption, caption_source, category, task_log_id, created_at";

const TIMELINE_SELECT =
  `${FEED_COLUMNS}, ` +
  "media (id, cloudinary_public_id, resource_type, width, height, duration_s), " +
  "author:profiles!feed_posts_posted_by_fkey (display_name), " +
  "task_log:task_logs!feed_posts_task_log_id_fkey (care_tasks (type))";

type MediaEmbed = {
  id: string;
  cloudinary_public_id: string;
  resource_type: MediaResourceType;
  width: number | null;
  height: number | null;
  duration_s: number | null;
};

type TaskTypeEmbed = { care_tasks: { type: string } | { type: string }[] | null };

type TimelineRow = FeedPostRow & {
  media: MediaEmbed | null;
  author: { display_name: string } | null;
  task_log?: TaskTypeEmbed | TaskTypeEmbed[] | null;
};

/** A task photo's album bucket, from the task's type (feeding → meal …). Anything else is "other". */
const TASK_CATEGORY: Record<string, FeedCategory> = { feeding: "meal", walk: "walk", sleep: "nap", play: "play" };

function taskCategory(row: TimelineRow): FeedCategory | null {
  const log = Array.isArray(row.task_log) ? row.task_log[0] : row.task_log;
  const task = Array.isArray(log?.care_tasks) ? log?.care_tasks[0] : log?.care_tasks;
  return task ? (TASK_CATEGORY[task.type] ?? "other") : null;
}

function asFeedPost(row: FeedPostRow): FeedPost {
  return {
    id: row.id,
    petId: row.pet_id,
    sitterId: row.sitter_id,
    postedBy: row.posted_by,
    visibility: row.visibility,
    mediaId: row.media_id,
    caption: row.caption,
    captionSource: row.caption_source,
    category: row.category ?? null,
    taskLogId: row.task_log_id,
    createdAt: row.created_at,
  };
}

function asTimelinePost(row: TimelineRow): FeedTimelinePost | null {
  const mediaRaw = row.media as MediaEmbed | MediaEmbed[] | null;
  const media = Array.isArray(mediaRaw) ? mediaRaw[0] : mediaRaw;
  if (!media?.cloudinary_public_id || !media.resource_type) return null;
  return {
    ...asFeedPost(row),
    // A task photo has no AI category: it is sorted by what the task was.
    category: row.category ?? taskCategory(row),
    media: {
      id: media.id,
      publicId: media.cloudinary_public_id,
      resourceType: media.resource_type,
      width: media.width,
      height: media.height,
      durationS: media.duration_s == null ? null : Number(media.duration_s),
    },
    authorName: row.author?.display_name ?? "Someone",
  };
}

/**
 * Insert one feed_posts row (1 post = 1 media, D10). The on-duty sitter or the pet's owner
 * posts (RLS checks which); caption comes from the caller (fallback today, AI in Phase 09).
 */
export async function createFeedPost(input: CreateFeedPostInput): Promise<FeedPost> {
  const { data: userData, error: userError } = await getSupabase().auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Couldn't confirm you are signed in.");
  }

  const { data, error } = await getSupabase()
    .from("feed_posts")
    .insert({
      pet_id: input.petId,
      posted_by: userData.user.id,
      sitter_id: input.role === "sitter" ? userData.user.id : null,
      visibility: input.visibility,
      media_id: input.mediaId,
      caption: input.caption,
      caption_source: input.captionSource,
      category: input.category ?? null,
    })
    .select(FEED_COLUMNS)
    .single();

  if (error) {
    throw new Error("Couldn't share this photo. Check you're still on duty and try again.");
  }

  return asFeedPost(data as FeedPostRow);
}

export type PhotoCaption = { caption: string; category: FeedCategory | null; source: "ai" | "fallback" };

/** The caption and album bucket for an uploaded photo. Never throws: any failure is just the fallback caption. */
export async function captionPhoto(petId: string, mediaId: string): Promise<PhotoCaption> {
  try {
    const res = await apiPost<{ caption: string; category: FeedCategory | null; source: "ai" | "fallback" }>(
      "/api/ai/caption",
      { pet_id: petId, media_id: mediaId },
    );
    if (res.caption?.trim()) return { caption: res.caption.trim(), category: res.category ?? null, source: res.source };
  } catch {
    // The photo is posted either way.
  }
  return { caption: FALLBACK_CAPTION, category: null, source: "fallback" };
}

/** Album groups, in this order. `other` and no category share "Moments". */
export const ALBUM_GROUPS: { key: FeedCategory | "moments"; emoji: string; label: string }[] = [
  { key: "meal", emoji: "🍚", label: "Meals" },
  { key: "walk", emoji: "🐕", label: "Walks" },
  { key: "nap", emoji: "😴", label: "Naps" },
  { key: "play", emoji: "🎾", label: "Play" },
  { key: "moments", emoji: "✨", label: "Moments" },
];

export type AlbumDay = { day: string; groups: { key: string; emoji: string; label: string; posts: FeedTimelinePost[] }[] };

/** Newest day first; inside a day the groups in `ALBUM_GROUPS` order, empty ones left out. `dayOf` = local date. */
export function buildAlbum(posts: FeedTimelinePost[], dayOf: (iso: string) => string): AlbumDay[] {
  const byDay = new Map<string, FeedTimelinePost[]>();
  for (const post of [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const day = dayOf(post.createdAt);
    byDay.set(day, [...(byDay.get(day) ?? []), post]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, list]) => ({
      day,
      groups: ALBUM_GROUPS.map((g) => ({
        ...g,
        posts: list.filter((p) => (p.category && p.category !== "other" ? p.category : "moments") === g.key),
      })).filter((g) => g.posts.length > 0),
    }));
}

/**
 * Delete one post and its photo file. Goes through the backend (author-only) so the Cloudinary
 * asset and `media` row are removed too, unless another record still uses them (5.7).
 */
export async function deleteFeedPost(postId: string): Promise<void> {
  try {
    await apiDelete(`/api/feed/${postId}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      throw new Error("You can only delete photos you posted.");
    }
    if (error instanceof ApiError && error.status === 404) return; // already gone
    throw new Error("Couldn't delete this photo. Try again.");
  }
}

/**
 * Owner (or on-duty sitter) timeline for one pet — newest first, page of FEED_PAGE_SIZE.
 * Pass `offset` for Load more / onEndReached (0, 20, 40, …).
 */
export async function listFeedPosts(
  petId: string,
  options: { offset?: number; limit?: number } = {},
): Promise<FeedTimelinePost[]> {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? FEED_PAGE_SIZE;

  const { data, error } = await getSupabase()
    .from("feed_posts")
    .select(TIMELINE_SELECT)
    .eq("pet_id", petId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error("Couldn't load the feed. Check your connection and try again.");
  }

  const rows = (data ?? []) as unknown as TimelineRow[];
  return rows.map(asTimelinePost).filter((p): p is FeedTimelinePost => p != null);
}

/** Relative label for FeedCard ("2h ago"). */
export function formatFeedTime(iso: string, now = Date.now()): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}
