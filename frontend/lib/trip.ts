import type { HandoffDraft } from "../components/HandoffPicker";
import { addDays, appToday, isoToZoned, timeToMinutes, zonedToIso } from "../features/schedule/dates";

export const MAX_TRIP_DAYS = 31;

type When = { day: string; time: string };

/** Why a trip (pets + drop-off + pick-up) can't be sent yet, or null. A past drop-off and a reversed order say different things (#364). */
export function tripProblem(petIds: string[], dropOff: HandoffDraft, pickUp: HandoffDraft, now: number = Date.now()): string | null {
  if (petIds.length === 0) return "Pick at least one pet.";
  const drop = Date.parse(zonedToIso(dropOff.day, dropOff.time));
  const pick = Date.parse(zonedToIso(pickUp.day, pickUp.time));
  if (drop <= now) return "Drop-off time has passed.";
  if (pick <= drop) return "Pick-up must be after drop-off.";
  if (pick - drop > MAX_TRIP_DAYS * 86_400_000) return `A trip can be up to ${MAX_TRIP_DAYS} days.`;
  return null;
}

/** The next whole hour from now in the app timezone; after 11 PM, tomorrow at 9 AM. */
export function nextSlot(now: Date = new Date()): When {
  const { day, time } = isoToZoned(now.toISOString());
  const hour = Math.floor(timeToMinutes(time) / 60) + 1;
  if (hour >= 24) return { day: addDays(day, 1), time: "09:00" };
  return { day, time: `${String(hour).padStart(2, "0")}:00` };
}

/**
 * A stay whose drop-off has passed moves to the next slot (#364); the pick-up keeps the stay's length when it would no
 * longer come after the drop-off. `moved` says whether anything changed.
 */
export function freshStay(drop: When, pick: When, now: Date = new Date()): { drop: When; pick: When; moved: boolean } {
  const dropAt = Date.parse(zonedToIso(drop.day, drop.time));
  if (dropAt > now.getTime()) return { drop, pick, moved: false };
  const next = nextSlot(now);
  const nextAt = Date.parse(zonedToIso(next.day, next.time));
  const pickAt = Date.parse(zonedToIso(pick.day, pick.time));
  if (pickAt > nextAt) return { drop: next, pick, moved: true };
  const length = pickAt > dropAt ? pickAt - dropAt : 86_400_000;
  return { drop: next, pick: isoToZoned(new Date(nextAt + length).toISOString()), moved: true };
}

/** The earliest time that can still be picked on `day`: one minute from now today, none on a later day. */
export function earliestTime(day: string, now: Date = new Date()): string | null {
  if (day > appToday(now)) return null;
  const minutes = Math.min(timeToMinutes(isoToZoned(now.toISOString()).time) + 1, 23 * 60 + 59);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
