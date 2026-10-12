import type { BookingSummary, Handoff, HandoffKind, LocationType } from "../../lib/bookings";

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
