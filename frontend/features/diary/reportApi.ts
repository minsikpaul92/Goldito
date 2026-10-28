import { ApiError, apiPost } from "../../lib/api";
import { thumbUrl, videoPosterUrl } from "../../lib/cloudinary";
import { getSupabase } from "../../lib/supabase";
import { CHECKIN_GROUPS } from "../care/checkinOptions";
import type { Species } from "../../types/db";
import { addDays, appToday, zonedToIso } from "../schedule/dates";

/** One chip from `POST /api/ai/report-chips`. A record chip carries the `check` it turns off. */
export type ReportChip = {
  id: string;
  kind: "record" | "episode";
  label: string;
  source: "checkin" | "task" | "feed" | "vision" | "custom";
  check: "meal" | "potty" | "walk" | "mood" | "meds" | null;
  /** What was recorded (meal / potty / mood value, walk minutes) — the sitter can correct it. */
  value?: string | null;
  media_id: string | null;
};
export type DaySummary = { tasks_done: number; tasks_missed: number; checkins: number };
export type ChipPhoto = { media_id: string; description: string };
export type ChipSuggestions = { summary: DaySummary; chips: ReportChip[]; photos: ChipPhoto[] };

export const REPORT_NOTE_MAX = 200;
export const REPORT_BODY_MAX = 2000;
export const REPORT_MAX_PHOTOS = 2;
/** Highlights (episode chips) the report uses; more can stay on, the first ones go in (server MAX_CHIPS). */
export const REPORT_MAX_HIGHLIGHTS = 8;
export const CUSTOM_CHIP_MAX = 40;

/** `fallback`: the writing model was down, so the draft is the plain list of the kept chips (RV-8). */
export type ReportDraft = {
  id: string;
  body: string;
  status: "draft" | "sent";
  fallback?: boolean;
  /** The photo on a sent page (014t). */
  photoUrl?: string | null;
  /** Every photo on the page, the main one first (015x). */
  photoUrls?: string[];
};

function explain(error: unknown, fallback: string): Error {
  // The server's 403 / 409 messages are already written for the sitter. (A model outage is no longer an error:
  // the report comes back as a plain-list draft.)
  if (error instanceof ApiError && [403, 409].includes(error.status)) return new Error(error.message);
  return new Error(fallback);
}

export async function suggestChips(petId: string, mediaIds: string[]): Promise<ChipSuggestions> {
  try {
    return await apiPost<ChipSuggestions>("/api/ai/report-chips", { pet_id: petId, media_ids: mediaIds });
  } catch (error) {
    throw explain(error, "Couldn't suggest chips. Check your connection and try again.");
  }
}

/** Chips for the photos on an owner's own page (`POST /api/ai/diary-photo-chips`): episode chips, one or two per photo. */
export async function suggestPhotoChips(petId: string, mediaIds: string[]): Promise<ReportChip[]> {
  try {
    const res = await apiPost<{ chips: ReportChip[] }>("/api/ai/diary-photo-chips", { pet_id: petId, media_ids: mediaIds });
    return res.chips;
  } catch (error) {
    throw explain(error, "Couldn't suggest chips. Check your connection and try again.");
  }
}

export type GenerateInput = {
  petId: string;
  /** Labels of the episode chips the sitter kept. */
  chips: string[];
  note: string | null;
  /** Vision descriptions of the photos picked for today (from `suggestChips`). */
  photos: string[];
  /** Record chips switched off. */
  skip: string[];
  /** Corrected values: { meal: "most", walk: "30" }. */
  overrides?: Record<string, string>;
  /** Episode chips switched off (`note-…`, `feed-…`): their notes / captions stay out of the report. */
  off?: string[];
};

export async function generateReport(input: GenerateInput): Promise<ReportDraft> {
  try {
    const res = await apiPost<{ report_id: string; body: string; status: "draft"; fallback?: boolean }>("/api/ai/daily-report", {
      pet_id: input.petId,
      chips: input.chips,
      sitter_note: input.note,
      photos: input.photos,
      skip: input.skip,
      overrides: input.overrides ?? {},
      off: input.off ?? [],
    });
    return { id: res.report_id, body: res.body, status: "draft", fallback: res.fallback ?? false };
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) throw new Error("Too many highlights. Turn a few off and try again.");
    throw explain(error, "Couldn't write the page. Check your connection and try again.");
  }
}

/** Today's report for this pet written by me (the draft is private to me; RLS). */
export async function getTodayReport(petId: string, sitterId: string): Promise<ReportDraft | null> {
  // A day can hold several sent reports and at most one draft (011f, FB-22): the draft first, else the last sent.
  const { data, error } = await getSupabase()
    .from("daily_reports")
    .select("id, body, status, sent_at, more_media_ids, media(cloudinary_public_id, resource_type)")
    .eq("pet_id", petId)
    .eq("sitter_id", sitterId)
    .eq("report_date", appToday());
  if (error) throw new Error("Couldn't load today's page.");
  const found = (data ?? []) as unknown as (Omit<ReportDraft, "photoUrl" | "photoUrls"> & { sent_at: string | null; more_media_ids: string[]; media: Embed<PageMedia> })[];
  const more = await loadMorePhotos(found.flatMap((r) => r.more_media_ids ?? []));
  const rows = found.map((r) => {
    const photoUrls = [pageMediaUrl(first(r.media)), ...(r.more_media_ids ?? []).map((id) => more.get(id) ?? null)].filter((u): u is string => !!u);
    return { ...r, photoUrl: photoUrls[0] ?? null, photoUrls };
  });
  const draft = rows.find((r) => r.status === "draft");
  const last = rows.filter((r) => r.status === "sent").sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""))[0];
  const pick = draft ?? last;
  return pick ? { id: pick.id, body: pick.body, status: pick.status, photoUrl: pick.photoUrl, photoUrls: pick.photoUrls } : null;
}

/** Today's draft written by the sitter's own hand (014b) — the same one draft the AI writes; returns its id. */
export async function saveDraftByHand(petId: string, body: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("save_report_draft", { p_pet: petId, p_body: body });
  if (!error) return data as string;
  if (error.message.includes("not_on_duty")) throw new Error("You can write this page only while you're caring for this pet.");
  if (error.message.includes("body_required")) throw new Error("Write something before sending.");
  if (error.message.includes("body_too_long")) throw new Error(`Keep it under ${REPORT_BODY_MAX} characters.`);
  throw new Error("Couldn't save the page. Check your connection and try again.");
}

/** The sitter's approval: the text they send is the final text (009). */
export async function sendReport(reportId: string, body: string): Promise<void> {
  const { error } = await getSupabase().rpc("send_daily_report", { p_report: reportId, p_body: body });
  if (!error) return;
  if (error.message.includes("report_already_sent")) throw new Error("This page was already sent.");
  if (error.message.includes("body_required")) throw new Error("Write something before sending.");
  if (error.message.includes("body_too_long")) throw new Error(`Keep it under ${REPORT_BODY_MAX} characters.`);
  throw new Error("Couldn't send the page. Check your connection and try again.");
}

/** An owner's own diary page (014p): sent at once, no AI, no notice; only the owner ever sees it. */
export async function addOwnerEntry(petId: string, body: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("add_owner_diary_entry", { p_pet: petId, p_body: body });
  if (!error) return data as string;
  if (error.message.includes("not_owner")) throw new Error("You can write a page only for your own pet.");
  if (error.message.includes("body_required")) throw new Error("Write something first.");
  if (error.message.includes("body_too_long")) throw new Error(`Keep it under ${REPORT_BODY_MAX} characters.`);
  throw new Error("Couldn't save the page. Check your connection and try again.");
}

/** Puts one of the writer's own images of the pet on their page, or takes it off (`null`) (014t). */
export async function setDiaryPagePhoto(reportId: string, mediaId: string | null): Promise<void> {
  const { error } = await getSupabase().rpc("set_diary_page_photo", { p_report: reportId, p_media: mediaId });
  if (!error) return;
  throw new Error("Couldn't put the photo on the page.");
}

/** Puts up to four of the writer's own images of the pet on their page, the first one as the main photo; `[]` takes them all off (015x). */
export async function setDiaryPagePhotos(reportId: string, mediaIds: string[]): Promise<void> {
  const { error } = await getSupabase().rpc("set_diary_page_photos", { p_report: reportId, p_media: mediaIds });
  if (!error) return;
  throw new Error("Couldn't put the photos on the page.");
}

/** The writer deletes their own page (014t): draft or sent. A sitter's sent page leaves the owner's book too. */
export async function deleteDiaryPage(reportId: string): Promise<void> {
  const { error } = await getSupabase().rpc("delete_diary_page", { p_report: reportId });
  if (!error || error.message.includes("not_found")) return; // already gone is fine
  if (error.message.includes("not_author")) throw new Error("You can delete only a page you wrote.");
  throw new Error("Couldn't delete the page. Check your connection and try again.");
}

/** The owner takes a sitter's page out of their own book (014t). The sitter keeps their copy. */
export async function hideDiaryPage(reportId: string): Promise<void> {
  const { error } = await getSupabase().rpc("hide_diary_page", { p_report: reportId });
  if (!error || error.message.includes("not_found")) return;
  if (error.message.includes("own_page")) throw new Error("Delete your own page instead.");
  throw new Error("Couldn't hide the page. Check your connection and try again.");
}

export type SentReport = {
  id: string;
  /** Who wrote the page (a profile id): the sitter, or the owner for their own page. */
  authorId: string;
  petId: string;
  petName: string;
  species: Species;
  sitterName: string;
  day: string;
  body: string;
  sentAt: string | null;
  tasks: { title: string; status: string }[];
  /** The photo the writer put on the page (014t); without one the page shows the day's first shared photo. */
  photoUrl: string | null;
  /** Every photo the writer put on the page, the main one first (015x). */
  photoUrls: string[];
};

type Embed<T> = T | T[] | null;
type PageMedia = { cloudinary_public_id: string; resource_type: "image" | "video" };

/** The picture box's image for a page's own photo. */
function pageMediaUrl(media: PageMedia | null): string | null {
  if (!media) return null;
  return (media.resource_type === "video" ? videoPosterUrl(media.cloudinary_public_id, 600) : thumbUrl(media.cloudinary_public_id, 600)) || null;
}
type ReportRow = {
  id: string;
  sitter_id: string;
  pet_id: string;
  report_date: string;
  body: string;
  sent_at: string | null;
  source_snapshot: { tasks?: { title: string; status: string }[] } | null;
  pets: Embed<{ name: string; species: Species }>;
  sitter: Embed<{ display_name: string }>;
  media: Embed<PageMedia>;
  more_media_ids: string[];
};
const first = <T,>(v: Embed<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const COLUMNS =
  "id, sitter_id, pet_id, report_date, body, sent_at, source_snapshot, more_media_ids, pets(name, species), sitter:profiles!daily_reports_sitter_id_fkey(display_name), media(cloudinary_public_id, resource_type)";

/** The page's other photos (015x) in one query: media id → picture url (RLS: the same media policy as the main photo). */
async function loadMorePhotos(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  const { data } = await getSupabase().from("media").select("id, cloudinary_public_id, resource_type").in("id", unique);
  for (const m of (data ?? []) as (PageMedia & { id: string })[]) {
    const url = pageMediaUrl(m);
    if (url) out.set(m.id, url);
  }
  return out;
}

function toSent(row: ReportRow, more: Map<string, string>): SentReport {
  const photoUrls = [pageMediaUrl(first(row.media)), ...(row.more_media_ids ?? []).map((id) => more.get(id) ?? null)].filter((u): u is string => !!u);
  return {
    id: row.id,
    authorId: row.sitter_id,
    petId: row.pet_id,
    petName: first(row.pets)?.name ?? "Your pet",
    species: first(row.pets)?.species ?? "dog",
    sitterName: first(row.sitter)?.display_name ?? "Your sitter",
    day: row.report_date,
    body: row.body,
    sentAt: row.sent_at,
    tasks: row.source_snapshot?.tasks ?? [],
    photoUrl: photoUrls[0] ?? null,
    photoUrls,
  };
}

/** The reports the sitter sent for my pets, newest first (RLS: owners only see `sent`). */
export async function listSentReports(): Promise<SentReport[]> {
  const { data, error } = await getSupabase()
    .from("daily_reports")
    .select(COLUMNS)
    .eq("status", "sent")
    .order("report_date", { ascending: false })
    // Several reports a day (011f): the later one first.
    .order("sent_at", { ascending: false })
    .limit(60);
  if (error) throw new Error("Couldn't load the diary. Check your connection and try again.");
  const rows = (data ?? []) as unknown as ReportRow[];
  const more = await loadMorePhotos(rows.flatMap((r) => r.more_media_ids ?? []));
  return rows.map((r) => toSent(r, more));
}

/**
 * Every sent page I can read, oldest first — the diary book (owner: their pets' pages; sitter: the pages they wrote).
 * RLS decides which: owners see `sent` reports of their pets, a sitter their own rows (drafts filtered out here).
 */
export async function listBookPages(): Promise<SentReport[]> {
  const { data, error } = await getSupabase()
    .from("daily_reports")
    .select(COLUMNS)
    .eq("status", "sent")
    .order("report_date", { ascending: true })
    .order("sent_at", { ascending: true })
    .limit(500);
  if (error) throw new Error("Couldn't load the diary. Check your connection and try again.");
  const rows = (data ?? []) as unknown as ReportRow[];
  const more = await loadMorePhotos(rows.flatMap((r) => r.more_media_ids ?? []));
  return rows.map((r) => toSent(r, more));
}

export async function getSentReport(reportId: string): Promise<SentReport | null> {
  const { data, error } = await getSupabase().from("daily_reports").select(COLUMNS).eq("id", reportId).eq("status", "sent").maybeSingle();
  if (error) throw new Error("Couldn't load this entry.");
  if (!data) return null;
  const row = data as unknown as ReportRow;
  return toSent(row, await loadMorePhotos(row.more_media_ids ?? []));
}

export type ReportPhoto = { id: string; publicId: string; resourceType: "image" | "video" };

/**
 * The photos shared that day (the picture on the page). `includePrivate`: the owner's own page also shows the
 * owner's private photos (RLS lets only the owner read them).
 */
export async function listReportPhotos(petId: string, day: string, includePrivate = false): Promise<ReportPhoto[]> {
  let query = getSupabase().from("feed_posts").select("id, media(cloudinary_public_id, resource_type, purpose)").eq("pet_id", petId);
  if (!includePrivate) query = query.eq("visibility", "shared");
  const { data, error } = await query
    .gte("created_at", zonedToIso(day, "00:00"))
    .lt("created_at", zonedToIso(addDays(day, 1), "00:00"))
    .order("created_at", { ascending: true });
  if (error) return [];
  const out: ReportPhoto[] = [];
  for (const row of (data ?? []) as unknown as { id: string; media: Embed<{ cloudinary_public_id: string; resource_type: "image" | "video"; purpose?: string }> }[]) {
    const media = first(row.media);
    // A sticker in the Feed (015j) is not a photo of the day.
    if (media && media.purpose !== "sticker") out.push({ id: row.id, publicId: media.cloudinary_public_id, resourceType: media.resource_type });
  }
  return out;
}

/** The newest photo of each pet I can see, for the diary covers (RLS: an owner also sees their private ones). */
export async function listPetCoverPhotos(petIds: string[]): Promise<Record<string, ReportPhoto>> {
  if (petIds.length === 0) return {};
  const { data, error } = await getSupabase()
    .from("feed_posts")
    .select("id, pet_id, media(cloudinary_public_id, resource_type, purpose)")
    .in("pet_id", petIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return {};
  const out: Record<string, ReportPhoto> = {};
  for (const row of (data ?? []) as unknown as { id: string; pet_id: string; media: Embed<{ cloudinary_public_id: string; resource_type: "image" | "video"; purpose?: string }> }[]) {
    const media = first(row.media);
    if (media && media.purpose !== "sticker" && !out[row.pet_id]) out[row.pet_id] = { id: row.id, publicId: media.cloudinary_public_id, resourceType: media.resource_type };
  }
  return out;
}

/** First sentence of the body, for the list card. */
export function previewOf(body: string, max = 120): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](\s|$)/);
  const line = end >= 0 ? flat.slice(0, end + 1) : flat;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** The chip text for a corrected value, e.g. `Meal: Most` · `Walk: 30 min`. */
export function overrideLabel(check: string, value: string): string | null {
  const group = CHECKIN_GROUPS.find((g) => g.kind === check);
  const option = group?.options.find((o) => o.value === value);
  return group && option ? `${group.label}: ${option.label}` : null;
}

/** One line for the top of the Report screen. */
export function summaryLine(s: DaySummary): string {
  const parts = [`${s.tasks_done} task${s.tasks_done === 1 ? "" : "s"} done`];
  if (s.tasks_missed > 0) parts.push(`${s.tasks_missed} missed`);
  parts.push(`${s.checkins} check-in${s.checkins === 1 ? "" : "s"}`);
  return `Today: ${parts.join(" · ")}`;
}
