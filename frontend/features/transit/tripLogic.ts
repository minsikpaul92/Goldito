import type { BookingSummary, Handoff, HandoffKind, LocationType } from "../../lib/bookings";
import type { LatLng } from "../../lib/location";
import type { PlaceQuery } from "../../lib/maps";

/** The Start trip button opens this long before the agreed time (start_trip, 012) — same window as Received. */
export const START_WINDOW_MS = 2 * 60 * 60 * 1000;

export type Role = "owner" | "sitter";

/** D28: at the sitter's home the owner drives, at the owner's home the sitter drives, anywhere else either may. */
export function canTravel(role: Role, place: LocationType): boolean {
  if (place === "sitter_home") return role === "owner";
  if (place === "owner_home") return role === "sitter";
  return true;
}

/** The handoff that is next: the drop-off until Received, then the pick-up until Returned. */
export function nextHandoff(booking: BookingSummary): { kind: HandoffKind; handoff: Handoff } | null {
  if (booking.status !== "confirmed") return null;
  if (booking.dropOff && !booking.dropOff.pending && !booking.dropOff.completedAt) return { kind: "drop_off", handoff: booking.dropOff };
  if (booking.dropOff?.completedAt && booking.pickUp && !booking.pickUp.pending && !booking.pickUp.completedAt) {
    return { kind: "pick_up", handoff: booking.pickUp };
  }
  return null;
}

/** When Start trip opens for a handoff (ms since the epoch). */
export const startOpensAt = (handoff: Handoff): number => Date.parse(handoff.at) - START_WINDOW_MS;

/**
 * What Google Maps is asked to open: the address the person can already see (or the place written for "somewhere
 * else"), and only without any text the point itself. Never an entry code.
 */
export function placeFor(handoff: Handoff | null | undefined, address: string | null | undefined, point: LatLng | null): PlaceQuery {
  return { text: address ?? (handoff?.locationType === "other" ? handoff.note : null) ?? null, point };
}

/** The "about N min away" line shows from this far out (5 minutes before the ETA). */
export const NEAR_MINUTES = 5;

/** Whole minutes until the ETA when the traveller is within NEAR_MINUTES of it, else null. Past the ETA still counts as 0. */
export function minutesAway(etaAt: string | null, now: number): number | null {
  if (!etaAt) return null;
  const mins = Math.max(0, Math.ceil((Date.parse(etaAt) - now) / 60_000));
  return mins <= NEAR_MINUTES ? mins : null;
}

/** The one-tap hello after an arrival: the owner leaves the pets, the sitter answers; the same pair again at pick-up. */
export function greetingFor(kind: HandoffKind, role: Role): string {
  if (kind === "drop_off") return role === "owner" ? "Please take care of them" : "We will";
  return role === "owner" ? "Thank you for everything" : "It was a pleasure";
}

/** Start trip is possible now: paid, the next handoff is mine to travel to, and the 2-hour window is open. */
export function canStartTripNow(booking: BookingSummary, role: Role, now: number = Date.now()): boolean {
  const next = nextHandoff(booking);
  return !!booking.paidAt && !!next && canTravel(role, next.handoff.locationType) && now >= startOpensAt(next.handoff);
}
