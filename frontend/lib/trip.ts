import type { HandoffDraft } from "../components/HandoffPicker";
import { zonedToIso } from "../features/schedule/dates";

export const MAX_TRIP_DAYS = 31;

/** Why a trip (pets + drop-off + pick-up) can't be sent yet, or null. Shared by booking and inquiries. */
export function tripProblem(petIds: string[], dropOff: HandoffDraft, pickUp: HandoffDraft): string | null {
  if (petIds.length === 0) return "Pick at least one pet.";
  const drop = Date.parse(zonedToIso(dropOff.day, dropOff.time));
  const pick = Date.parse(zonedToIso(pickUp.day, pickUp.time));
  if (drop <= Date.now() || pick <= drop) return "Pick a drop-off in the future and a pick-up after it.";
  if (pick - drop > MAX_TRIP_DAYS * 86_400_000) return `A trip can be up to ${MAX_TRIP_DAYS} days.`;
  return null;
}
