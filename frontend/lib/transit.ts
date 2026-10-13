import type { Trip } from "../types/db";
import { apiPost } from "./api";
import type { LatLng } from "./location";
import { getSupabase } from "./supabase";

/**
 * Pet Transit RPC wrappers (phase-06b, 012). The RPCs raise their error code as the message
 * (supabase/README.md "RPC errors"); `TransitError` keeps the code and carries copy a screen can show.
 * Named `transit` because `lib/trip.ts` is the booking's drop-off → pick-up window, not this.
 */

export type HandoffKind = Trip["handoff_kind"];

const MESSAGES: Record<string, string> = {
  not_paid: "The booking has to be paid before a trip can start.",
  trip_too_early: "You can start the trip from 2 hours before the handoff.",
  not_traveler: "The other person travels for this handoff.",
  trip_active: "A trip is already running for this handoff.",
  trip_not_active: "This trip has already ended.",
  handoff_missing: "There's no agreed time for this handoff yet.",
  handoff_completed: "This handoff is already done.",
  drop_off_not_completed: "The drop-off has to be done first.",
  invalid_status: "This booking has changed. Reopen it to see the latest.",
  not_allowed: "You can't change this trip.",
  invalid_position: "Your location couldn't be read. Try again.",
};

export class TransitError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: string | undefined, fallback: string): never {
  throw new TransitError(code ?? "unknown", (code && MESSAGES[code]) || fallback);
}

/** Start trip. A first position (optional) lets the other person's notice say when to expect you; `share = false` starts it without any position. */
export async function startTrip(
  bookingId: string,
  kind: HandoffKind,
  simulated: boolean,
  first?: LatLng,
  share = true,
): Promise<Trip> {
  const { data, error } = await getSupabase().rpc("start_trip", {
    p_booking: bookingId,
    p_kind: kind,
    p_simulated: simulated,
    p_lat: first?.lat ?? null,
    p_lng: first?.lng ?? null,
    p_share: share,
  });
  if (error || !data) fail(error?.message, "Couldn't start the trip. Try again.");
  return data as Trip;
}

/** Send the traveller's position; the answer is the trip row, so `status` says whether they have arrived. */
export async function updateTripPosition(tripId: string, position: LatLng): Promise<Trip> {
  const { data, error } = await getSupabase().rpc("update_trip_position", {
    p_trip: tripId,
    p_lat: position.lat,
    p_lng: position.lng,
  });
  if (error || !data) fail(error?.message, "Couldn't send your location.");
  return data as Trip;
}

/** End the trip (or cancel it). The position is erased on the server. */
export async function endTrip(tripId: string, cancel = false): Promise<Trip> {
  const { data, error } = await getSupabase().rpc("end_trip", { p_trip: tripId, p_cancel: cancel });
  if (error || !data) fail(error?.message, "Couldn't end the trip. Try again.");
  return data as Trip;
}

export type GeocodeResult = { found: true; point: LatLng; label: string | null } | { found: false };

/**
 * Address → a point on the map (OpenStreetMap through our server). Never throws: a lookup that is down reads the
 * same as an address that wasn't found, because the app can always fall back to "Use my current location".
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  try {
    const result = await apiPost<{ found: boolean; lat: number | null; lng: number | null; label: string | null }>(
      "/api/geo/geocode",
      { address },
    );
    if (result.found && result.lat != null && result.lng != null) {
      return { found: true, point: { lat: result.lat, lng: result.lng }, label: result.label };
    }
  } catch {
    // fall through
  }
  return { found: false };
}

/** The trips of one booking, newest first (the two parties can read them — RLS). */
export async function listTrips(bookingId: string): Promise<Trip[]> {
  const { data, error } = await getSupabase()
    .from("trips")
    .select("*")
    .eq("booking_id", bookingId)
    .order("started_at", { ascending: false });
  if (error) throw new Error("Couldn't load the trip. Check your connection and try again.");
  return (data ?? []) as Trip[];
}

/** Every trip of mine that is running right now (on the way, or arrived and not yet handed over). */
export async function listActiveTrips(): Promise<Trip[]> {
  const { data, error } = await getSupabase()
    .from("trips")
    .select("*")
    .in("status", ["en_route", "arrived"])
    .order("started_at", { ascending: false });
  if (error) throw new Error("Couldn't load your trips.");
  return (data ?? []) as Trip[];
}

/** First names for the trips on screen (the traveller may be the other person). */
export async function loadNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await getSupabase().from("profiles").select("id, display_name").in("id", ids);
  return Object.fromEntries(((data ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
}

/** My own home point, where a simulated drive starts. Null until I have one. */
export async function getMyHomePoint(userId: string, role: "owner" | "sitter"): Promise<LatLng | null> {
  const supabase = getSupabase();
  const row =
    role === "owner"
      ? (await supabase.from("owner_profiles").select("home_lat, home_lng").eq("id", userId).maybeSingle()).data
      : (await supabase.rpc("get_my_sitter_profile").maybeSingle()).data;
  const point = row as { home_lat: number | null; home_lng: number | null } | null;
  return point?.home_lat != null && point.home_lng != null ? { lat: point.home_lat, lng: point.home_lng } : null;
}

export const livePosition = (trip: Trip): LatLng | null =>
  trip.last_lat != null && trip.last_lng != null ? { lat: trip.last_lat, lng: trip.last_lng } : null;

export const destination = (trip: Trip): LatLng | null =>
  trip.dest_lat != null && trip.dest_lng != null ? { lat: trip.dest_lat, lng: trip.dest_lng } : null;

export const isLive = (trip: Trip) => trip.status === "en_route" || trip.status === "arrived";

/** "3.2 km" / "850 m". */
export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(meters / 10) * 10)} m`;
}
