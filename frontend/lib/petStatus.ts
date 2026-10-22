import { isoToZoned, timeToMinutes } from "../features/schedule/dates";

/** The five faces of the pet room (pet-status-room §7). */
export type PetMood = "excited" | "calm" | "tired" | "hungry" | "sleepy";

/** One check-in of today, newest or oldest first (`kind` stays a plain string so a new kind never breaks this). */
export type StatusCheckin = { kind: string; value: string | null; at: string };

/** A task still waiting today: the label shown under the pet and when it is due. */
export type PendingTask = { title: string; dueAt: string };

export type PetStatus = {
  mood: PetMood;
  /** `fed` = a good meal lately, `hungry` = skipped, light or nothing for a while, `unknown` = no check-in yet today. */
  meal: "fed" | "hungry" | "unknown";
  /** `done` = potty logged today, `due` = nothing logged by the evening, `unknown` otherwise. */
  potty: "done" | "due" | "unknown";
  /** Walk minutes logged today. */
  walkMinutes: number;
  /** A nap with no Awake after it yet (the sitter taps Awake when the pet wakes). */
  sleeping: boolean;
  nextTask: PendingTask | null;
};

const HOUR = 3_600_000;
/** No meal for this long (or a light one) reads as hungry. */
const HUNGRY_AFTER = 6 * HOUR;
/** A nap lasts until the sitter taps Awake; one nobody ended is over after this long. */
const NAP_MAX = 4 * HOUR;
/** A walk this recent makes the pet excited when no mood was logged. */
const WALK_GLOW = HOUR;
/** Minutes after midnight (app timezone) from which a missing potty is flagged. */
const POTTY_NUDGE_FROM = 18 * 60;

const MOOD_OF: Record<string, PetMood> = { happy: "excited", calm: "calm", tired: "tired" };

/**
 * Today's check-ins (+ tasks still open) → what the pet room shows. Pure: tune the rules here, no schema change.
 * With nothing logged today the pet is calm and everything is `unknown`, so a pet outside a stay never looks starved.
 */
export function derivePetStatus(
  checkins: StatusCheckin[],
  pending: PendingTask[] = [],
  now: Date = new Date(),
): PetStatus {
  const nextTask = [...pending].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0] ?? null;
  if (checkins.length === 0) {
    return { mood: "calm", meal: "unknown", potty: "unknown", walkMinutes: 0, sleeping: false, nextTask };
  }

  const newestFirst = [...checkins].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const latest = (kind: string) => newestFirst.find((c) => c.kind === kind);
  const age = (c: StatusCheckin) => now.getTime() - Date.parse(c.at);

  const meal = latest("meal");
  const mealState: PetStatus["meal"] =
    meal && age(meal) <= HUNGRY_AFTER && (meal.value === "all" || meal.value === "most") ? "fed" : "hungry";

  const potty = latest("potty");
  const nowMinutes = timeToMinutes(isoToZoned(now.toISOString()).time);
  const pottyState: PetStatus["potty"] = potty ? "done" : nowMinutes >= POTTY_NUDGE_FROM ? "due" : "unknown";

  const walkMinutes = checkins.filter((c) => c.kind === "walk").reduce((sum, c) => sum + (Number(c.value) || 0), 0);

  const nap = latest("nap");
  const wake = latest("wake");
  // Asleep from a nap until the Awake after it (or until the nap is too old to be true).
  const sleeping = !!nap && age(nap) <= NAP_MAX && (!wake || Date.parse(wake.at) < Date.parse(nap.at));
  const walk = latest("walk");
  const mood = latest("mood");
  let face: PetMood = "calm";
  if (sleeping) face = "sleepy";
  else if (mealState === "hungry") face = "hungry";
  else if (mood && MOOD_OF[mood.value ?? ""]) face = MOOD_OF[mood.value ?? ""];
  else if (walk && age(walk) <= WALK_GLOW) face = "excited";

  return { mood: face, meal: mealState, potty: pottyState, walkMinutes, sleeping, nextTask };
}
