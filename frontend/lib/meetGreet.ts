import { getApiBaseUrl } from "./api";
import { BookingError, BookingSummary, bookingErrorMessage } from "./bookings";
import { getSupabase } from "./supabase";

/**
 * Meet & Greet RPC wrappers (phase-03b 3B.9, 005, D44). Only first-time pairs have one;
 * the sitter can Accept the booking once it is done or both agreed to skip it.
 */

export type MeetGreetMode = "in_person" | "video";

const MESSAGES: Record<string, string> = {
  place_required: "Pick a place to meet.",
  place_too_long: "Keep the place to one short line.",
  invalid_window: "Pick a time in the future.",
  meet_greet_not_yet: "You can mark it done once the meeting time has come.",
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

/** Accept = continue without meeting; decline = the booking is cancelled (D44). */
export function respondSkipMeetGreet(bookingId: string, accept: boolean) {
  return call("respond_skip_meet_greet", { p_booking: bookingId, p_accept: accept }, "Couldn't answer. Try again.");
}

export type MeetSpots = { ownerName: string; ownerSpots: string[]; sitterName: string; sitterSpots: string[] };

/** Both sides' preferred public meeting spots (≤ 3 each) for the In person sheet. */
export async function getMeetGreetOptions(bookingId: string): Promise<MeetSpots> {
  const { data, error } = await getSupabase().rpc("get_meet_greet_options", { p_booking: bookingId }).maybeSingle();
  if (error || !data) return { ownerName: "", ownerSpots: [], sitterName: "", sitterSpots: [] };
  const row = data as { owner_name: string; owner_spots: string[]; sitter_name: string; sitter_spots: string[] };
  return {
    ownerName: row.owner_name,
    ownerSpots: row.owner_spots ?? [],
    sitterName: row.sitter_name,
    sitterSpots: row.sitter_spots ?? [],
  };
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
 * call again; returns null while Google isn't set up — the card then keeps the time + .ics.
 */
export async function requestVideoLink(bookingId: string): Promise<string | null> {
  return (await backend("/api/meet-greet/video-link", bookingId))?.link ?? null;
}

/** Best effort: drop the Calendar event once the booking ended or the meeting moved in person. */
export async function releaseVideoLink(bookingId: string): Promise<void> {
  await backend("/api/meet-greet/video-link/release", bookingId);
}

function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * A 30-minute calendar event for "Add to calendar" (3B.9 / 3B.11). On the web it downloads
 * an .ics file; elsewhere it is a no-op until native calendar support lands.
 */
export function addMeetGreetToCalendar(b: BookingSummary): void {
  const { at, mode, place, link } = b.meetGreet;
  if (!at || typeof document === "undefined") return;
  const start = new Date(at);
  const end = new Date(start.getTime() + 30 * 60_000);
  const pets = b.pets.map((p) => p.name).join(" & ");
  const where = mode === "video" ? (link ?? "Google Meet") : (place ?? "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pawddy//Meet & Greet//EN",
    "BEGIN:VEVENT",
    `UID:meet-greet-${b.id}@pawddy`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:Pawddy Meet & Greet — ${pets} with ${b.ownerName} & ${b.sitterName}`,
    `LOCATION:${where.replace(/[,;]/g, " ")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "pawddy-meet-greet.ics";
  a.click();
  URL.revokeObjectURL(url);
}
