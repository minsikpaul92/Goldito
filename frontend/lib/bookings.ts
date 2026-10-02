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
    /** RPC error detail, e.g. "2026-10-05 morning, …" for sitter_unavailable. */
    readonly detail: string | null = null,
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
// Booking lists and details (owner 3B.3, sitter 3B.4)
// ---------------------------------------------------------------------------

export type BookingStatus = "requested" | "confirmed" | "declined" | "cancelled";

export type MeetGreetStatus =
  | "not_needed"
  | "required"
  | "proposed"
  | "agreed"
  | "done"
  | "skip_requested"
  | "skipped";

type HandoffRow = {
  id: string;
  kind: "drop_off" | "pick_up";
  scheduled_at: string;
  location_type: LocationType;
  location_note: string | null;
  within_sitter_hours: boolean;
  status: "proposed" | "agreed" | "rejected" | "superseded";
  proposed_by: string;
  completed_at: string | null;
  created_at: string;
};

export type HandoffKind = HandoffRow["kind"];

/** One offer in the back-and-forth for a handoff, oldest first (3B.5 history line). */
export type ProposalStep = {
  id: string;
  at: string;
  locationType: LocationType;
  note: string | null;
  proposedBy: string;
  status: HandoffRow["status"];
};

export type Handoff = {
  id: string;
  at: string;
  locationType: LocationType;
  note: string | null;
  proposedBy: string;
  withinSitterHours: boolean;
  /** Still waiting for the other side's OK. */
  pending: boolean;
  completedAt: string | null;
};

export type BookingSummary = {
  id: string;
  status: BookingStatus;
  ownerId: string;
  ownerName: string;
  sitterId: string;
  sitterName: string;
  serviceType: ServiceType;
  meetGreetStatus: MeetGreetStatus;
  pets: { id?: string; name: string; species: "dog" | "cat" }[];
  dropOff: Handoff | null;
  pickUp: Handoff | null;
  /** The sitter suggested another time and is waiting for the owner. */
  sitterSuggested: boolean;
  /** Every offer per handoff, oldest first. */
  history: Record<HandoffKind, ProposalStep[]>;
  /** The open offer per handoff (waiting for someone's OK), if any. */
  pending: Record<HandoffKind, ProposalStep | null>;
  createdAt: string;
};

export type OwnerBooking = BookingSummary;

/** "You: 7:00 AM → Lucy: 8:30 AM → You: 8:00 AM" for a handoff with more than one offer. */
export function historyLine(b: BookingSummary, kind: HandoffKind, me: string, format: (iso: string) => string): string | null {
  const steps = b.history[kind];
  if (steps.length < 2) return null;
  return steps
    .map((s) => `${s.proposedBy === me ? "You" : s.proposedBy === b.ownerId ? b.ownerName : b.sitterName}: ${format(s.at)}`)
    .join(" → ");
}

/** My newest offer for a confirmed booking was declined, so the agreed time stayed. */
export function declinedChange(b: BookingSummary, kind: HandoffKind, me: string): boolean {
  const last = b.history[kind][b.history[kind].length - 1];
  return b.status === "confirmed" && !!last && last.proposedBy === me && last.status === "rejected";
}

/** Accept works only once a first-time pair met or both agreed to skip (D44, 004). */
export function meetGreetBlocksAccept(b: BookingSummary): boolean {
  return !["not_needed", "done", "skipped"].includes(b.meetGreetStatus);
}

/** Same rule as current_handoff (003): confirmed → agreed; requested → pending proposal, else agreed. */
function currentHandoff(rows: HandoffRow[], kind: HandoffRow["kind"], status: BookingStatus): Handoff | null {
  const ofKind = rows.filter((h) => h.kind === kind);
  const pick =
    (status === "requested" ? ofKind.find((h) => h.status === "proposed") : undefined) ??
    ofKind.find((h) => h.status === "agreed") ??
    // Ended bookings keep their last proposal for the card.
    ofKind.find((h) => h.status === "superseded" || h.status === "rejected");
  return pick
    ? {
        id: pick.id,
        at: pick.scheduled_at,
        locationType: pick.location_type,
        note: pick.location_note,
        proposedBy: pick.proposed_by,
        withinSitterHours: pick.within_sitter_hours,
        pending: pick.status === "proposed",
        completedAt: pick.completed_at,
      }
    : null;
}

const BOOKING_COLUMNS =
  "id, status, owner_id, sitter_id, service_type, meet_greet_status, created_at, " +
  "owner:profiles!bookings_owner_id_fkey(display_name), " +
  "sitter:profiles!bookings_sitter_id_fkey(display_name), " +
  "booking_handoffs(id, kind, scheduled_at, location_type, location_note, within_sitter_hours, status, proposed_by, " +
  "completed_at, created_at)";

type BookingRow = {
  id: string;
  status: BookingStatus;
  owner_id: string;
  sitter_id: string;
  service_type: ServiceType | null;
  meet_greet_status: MeetGreetStatus | null;
  created_at: string;
  owner: { display_name: string } | null;
  sitter: { display_name: string } | null;
  booking_handoffs: HandoffRow[] | null;
  booking_pets?: { pets: { name: string; species: "dog" | "cat" } | null }[] | null;
};

function toStep(h: HandoffRow): ProposalStep {
  return {
    id: h.id,
    at: h.scheduled_at,
    locationType: h.location_type,
    note: h.location_note,
    proposedBy: h.proposed_by,
    status: h.status,
  };
}

function toSummary(b: BookingRow, pets: BookingSummary["pets"]): BookingSummary {
  const handoffs = [...(b.booking_handoffs ?? [])].sort((x, y) => x.created_at.localeCompare(y.created_at));
  const steps = (kind: HandoffKind) => handoffs.filter((h) => h.kind === kind).map(toStep);
  const open = (kind: HandoffKind) =>
    b.status === "requested" || b.status === "confirmed"
      ? (steps(kind).find((s) => s.status === "proposed") ?? null)
      : null;
  return {
    id: b.id,
    status: b.status,
    ownerId: b.owner_id,
    ownerName: b.owner?.display_name ?? "The owner",
    sitterId: b.sitter_id,
    sitterName: b.sitter?.display_name ?? "Your sitter",
    serviceType: b.service_type ?? "boarding",
    meetGreetStatus: b.meet_greet_status ?? "not_needed",
    pets,
    dropOff: currentHandoff(handoffs, "drop_off", b.status),
    pickUp: currentHandoff(handoffs, "pick_up", b.status),
    sitterSuggested:
      b.status === "requested" && handoffs.some((h) => h.status === "proposed" && h.proposed_by === b.sitter_id),
    history: { drop_off: steps("drop_off"), pick_up: steps("pick_up") },
    pending: { drop_off: open("drop_off"), pick_up: open("pick_up") },
    createdAt: b.created_at,
  };
}

function newestFirst(a: BookingSummary, b: BookingSummary): number {
  return b.createdAt.localeCompare(a.createdAt);
}

export async function listOwnerBookings(ownerId: string): Promise<OwnerBooking[]> {
  const { data, error } = await getSupabase()
    .from("bookings")
    .select(`${BOOKING_COLUMNS}, booking_pets(pets(name, species))`)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load your bookings. Check your connection and try again.");
  return ((data ?? []) as unknown as BookingRow[])
    .map((b) => toSummary(b, (b.booking_pets ?? []).flatMap((bp) => (bp.pets ? [bp.pets] : []))))
    .sort(newestFirst);
}

/**
 * Pet cards for a booking via get_booking_pets — pets RLS hides a pet from the sitter once
 * the booking has ended, the RPC does not (003).
 */
export async function getBookingPets(bookingId: string): Promise<BookingSummary["pets"]> {
  const { data, error } = await getSupabase().rpc("get_booking_pets", { p_booking: bookingId });
  if (error) throw new Error("Couldn't load the pets on this booking.");
  return ((data ?? []) as { pet_id: string; name: string; species: "dog" | "cat" }[]).map((p) => ({
    id: p.pet_id,
    name: p.name,
    species: p.species,
  }));
}

export async function listSitterBookings(sitterId: string): Promise<BookingSummary[]> {
  const { data, error } = await getSupabase()
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("sitter_id", sitterId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load your bookings. Check your connection and try again.");
  const rows = (data ?? []) as unknown as BookingRow[];
  const pets = await Promise.all(rows.map((b) => getBookingPets(b.id)));
  return rows.map((b, i) => toSummary(b, pets[i])).sort(newestFirst);
}

export async function getBooking(bookingId: string): Promise<BookingSummary | null> {
  const { data, error } = await getSupabase().from("bookings").select(BOOKING_COLUMNS).eq("id", bookingId).maybeSingle();
  if (error) throw new Error("Couldn't load this booking. Check your connection and try again.");
  if (!data) return null;
  return toSummary(data as unknown as BookingRow, await getBookingPets(bookingId));
}

/** Requests · Upcoming · Past for the sitter's Bookings tab. */
export function sitterBucket(b: BookingSummary): "requests" | "upcoming" | "past" {
  if (b.status === "requested") return "requests";
  if (b.status === "confirmed" && !b.pickUp?.completedAt) return "upcoming";
  return "past";
}

// ---------------------------------------------------------------------------
// Sitter actions (3B.4)
// ---------------------------------------------------------------------------

/** respond_booking — Accept also accepts the owner's pending times; Decline ends the request. */
export async function respondBooking(bookingId: string, accept: boolean): Promise<void> {
  const { error } = await getSupabase().rpc("respond_booking", { p_booking: bookingId, p_accept: accept, p_note: null });
  if (error) {
    throw new BookingError(
      error.message,
      bookingErrorMessage(error.message, "Couldn't answer this request. Try again."),
      error.details ?? null,
    );
  }
}

/**
 * propose_handoff — a new time (and optionally a new place) for one handoff. Without
 * `place` the place stays as it is (p_location_type omitted, 003).
 */
export async function proposeHandoff(
  bookingId: string,
  kind: HandoffKind,
  at: string,
  place?: { locationType: LocationType; note: string | null },
): Promise<void> {
  const args: Record<string, unknown> = { p_booking: bookingId, p_kind: kind, p_at: at };
  if (place) {
    args.p_location_type = place.locationType;
    args.p_note = place.note;
  }
  const { error } = await getSupabase().rpc("propose_handoff", args);
  if (error) {
    throw new BookingError(
      error.message,
      bookingErrorMessage(error.message, "Couldn't send the new time. Try again."),
      error.details ?? null,
    );
  }
}

/**
 * respond_handoff — answer the other side's offer. Declining before the booking is
 * confirmed ends the request (owner → cancelled, sitter → declined); after it, the agreed
 * time stays (003).
 */
export async function respondHandoff(handoffId: string, accept: boolean): Promise<void> {
  const { error } = await getSupabase().rpc("respond_handoff", { p_handoff: handoffId, p_accept: accept });
  if (error) {
    throw new BookingError(
      error.message,
      bookingErrorMessage(error.message, "Couldn't answer this change. Try again."),
      error.details ?? null,
    );
  }
}

/** Real addresses for a confirmed booking, until 24 h after pick-up (get_handoff_details, 003). */
export async function getHandoffAddresses(bookingId: string): Promise<Partial<Record<HandoffKind, string>>> {
  const { data, error } = await getSupabase().rpc("get_handoff_details", { p_booking: bookingId });
  if (error) return {};
  const out: Partial<Record<HandoffKind, string>> = {};
  for (const row of (data ?? []) as { kind: HandoffKind; address: string | null }[]) {
    if (row.address) out[row.kind] = row.address;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pet details for the requested / booked sitter (pets RLS: can_view_pet_profile)
// ---------------------------------------------------------------------------

export type PetCare = {
  id: string;
  name: string;
  species: "dog" | "cat";
  breed: string | null;
  notes: string | null;
  allergies: string[];
  tasks: { id: string; title: string; type: string; time: string; dose: string | null }[];
};

export async function loadPetCare(petIds: string[]): Promise<PetCare[]> {
  if (petIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("pets")
    .select(
      "id, name, species, breed, notes, pet_allergies(allergen), care_tasks(id, title, type, scheduled_time, dose, active)",
    )
    .in("id", petIds);
  if (error) throw new Error("Couldn't load the pet profiles.");
  return ((data ?? []) as unknown as {
    id: string;
    name: string;
    species: "dog" | "cat";
    breed: string | null;
    notes: string | null;
    pet_allergies: { allergen: string }[] | null;
    care_tasks:
      | { id: string; title: string; type: string; scheduled_time: string; dose: string | null; active: boolean }[]
      | null;
  }[])
    .map((p) => ({
      id: p.id,
      name: p.name,
      species: p.species,
      breed: p.breed,
      notes: p.notes,
      allergies: (p.pet_allergies ?? []).map((a) => a.allergen),
      tasks: (p.care_tasks ?? [])
        .filter((t) => t.active)
        .map((t) => ({ id: t.id, title: t.title, type: t.type, time: t.scheduled_time.slice(0, 5), dose: t.dose }))
        .sort((a, b) => a.time.localeCompare(b.time)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

