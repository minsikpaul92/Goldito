import { getSupabase } from "./supabase";
import type { ServiceType } from "../features/sitters/sitterApi";

/**
 * Booking RPC wrappers (phase-03b). RPCs raise the error code as the message —
 * full list in supabase/README.md "RPC errors"; each screen adds the copy it needs.
 */

const MESSAGES: Record<string, string> = {
  booking_in_progress: "The pets are already with you — change the pick-up time instead.",
  invalid_status: "This booking has already changed. Reopen it to see the latest.",
  not_allowed: "You can't change this booking.",
  invalid_window: "Pick a drop-off in the future and a pick-up after it.",
  location_note_required: "Tell the sitter where to meet.",
  service_not_offered: "This sitter doesn't offer that service.",
};

export function bookingErrorMessage(code: string | undefined, fallback: string): string {
  return (code && MESSAGES[code]) || fallback;
}

/** Error with the RPC code kept, so a screen can add its own copy (e.g. a pet's name). */
export class BookingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Owner or sitter, before the drop-off (3B.7). The other side gets `booking_cancelled`. */
export async function cancelBooking(bookingId: string, reason: string | null): Promise<void> {
  const { error } = await getSupabase().rpc("cancel_booking", { p_booking: bookingId, p_reason: reason });
  if (error) {
    throw new Error(bookingErrorMessage(error.message, "Couldn't cancel this booking. Try again."));
  }
}

// ---------------------------------------------------------------------------
// Book care (3B.3)
// ---------------------------------------------------------------------------

/** Handoff place = transport mode (D28): sitter_home = Owner drives, owner_home = Sitter drives. */
export type LocationType = "sitter_home" | "owner_home" | "other";

export type HandoffInput = { at: string; locationType: LocationType; note: string | null };

/** One row of search_sitters: how much of the trip a sitter covers and whether times fit their hours. */
export type SitterMatch = {
  sitterId: string;
  displayName: string;
  bio: string | null;
  serviceArea: string | null;
  experienceYears: number | null;
  services: ServiceType[];
  isMySitter: boolean;
  coveredSlots: number;
  totalSlots: number;
  dropOffWithinHours: boolean;
  pickUpWithinHours: boolean;
};

export function coversWholeTrip(m: SitterMatch): boolean {
  return m.totalSlots > 0 && m.coveredSlots === m.totalSlots;
}

/** Sitters with room for at least part of [dropOffAt, pickUpAt), whole-trip and your sitters first. */
export async function searchSitters(dropOffAt: string, pickUpAt: string, petCount: number): Promise<SitterMatch[]> {
  const { data, error } = await getSupabase().rpc("search_sitters", {
    p_drop_off_at: dropOffAt,
    p_pick_up_at: pickUpAt,
    p_pet_count: petCount,
  });
  if (error) {
    throw new BookingError(error.message, bookingErrorMessage(error.message, "Couldn't search sitters. Try again."));
  }
  return ((data ?? []) as {
    sitter_id: string;
    display_name: string;
    bio: string | null;
    service_area: string | null;
    experience_years: number | null;
    services: ServiceType[] | null;
    is_my_sitter: boolean;
    covered_slots: number;
    total_slots: number;
    drop_off_within_hours: boolean;
    pick_up_within_hours: boolean;
  }[]).map((r) => ({
    sitterId: r.sitter_id,
    displayName: r.display_name,
    bio: r.bio,
    serviceArea: r.service_area,
    experienceYears: r.experience_years,
    services: r.services ?? ["boarding"],
    isMySitter: r.is_my_sitter,
    coveredSlots: r.covered_slots,
    totalSlots: r.total_slots,
    dropOffWithinHours: r.drop_off_within_hours,
    pickUpWithinHours: r.pick_up_within_hours,
  }));
}

export type BookingRequest = {
  sitterId: string;
  petIds: string[];
  dropOff: HandoffInput;
  pickUp: HandoffInput;
  note: string | null;
  serviceType?: ServiceType;
  rebookedFrom?: string | null;
};

/** request_booking → booking + two proposed handoffs + `booking_requested` for the sitter. */
export async function requestBooking(input: BookingRequest): Promise<string> {
  const { data, error } = await getSupabase().rpc("request_booking", {
    p_sitter: input.sitterId,
    p_pets: input.petIds,
    p_drop_off_at: input.dropOff.at,
    p_drop_off_location_type: input.dropOff.locationType,
    p_drop_off_note: input.dropOff.note,
    p_pick_up_at: input.pickUp.at,
    p_pick_up_location_type: input.pickUp.locationType,
    p_pick_up_note: input.pickUp.note,
    p_note: input.note,
    p_rebooked_from: input.rebookedFrom ?? null,
    p_service_type: input.serviceType ?? "boarding",
  });
  if (error) {
    throw new BookingError(error.message, bookingErrorMessage(error.message, "Couldn't send the request. Try again."));
  }
  return data as string;
}

// ---------------------------------------------------------------------------
// Owner booking list (3B.3; detail screen in 3B.5)
// ---------------------------------------------------------------------------

export type BookingStatus = "requested" | "confirmed" | "declined" | "cancelled";

type HandoffRow = {
  kind: "drop_off" | "pick_up";
  scheduled_at: string;
  location_type: LocationType;
  location_note: string | null;
  status: "proposed" | "agreed" | "rejected" | "superseded";
  proposed_by: string;
};

export type Handoff = { at: string; locationType: LocationType; note: string | null; proposedBy: string };

export type OwnerBooking = {
  id: string;
  status: BookingStatus;
  sitterId: string;
  sitterName: string;
  serviceType: ServiceType;
  pets: { name: string; species: "dog" | "cat" }[];
  dropOff: Handoff | null;
  pickUp: Handoff | null;
  /** The sitter suggested another time and is waiting for the owner. */
  sitterSuggested: boolean;
  createdAt: string;
};

/** Same rule as current_handoff (003): confirmed → agreed; requested → pending proposal, else agreed. */
function currentHandoff(rows: HandoffRow[], kind: HandoffRow["kind"], status: BookingStatus): Handoff | null {
  const ofKind = rows.filter((h) => h.kind === kind);
  const pick =
    (status === "requested" ? ofKind.find((h) => h.status === "proposed") : undefined) ??
    ofKind.find((h) => h.status === "agreed") ??
    // Ended bookings keep their last proposal for the card.
    ofKind.find((h) => h.status === "superseded" || h.status === "rejected");
  return pick
    ? { at: pick.scheduled_at, locationType: pick.location_type, note: pick.location_note, proposedBy: pick.proposed_by }
    : null;
}

export async function listOwnerBookings(ownerId: string): Promise<OwnerBooking[]> {
  const { data, error } = await getSupabase()
    .from("bookings")
    .select(
      "id, status, sitter_id, service_type, created_at, " +
        "sitter:profiles!bookings_sitter_id_fkey(display_name), " +
        "booking_handoffs(kind, scheduled_at, location_type, location_note, status, proposed_by), " +
        "booking_pets(pets(name, species))",
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load your bookings. Check your connection and try again.");

  return ((data ?? []) as unknown as {
    id: string;
    status: BookingStatus;
    sitter_id: string;
    service_type: ServiceType | null;
    created_at: string;
    sitter: { display_name: string } | null;
    booking_handoffs: HandoffRow[] | null;
    booking_pets: { pets: { name: string; species: "dog" | "cat" } | null }[] | null;
  }[])
    .map((b) => {
      const handoffs = b.booking_handoffs ?? [];
      return {
        id: b.id,
        status: b.status,
        sitterId: b.sitter_id,
        sitterName: b.sitter?.display_name ?? "Your sitter",
        serviceType: b.service_type ?? "boarding",
        pets: (b.booking_pets ?? []).flatMap((bp) => (bp.pets ? [bp.pets] : [])),
        dropOff: currentHandoff(handoffs, "drop_off", b.status),
        pickUp: currentHandoff(handoffs, "pick_up", b.status),
        sitterSuggested:
          b.status === "requested" && handoffs.some((h) => h.status === "proposed" && h.proposed_by === b.sitter_id),
        createdAt: b.created_at,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
