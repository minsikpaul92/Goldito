import { getSupabase } from "./supabase";
import type { CaptionSource, FeedPostRow } from "../types/db";

/**
 * Feed post insert (Phase 05). Sitter RLS: on-duty + media belongs to the pet.
 * Phase 09 plugs AI caption in front of this call; Phase 06 task posts may pass
 * captionSource='task'. No caption text field in the UI (D38).
 */

export type { CaptionSource };

/** Phase 05 default until Phase 09 AI captions land. */
export const FALLBACK_CAPTION = "A moment from today's care 🐾";

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

const FEED_COLUMNS =
  "id, pet_id, sitter_id, media_id, caption, caption_source, task_log_id, created_at";

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
