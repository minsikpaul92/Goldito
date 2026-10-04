import { ApiError, apiDelete } from "./api";
import { getSupabase } from "./supabase";
import type { CaptionSource, FeedPostRow, MediaResourceType } from "../types/db";

/**
 * Feed post insert + owner/sitter timeline query (Phase 05).
 * Sitter RLS on insert: on-duty + media belongs to the pet.
 * Phase 09 plugs AI caption in front of createFeedPost; Phase 06 may pass captionSource='task'.
 */

export type { CaptionSource };

/** Phase 05 default until Phase 09 AI captions land. */
export const FALLBACK_CAPTION = "A moment from today's care 🐾";

/** Owner Feed page size (phase-05 5.2 — range(0, 19)). */
export const FEED_PAGE_SIZE = 20;

export type CreateFeedPostInput = {
  petId: string;
  mediaId: string;
  caption: string;
  captionSource: CaptionSource;
};

export type FeedPost = {
  id: string;
  petId: string;
  sitterId: string;
  mediaId: string;
  caption: string | null;
  captionSource: CaptionSource | null;
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

/** One timeline card: post + media + sitter display name. */
export type FeedTimelinePost = FeedPost & {
  media: FeedMedia;
  sitterName: string;
};

const FEED_COLUMNS =
  "id, pet_id, sitter_id, media_id, caption, caption_source, task_log_id, created_at";

const TIMELINE_SELECT =
  `${FEED_COLUMNS}, ` +
  "media (id, cloudinary_public_id, resource_type, width, height, duration_s), " +
  "sitter:profiles!feed_posts_sitter_id_fkey (display_name)";

type MediaEmbed = {
  id: string;
  cloudinary_public_id: string;
  resource_type: MediaResourceType;
  width: number | null;
  height: number | null;
  duration_s: number | null;
};

type TimelineRow = FeedPostRow & {
  media: MediaEmbed | null;
  sitter: { display_name: string } | null;
};

function asFeedPost(row: FeedPostRow): FeedPost {
  return {
    id: row.id,
    petId: row.pet_id,
    sitterId: row.sitter_id,
    mediaId: row.media_id,
    caption: row.caption,
    captionSource: row.caption_source,
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
    media: {
      id: media.id,
      publicId: media.cloudinary_public_id,
      resourceType: media.resource_type,
      width: media.width,
      height: media.height,
      durationS: media.duration_s == null ? null : Number(media.duration_s),
    },
    sitterName: row.sitter?.display_name ?? "Your sitter",
  };
}

/**
 * Insert one feed_posts row (1 post = 1 media, D10). Caller must be the on-duty
 * sitter; caption comes from the caller (fallback today, AI in Phase 09).
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
      sitter_id: userData.user.id,
      media_id: input.mediaId,
      caption: input.caption,
      caption_source: input.captionSource,
    })
    .select(FEED_COLUMNS)
    .single();

  if (error) {
    throw new Error("Couldn't share this photo. Check you're still on duty and try again.");
  }

  return asFeedPost(data as FeedPostRow);
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
