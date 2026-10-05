import type { CareTaskRow, CareTaskType, Species, TaskLogRow } from "../../types/db";
import { formatInstant } from "../schedule/dates";

export const CARE_TYPES: { type: CareTaskType; emoji: string; label: string }[] = [
  { type: "medication", emoji: "💊", label: "Medication" },
  { type: "feeding", emoji: "🍽️", label: "Meal" },
  { type: "walk", emoji: "🦮", label: "Walk" },
  { type: "litter", emoji: "🧹", label: "Litter" },
  { type: "play", emoji: "🎾", label: "Play" },
  { type: "sleep", emoji: "😴", label: "Nap" },
];

const BY_TYPE = Object.fromEntries(CARE_TYPES.map((t) => [t.type, t])) as Record<
  CareTaskType,
  (typeof CARE_TYPES)[number]
>;

export function careTypeMeta(type: CareTaskType) {
  return BY_TYPE[type];
}

/** Same rule as the DB guard (003): no walks for cats, no litter for dogs (D23). */
export function typesForSpecies(species: Species): typeof CARE_TYPES {
  return CARE_TYPES.filter(
    (t) => !((t.type === "walk" && species === "cat") || (t.type === "litter" && species === "dog")),
  );
}

export type TodayStatus =
  | { kind: "scheduled" }
  | { kind: "pending" }
  | { kind: "missed" }
  | { kind: "done"; at: string };

/** D9: a pending task counts as missed 60 minutes after its time. */
const MISSED_AFTER_MS = 60 * 60_000;

/** Today's state of a task (D9, derived — never stored). */
export function todayStatus(log: TaskLogRow | undefined, now = Date.now()): TodayStatus {
  if (!log) return { kind: "scheduled" };
  if (log.status === "done") return { kind: "done", at: log.completed_at ?? log.due_at };
  return now > new Date(log.due_at).getTime() + MISSED_AFTER_MS ? { kind: "missed" } : { kind: "pending" };
}

/** Earliest first, paused tasks last. */
export function sortTasks(tasks: CareTaskRow[]): CareTaskRow[] {
  return [...tasks].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) || a.scheduled_time.localeCompare(b.scheduled_time),
  );
}

/** Badge text for a task's state today; null while it is only scheduled. */
export function statusLabel(status: TodayStatus): string | null {
  switch (status.kind) {
    case "done":
      return `✅ Done ${formatInstant(status.at).split(", ")[1]}`;
    case "pending":
      return "⏳ Pending";
    case "missed":
      return "⚠️ Missed";
    default:
      return null;
  }
}
