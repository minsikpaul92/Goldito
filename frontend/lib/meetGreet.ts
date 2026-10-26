import { apiPost, getApiBaseUrl } from "./api";
import { BookingError, BookingSummary, bookingErrorMessage } from "./bookings";
import { getSupabase } from "./supabase";

/**
 * Meet & Greet RPC wrappers (phase-03b 3B.9, 005, D44). Only first-time pairs have one;
 * the sitter can Accept the booking once it is done or both agreed to skip it.
 */

export type MeetGreetMode = "in_person" | "video";

/** The one Meet & Greet step that is this person's turn, as the chat footer names it (3D.7). */
export type MeetGreetPrimary = { key: "schedule" | "accept" | "done" | "continue"; label: string };

/**
 * What the footer offers for a first-time booking's Meet & Greet, or null when nothing is waiting for this person.
 * The card does the work; this only says which step it is.
 */
/** `_now` is kept for callers that pass a clock; no step depends on the time since 014s. */
export function meetGreetPrimary(b: BookingSummary, viewer: "owner" | "sitter", _now: number = Date.now()): MeetGreetPrimary | null {
  if (b.status !== "requested") return null;
  const me = viewer === "owner" ? b.ownerId : b.sitterId;
  const mg = b.meetGreet;
  switch (b.meetGreetStatus) {
    case "required":
      // The owner may ask first (015f, #236); the sitter plans after their first yes.
      if (b.sitterInterestAt) return { key: "schedule", label: "Pick a time" };
      return viewer === "owner" ? { key: "schedule", label: "Request Meet & Greet" } : null;
    case "proposed":
      return mg.proposedBy !== me ? { key: "accept", label: "Accept" } : null;
    case "agreed":
      // Any time once agreed; the card asks first when the agreed time has not come yet (014s, #229).
      return { key: "done", label: "Done, we met" };
    case "skip_requested":
      return mg.skipRequestedBy !== me ? { key: "continue", label: "Accept skip" } : null;
    default:
      return null;
  }
}

const MESSAGES: Record<string, string> = {
  place_required: "Pick a place to meet.",
  place_too_long: "Keep the place to one short line.",
  invalid_window: "Pick a time in the future.",
  meet_greet_too_late: "Pick a time before the drop-off.",
  invalid_status: "This Meet & Greet has already changed. Reopen the booking to see the latest.",
};

async function call(fn: string, args: Record<string, unknown>, fallback: string): Promise<void> {
  const { error } = await getSupabase().rpc(fn, args);
  if (error) {
    throw new BookingError(error.message, MESSAGES[error.message] ?? bookingErrorMessage(error.message, fallback));
  }
}

export function proposeMeetGreet(bookingId: string, mode: MeetGreetMode, at: string, place: string | null) {
  return call(
    "propose_meet_greet",
    { p_booking: bookingId, p_mode: mode, p_at: at, p_place: place },
    "Couldn't send the Meet & Greet. Try again.",
  );
}

export function respondMeetGreet(bookingId: string, accept: boolean) {
  return call("respond_meet_greet", { p_booking: bookingId, p_accept: accept }, "Couldn't answer. Try again.");
}

export function completeMeetGreet(bookingId: string) {
  return call("complete_meet_greet", { p_booking: bookingId }, "Couldn't mark it done. Try again.");
}

export function requestSkipMeetGreet(bookingId: string) {
  return call("request_skip_meet_greet", { p_booking: bookingId }, "Couldn't send the request. Try again.");
}

/** Accept = continue without meeting; decline = the request ends (D44, 015f). */
export function respondSkipMeetGreet(bookingId: string, accept: boolean) {
  return call("respond_skip_meet_greet", { p_booking: bookingId, p_accept: accept }, "Couldn't answer. Try again.");
}

/** Decline (015f, #236): either side ends the request while the Meet & Greet is open. */
export function declineMeetGreet(bookingId: string) {
  return call("decline_meet_greet", { p_booking: bookingId }, "Couldn't decline. Try again.");
}

export type MeetSpots = {
  ownerName: string;
  ownerSpots: string[];
  sitterName: string;
  sitterSpots: string[];
  /** A park near the owner's home, only when nobody saved a spot. */
  nearby?: string | null;
};

/** Both sides' preferred public meeting spots (≤ 3 each) for the In person sheet. */
export async function getMeetGreetOptions(bookingId: string): Promise<MeetSpots> {
  const { data, error } = await getSupabase().rpc("get_meet_greet_options", { p_booking: bookingId }).maybeSingle();
  if (error || !data) return { ownerName: "", ownerSpots: [], sitterName: "", sitterSpots: [] };
  const row = data as { owner_name: string; owner_spots: string[]; sitter_name: string; sitter_spots: string[] };
  const spots: MeetSpots = {
    ownerName: row.owner_name,
    ownerSpots: row.owner_spots ?? [],
    sitterName: row.sitter_name,
    sitterSpots: row.sitter_spots ?? [],
  };
  if (spots.ownerSpots.length === 0 && spots.sitterSpots.length === 0) {
    try {
      const park = await apiPost<{ found: boolean; name: string | null }>("/api/geo/meet-park", { booking_id: bookingId });
      spots.nearby = park.found ? park.name : null;
    } catch {
      spots.nearby = null;
    }
  }
  return spots;
}

/** FastAPI call with the user's Supabase token; null when the backend can't help (no URL, not set up, down). */
async function backend(path: string, bookingId: string): Promise<{ link: string | null; status: string } | null> {
  const base = getApiBaseUrl();
  if (!base) return null;
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  try {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ booking_id: bookingId }),
    });
    if (!response.ok) return null;
    return (await response.json()) as { link: string | null; status: string };
  } catch {
    return null;
  }
}

/**
 * Ask FastAPI for the Google Meet link of an agreed video Meet & Greet (3B.11, D45). Safe to
 * call again; returns null while Google isn't set up; the card then keeps the time and Add to calendar.
 */
export async function requestVideoLink(bookingId: string): Promise<string | null> {
  return (await backend("/api/meet-greet/video-link", bookingId))?.link ?? null;
}

/** Best effort: drop the Calendar event once the booking ended or the meeting moved in person. */
export async function releaseVideoLink(bookingId: string): Promise<void> {
  await backend("/api/meet-greet/video-link/release", bookingId);
}

/** "20261005T140000Z", the UTC form Google Calendar's `dates` takes. */
function calendarStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * "Add to calendar" (3B.9 / 3B.11, #170): a Google Calendar event page with the title, the 30-minute time and the
 * place (or the Meet link) filled in. The card renders it as a real link so the new tab is never blocked.
 */
export function meetGreetCalendarUrl(b: BookingSummary): string | null {
  const { at, mode, place, link } = b.meetGreet;
  if (!at) return null;
  const start = new Date(at);
  const end = new Date(start.getTime() + 30 * 60_000);
  const pets = b.pets.map((p) => p.name).join(" & ");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Goldito Meet & Greet: ${pets} with ${b.ownerName} & ${b.sitterName}`,
    dates: `${calendarStamp(start)}/${calendarStamp(end)}`,
    location: mode === "video" ? (link ?? "Google Meet") : (place ?? ""),
  });
  if (mode === "video" && link) params.set("details", `Join: ${link}`);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
