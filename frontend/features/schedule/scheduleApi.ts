import { getSupabase } from "../../lib/supabase";
import { addDays, shortTime } from "./dates";

export type CareSlot = "morning" | "afternoon" | "overnight";

export const SLOTS: { slot: CareSlot; label: string; short: string }[] = [
  { slot: "morning", label: "Morning", short: "M" },
  { slot: "afternoon", label: "Afternoon", short: "A" },
  { slot: "overnight", label: "Overnight", short: "N" },
];

export type SlotState = "open" | "full" | "blocked" | "closed";

/** One day × slot as the sitter sees it: own hours, spots, how many are booked. */
export type DaySlot = {
  day: string;
  slot: CareSlot;
  state: SlotState;
  startsAt: string | null;
  endsAt: string | null;
  /** Sitter's own view only (from their availability rows); null for owners. */
  capacity: number | null;
  booked: number;
  /** Spots still free for more pets (owners see this, never who booked). */
  remaining: number;
};

type ScheduleRpcRow = {
  day: string;
  slot: CareSlot;
  starts_at: string | null;
  ends_at: string | null;
  state: SlotState;
  remaining: number;
};

/** `sitter_availability` row (phase-02). For a day × slot the newest open row wins; any blocked row closes it. */
type AvailabilityRow = {
  id: string;
  kind: "open" | "blocked";
  start_date: string;
  end_date: string;
  slot: CareSlot;
  starts_at: string | null;
  ends_at: string | null;
  max_pets: number | null;
  note: string | null;
  created_at: string;
};

export type SitterDefaults = {
  hours: Record<CareSlot, [string, string]>;
  maxPets: number;
};

export type MonthSchedule = {
  /** `${day}:${slot}` → state */
  slots: Map<string, DaySlot>;
  rows: AvailabilityRow[];
};

export type OpenSlotInput = { slot: CareSlot; startsAt: string; endsAt: string };

/** Confirmed bookings a schedule change would push over capacity (trigger detail = ids). */
export class OverlapError extends Error {
  constructor(readonly bookingIds: string[]) {
    super("overlaps_confirmed_booking");
  }
}

export type OverlappingBooking = { id: string; ownerName: string; startDate: string; endDate: string };

const ROW_COLUMNS = "id, kind, start_date, end_date, slot, starts_at, ends_at, max_pets, note, created_at";
const FALLBACK_HOURS: Record<CareSlot, [string, string]> = {
  morning: ["08:00", "12:00"],
  afternoon: ["12:00", "18:00"],
  overnight: ["18:00", "08:00"],
};

function fail(action: string): never {
  throw new Error(`Couldn't ${action}. Check your connection and try again.`);
}

export function slotKey(day: string, slot: CareSlot): string {
  return `${day}:${slot}`;
}

/** Raise OverlapError for the capacity guard, a plain message otherwise. */
function throwSaveError(error: { message: string; details?: string | null }): never {
  if (error.message === "overlaps_confirmed_booking") {
    const ids = (error.details ?? "").split(",").map((id) => id.trim()).filter(Boolean);
    throw new OverlapError(ids);
  }
  fail("save your schedule");
}

/** Default hours and spots from the sitter's profile, for slots they have not opened yet. */
export async function loadSitterDefaults(): Promise<SitterDefaults> {
  const { data, error } = await getSupabase().rpc("get_my_sitter_profile").maybeSingle();
  if (error || !data) fail("load your profile");
  const row = data as { default_hours?: Record<string, string[]> | null; default_max_pets?: number | null };
  const hours = { ...FALLBACK_HOURS };
  for (const { slot } of SLOTS) {
    const value = row.default_hours?.[slot];
    if (Array.isArray(value) && value.length === 2) hours[slot] = [value[0], value[1]];
  }
  return { hours, maxPets: row.default_max_pets ?? 2 };
}

function newestOpenRow(rows: AvailabilityRow[], day: string, slot: CareSlot): AvailabilityRow | undefined {
  return rows
    .filter((r) => r.kind === "open" && r.slot === slot && r.start_date <= day && day <= r.end_date)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
}

/**
 * The sitter's month: states and remaining spots from get_sitter_schedule (counts confirmed
 * bookings), capacity from their own availability rows (RLS: own rows only).
 */
export async function loadMonthSchedule(sitterId: string, from: string, to: string): Promise<MonthSchedule> {
  const supabase = getSupabase();
  const [schedule, availability] = await Promise.all([
    supabase.rpc("get_sitter_schedule", { p_sitter: sitterId, p_from: from, p_to: to }),
    supabase
      .from("sitter_availability")
      .select(ROW_COLUMNS)
      .eq("sitter_id", sitterId)
      .lte("start_date", to)
      .gte("end_date", from),
  ]);
  if (schedule.error || availability.error) fail("load your schedule");

  const rows = (availability.data ?? []) as AvailabilityRow[];
  const slots = new Map<string, DaySlot>();
  for (const item of (schedule.data ?? []) as ScheduleRpcRow[]) {
    const open = newestOpenRow(rows, item.day, item.slot);
    const capacity = open?.max_pets ?? null;
    slots.set(slotKey(item.day, item.slot), {
      day: item.day,
      slot: item.slot,
      state: item.state,
      startsAt: item.starts_at ? shortTime(item.starts_at) : null,
      endsAt: item.ends_at ? shortTime(item.ends_at) : null,
      capacity,
      booked: item.state === "open" || item.state === "full" ? Math.max((capacity ?? 0) - item.remaining, 0) : 0,
      remaining: item.remaining,
    });
  }
  return { slots, rows };
}

/**
 * A sitter's month as an owner sees it (3B.2): hours, open / full / closed and spots left.
 * Blocked shows as closed — why a day is closed is the sitter's business.
 */
export async function loadSitterMonth(sitterId: string, from: string, to: string): Promise<Map<string, DaySlot>> {
  const { data, error } = await getSupabase().rpc("get_sitter_schedule", {
    p_sitter: sitterId,
    p_from: from,
    p_to: to,
  });
  if (error) fail("load this sitter's schedule");
  const slots = new Map<string, DaySlot>();
  for (const item of (data ?? []) as ScheduleRpcRow[]) {
    const state: SlotState = item.state === "blocked" ? "closed" : item.state;
    const open = state === "open" || state === "full";
    slots.set(slotKey(item.day, item.slot), {
      day: item.day,
      slot: item.slot,
      state,
      startsAt: open && item.starts_at ? shortTime(item.starts_at) : null,
      endsAt: open && item.ends_at ? shortTime(item.ends_at) : null,
      capacity: null,
      booked: 0,
      remaining: open ? item.remaining : 0,
    });
  }
  return slots;
}

/**
 * Open slots for [from, to]: a new open row per slot (the newest row sets hours and spots),
 * then lift any block on those days — a block that reaches outside the range is split so
 * the other days stay blocked. Open rows go first: if they fail the capacity guard,
 * nothing else has changed.
 */
export async function saveOpen(
  sitterId: string,
  rows: AvailabilityRow[],
  from: string,
  to: string,
  slots: OpenSlotInput[],
  maxPets: number,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("sitter_availability").insert(
    slots.map((s) => ({
      sitter_id: sitterId,
      kind: "open",
      start_date: from,
      end_date: to,
      slot: s.slot,
      starts_at: s.startsAt,
      ends_at: s.endsAt,
      max_pets: maxPets,
    })),
  );
  if (error) throwSaveError(error);

  const chosen = new Set(slots.map((s) => s.slot));
  const blocks = rows.filter(
    (r) => r.kind === "blocked" && chosen.has(r.slot) && r.start_date <= to && from <= r.end_date,
  );
  if (blocks.length === 0) return;

  const remainders = blocks.flatMap((r) => {
    const parts = [];
    if (r.start_date < from) parts.push({ start_date: r.start_date, end_date: addDays(from, -1) });
    if (r.end_date > to) parts.push({ start_date: addDays(to, 1), end_date: r.end_date });
    return parts.map((p) => ({ sitter_id: sitterId, kind: "blocked", slot: r.slot, note: r.note, ...p }));
  });
  if (remainders.length > 0) {
    const { error: splitError } = await supabase.from("sitter_availability").insert(remainders);
    if (splitError) throwSaveError(splitError);
  }
  const { error: deleteError } = await supabase
    .from("sitter_availability")
    .delete()
    .in("id", blocks.map((r) => r.id));
  if (deleteError) throwSaveError(deleteError);
}

/** Block slots for [from, to]. Fails with OverlapError when a confirmed booking is there. */
export async function saveBlock(sitterId: string, from: string, to: string, slots: CareSlot[]): Promise<void> {
  const { error } = await getSupabase()
    .from("sitter_availability")
    .insert(slots.map((slot) => ({ sitter_id: sitterId, kind: "blocked", start_date: from, end_date: to, slot })));
  if (error) throwSaveError(error);
}

/** Owner names and dates of the bookings in an OverlapError, for the cancel prompt. */
export async function loadOverlappingBookings(ids: string[]): Promise<OverlappingBooking[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("bookings")
    .select("id, start_date, end_date, owner:profiles!bookings_owner_id_fkey(display_name)")
    .in("id", ids);
  if (error) fail("load the bookings on those days");
  return ((data ?? []) as unknown as {
    id: string;
    start_date: string;
    end_date: string;
    owner: { display_name: string } | null;
  }[]).map((b) => ({
    id: b.id,
    ownerName: b.owner?.display_name ?? "An owner",
    startDate: b.start_date,
    endDate: b.end_date,
  }));
}
