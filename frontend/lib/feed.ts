import { isoToZoned } from "../features/schedule/dates";
import { ApiError, apiDelete, apiPost } from "./api";
import { getSupabase } from "./supabase";
import type { Role } from "../providers/SessionProvider";
import type { CaptionSource, FeedCategory, FeedPostRow, FeedVisibility, MediaResourceType } from "../types/db";

/**
 * Feed post insert + owner/sitter timeline query (Phase 05); filters, day groups and the mosaic rows of the Feed tab (#345).
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
  /** The author's short memo (up to 200 characters). */
  note?: string | null;
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
  /** The tags of the photo (any number of them, 015l); `category` is the one the app and the care functions write. */
  tags: FeedTag[];
  note: string | null;
  taskLogId: string | null;
  /** When it was sent (the 30 minutes to delete it for both count from here). */
  createdAt: string;
  /** When the photo is "from" (015l): the day header, the order and the time on it. The author can move it. */
  takenAt: string;
};

export type FeedMedia = {
  id: string;
  publicId: string;
  resourceType: MediaResourceType;
  /** `sticker` = a cut-out PNG of the pet (Snap), drawn on a tinted ground instead of cropped. */
  purpose: string;
  width: number | null;
  height: number | null;
  durationS: number | null;
};

/** One Feed photo: post + media + author display name; `hidden` = I hid it (still in my Feed, under Hidden). */
export type FeedTimelinePost = FeedPost & {
  media: FeedMedia;
  authorName: string;
  hidden: boolean;
};

const FEED_COLUMNS =
  "id, pet_id, sitter_id, posted_by, visibility, media_id, caption, caption_source, category, tags, note, task_log_id, created_at, taken_at";

// `hidden` reads my own row of feed_post_hidden (RLS shows nobody else's); a post I removed is not returned at all.
const TIMELINE_SELECT =
  `${FEED_COLUMNS}, ` +
  "media (id, cloudinary_public_id, resource_type, purpose, width, height, duration_s), " +
  "author:profiles!feed_posts_posted_by_fkey (display_name), " +
  "hidden:feed_post_hidden (state)";

type MediaEmbed = {
  id: string;
  cloudinary_public_id: string;
  resource_type: MediaResourceType;
  purpose: string;
  width: number | null;
  height: number | null;
  duration_s: number | null;
};

type TimelineRow = FeedPostRow & {
  media: MediaEmbed | null;
  author: { display_name: string } | null;
  hidden?: { state: string } | { state: string }[] | null;
};

/** The tags of a row: its own list, or the one tag of an older row. */
function tagsOf(row: FeedPostRow): FeedTag[] {
  const own = row.tags ?? [];
  const list = own.length > 0 ? own : row.category ? [row.category] : [];
  return list.filter((t): t is FeedTag => TAGS.includes(t));
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
    tags: tagsOf(row),
    note: row.note ?? null,
    taskLogId: row.task_log_id,
    createdAt: row.created_at,
    takenAt: row.taken_at ?? row.created_at,
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
      purpose: media.purpose ?? "feed",
      width: media.width,
      height: media.height,
      durationS: media.duration_s == null ? null : Number(media.duration_s),
    },
    authorName: row.author?.display_name ?? "Someone",
    hidden: [row.hidden ?? []].flat().some((h) => h.state === "hidden"),
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
      note: input.note?.trim() ? input.note.trim() : null,
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

/** What the chips of the Feed filter by. `none` = no tag (play, other, stickers and untagged photos). */
export type FeedFilterKey = "all" | "meal" | "walk" | "nap" | "mood" | "potty" | "none";

/** The chips, in the order of the Figma frame; No tag comes last. */
export const FEED_FILTERS: { key: FeedFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "meal", label: "Meals" },
  { key: "walk", label: "Walks" },
  { key: "nap", label: "Naps" },
  { key: "mood", label: "Mood" },
  { key: "potty", label: "Potty" },
  { key: "none", label: "No tag" },
];

export type FeedTag = Exclude<FeedFilterKey, "all" | "none">;

const TAGS: readonly string[] = ["meal", "walk", "nap", "mood", "potty"];

/** The tags a photo can have, with the words the app shows for them. */
export const FEED_TAGS: { key: FeedTag; label: string }[] = [
  { key: "meal", label: "Meals" },
  { key: "walk", label: "Walks" },
  { key: "nap", label: "Naps" },
  { key: "mood", label: "Mood" },
  { key: "potty", label: "Potty" },
];

/** The tags shown on a photo, in the order of the chips; a sticker has none. */
export function feedTags(post: Pick<FeedPost, "tags"> & { media: Pick<FeedMedia, "purpose"> }): FeedTag[] {
  if (post.media.purpose === "sticker") return [];
  return TAGS.filter((t): t is FeedTag => post.tags.includes(t as FeedTag));
}

export function matchesFilter(post: FeedTimelinePost, key: FeedFilterKey): boolean {
  if (key === "all") return true;
  const tags = feedTags(post);
  return key === "none" ? tags.length === 0 : tags.includes(key);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat Oct 10" for a `YYYY-MM-DD` day; another year than `today`'s adds it: "Sat Oct 10, 2027". */
export function feedDayName(day: string, today: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const year = day.slice(0, 4) === today.slice(0, 4) ? "" : `, ${y}`;
  return `${weekday} ${MONTHS[m - 1]} ${d}${year}`;
}

function previousDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** The day header: "Today · Sat Oct 10", "Yesterday · Fri Oct 9", then "Thu Oct 8". */
export function feedDayLabel(day: string, today: string): string {
  const name = feedDayName(day, today);
  if (day === today) return `Today · ${name}`;
  if (day === previousDay(today)) return `Yesterday · ${name}`;
  return name;
}

/** The time on a photo, as drawn in Figma: "9:02" (the viewer shows "9:02 AM"). */
export function feedBadgeTime(iso: string): string {
  const [h, m] = isoToZoned(iso).time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`;
}

/** One line of the Feed list: a day header, the newest photo big beside two small ones, or up to three photos. */
export type MosaicRow =
  | { kind: "header"; key: string; label: string; count: number }
  | { kind: "hero"; key: string; hero: FeedTimelinePost; side: FeedTimelinePost[] }
  | { kind: "cells"; key: string; posts: FeedTimelinePost[] };

/**
 * Newest first, a header per day. The newest photo of all takes 2 x 2 cells with the next two of its day stacked at
 * its side; every other photo is one cell, three to a row. `dayOf` = the photo's local date.
 */
export function buildMosaic(posts: FeedTimelinePost[], dayOf: (iso: string) => string, today: string): MosaicRow[] {
  const byDay = new Map<string, FeedTimelinePost[]>();
  for (const post of [...posts].sort((a, b) => b.takenAt.localeCompare(a.takenAt))) {
    const day = dayOf(post.takenAt);
    byDay.set(day, [...(byDay.get(day) ?? []), post]);
  }
  const rows: MosaicRow[] = [];
  [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([day, list], index) => {
      rows.push({ kind: "header", key: `day-${day}`, label: feedDayLabel(day, today), count: list.length });
      let rest = list;
      if (index === 0) {
        rows.push({ kind: "hero", key: `hero-${list[0].id}`, hero: list[0], side: list.slice(1, 3) });
        rest = list.slice(3);
      }
      for (let i = 0; i < rest.length; i += 3) {
        const chunk = rest.slice(i, i + 3);
        rows.push({ kind: "cells", key: `row-${chunk[0].id}`, posts: chunk });
      }
    });
  return rows;
}

/** A shared photo can be deleted for both for this long after it was sent (015j). */
export const UNSEND_MINUTES = 30;

/** The author of a shared photo, within 30 minutes of sending it. */
export function canDeleteForBoth(post: FeedTimelinePost, me: string | null, now = Date.now()): boolean {
  return (
    me != null &&
    post.postedBy === me &&
    post.visibility === "shared" &&
    now - Date.parse(post.createdAt) <= UNSEND_MINUTES * 60_000
  );
}

export type DeleteScope = "me" | "everyone";

/**
 * Take a photo out of my Feed (`me`), or, for the author of a shared photo within 30 minutes, out of both Feeds
 * (`everyone`). The other person keeps what I delete on my side. The file goes only when nobody can see it any more.
 */
export async function removeFeedPost(postId: string, scope: DeleteScope = "me"): Promise<void> {
  try {
    await apiDelete(`/api/feed/${postId}?scope=${scope}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) throw new Error(error.message);
    if (error instanceof ApiError && error.status === 403) {
      throw new Error("Only the person who posted it can delete it for both.");
    }
    if (error instanceof ApiError && error.status === 404) return; // already gone
    throw new Error("Couldn't delete this photo. Try again.");
  }
}

/** What an author can change on a photo (015l). */
export type FeedEdit = { takenAt: string; note: string; tags: FeedTag[] };

/** The author changes the tags, the day and time, and the memo of their photo. */
export async function updateFeedPost(postId: string, edit: FeedEdit): Promise<void> {
  const { error } = await getSupabase().rpc("update_feed_post", {
    p_post: postId,
    p_taken_at: edit.takenAt,
    p_note: edit.note,
    p_tags: edit.tags,
  });
  if (!error) return;
  if (error.message === "in_the_future") throw new Error("Pick a time that has already passed.");
  if (error.message === "not_author") throw new Error("Only the person who posted it can edit it.");
  throw new Error("Couldn't save this photo. Try again.");
}

/** Hide a photo from the grid (it comes back under Hidden). */
export async function hideFeedPost(postId: string): Promise<void> {
  const { error } = await getSupabase().rpc("hide_feed_post", { p_post: postId });
  if (error && error.message !== "not_found") throw new Error("Couldn't hide this photo. Try again.");
}

export async function unhideFeedPost(postId: string): Promise<void> {
  const { error } = await getSupabase().rpc("unhide_feed_post", { p_post: postId });
  if (error) throw new Error("Couldn't unhide this photo. Try again.");
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
    .order("taken_at", { ascending: false })
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
