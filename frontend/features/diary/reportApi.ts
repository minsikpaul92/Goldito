import { ApiError, apiPost } from "../../lib/api";
import { getSupabase } from "../../lib/supabase";
import { CHECKIN_GROUPS } from "../care/checkinOptions";
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
export const CUSTOM_CHIP_MAX = 40;

export type ReportDraft = { id: string; body: string; status: "draft" | "sent" };

function explain(error: unknown, fallback: string): Error {
  // The server's 503 / 502 / 403 / 409 messages are already written for the sitter.
  if (error instanceof ApiError && [403, 409, 502, 503].includes(error.status)) return new Error(error.message);
  return new Error(fallback);
}

export async function suggestChips(petId: string, mediaIds: string[]): Promise<ChipSuggestions> {
  try {
    return await apiPost<ChipSuggestions>("/api/ai/report-chips", { pet_id: petId, media_ids: mediaIds });
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
    const res = await apiPost<{ report_id: string; body: string; status: "draft" }>("/api/ai/daily-report", {
      pet_id: input.petId,
      chips: input.chips,
      sitter_note: input.note,
      photos: input.photos,
      skip: input.skip,
      overrides: input.overrides ?? {},
      off: input.off ?? [],
    });
    return { id: res.report_id, body: res.body, status: "draft" };
  } catch (error) {
    throw explain(error, "Couldn't write the report. Check your connection and try again.");
  }
}

/** Today's report for this pet written by me (the draft is private to me; RLS). */
export async function getTodayReport(petId: string, sitterId: string): Promise<ReportDraft | null> {
  const { data, error } = await getSupabase()
    .from("daily_reports")
    .select("id, body, status")
    .eq("pet_id", petId)
    .eq("sitter_id", sitterId)
    .eq("report_date", appToday())
    .maybeSingle();
  if (error) throw new Error("Couldn't load today's report.");
  return (data as ReportDraft | null) ?? null;
}

/** The sitter's approval: the text they send is the final text (009). */
export async function sendReport(reportId: string, body: string): Promise<void> {
  const { error } = await getSupabase().rpc("send_daily_report", { p_report: reportId, p_body: body });
  if (!error) return;
  if (error.message.includes("report_already_sent")) throw new Error("This report was already sent.");
  if (error.message.includes("body_required")) throw new Error("Write something before sending.");
  if (error.message.includes("body_too_long")) throw new Error(`Keep it under ${REPORT_BODY_MAX} characters.`);
  throw new Error("Couldn't send the report. Check your connection and try again.");
}

export type SentReport = {
  id: string;
  petId: string;
  petName: string;
  sitterName: string;
  day: string;
  body: string;
  sentAt: string | null;
  tasks: { title: string; status: string }[];
};

type Embed<T> = T | T[] | null;
type ReportRow = {
  id: string;
  pet_id: string;
  report_date: string;
  body: string;
  sent_at: string | null;
  source_snapshot: { tasks?: { title: string; status: string }[] } | null;
  pets: Embed<{ name: string }>;
  sitter: Embed<{ display_name: string }>;
};
const first = <T,>(v: Embed<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const COLUMNS =
  "id, pet_id, report_date, body, sent_at, source_snapshot, pets(name), sitter:profiles!daily_reports_sitter_id_fkey(display_name)";

function toSent(row: ReportRow): SentReport {
  return {
    id: row.id,
    petId: row.pet_id,
    petName: first(row.pets)?.name ?? "Your pet",
    sitterName: first(row.sitter)?.display_name ?? "Your sitter",
    day: row.report_date,
    body: row.body,
    sentAt: row.sent_at,
    tasks: row.source_snapshot?.tasks ?? [],
  };
}

/** The reports the sitter sent for my pets, newest first (RLS: owners only see `sent`). */
export async function listSentReports(): Promise<SentReport[]> {
  const { data, error } = await getSupabase()
    .from("daily_reports")
    .select(COLUMNS)
    .eq("status", "sent")
    .order("report_date", { ascending: false })
    .limit(60);
  if (error) throw new Error("Couldn't load the diary. Check your connection and try again.");
  return ((data ?? []) as unknown as ReportRow[]).map(toSent);
}

export async function getSentReport(reportId: string): Promise<SentReport | null> {
  const { data, error } = await getSupabase().from("daily_reports").select(COLUMNS).eq("id", reportId).eq("status", "sent").maybeSingle();
  if (error) throw new Error("Couldn't load this entry.");
  return data ? toSent(data as unknown as ReportRow) : null;
}

export type ReportPhoto = { id: string; publicId: string; resourceType: "image" | "video" };

/** The photos the sitter shared that day (the strip under the report). */
export async function listReportPhotos(petId: string, day: string): Promise<ReportPhoto[]> {
  const { data, error } = await getSupabase()
    .from("feed_posts")
    .select("id, media(cloudinary_public_id, resource_type)")
    .eq("pet_id", petId)
    .eq("visibility", "shared")
    .gte("created_at", zonedToIso(day, "00:00"))
    .lt("created_at", zonedToIso(addDays(day, 1), "00:00"))
    .order("created_at", { ascending: true });
  if (error) return [];
  const out: ReportPhoto[] = [];
  for (const row of (data ?? []) as unknown as { id: string; media: Embed<{ cloudinary_public_id: string; resource_type: "image" | "video" }> }[]) {
    const media = first(row.media);
    if (media) out.push({ id: row.id, publicId: media.cloudinary_public_id, resourceType: media.resource_type });
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
