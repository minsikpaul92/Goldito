import { formatTime } from "../schedule/dates";
import type { CareTaskType, Species } from "../../types/db";
import type { DraftTask } from "./carePlanApi";

/** The chips of the care request builder (Heads-up has no time: it is a warning, not a task). */
export type LineKind = "meal" | "medication" | "walk" | "headsup";

export const LINE_KINDS: { kind: LineKind; emoji: string; label: string; type: CareTaskType | null; title: string }[] = [
  { kind: "meal", emoji: "🍽️", label: "Meals", type: "feeding", title: "Meal" },
  { kind: "medication", emoji: "💊", label: "Medication", type: "medication", title: "Medication" },
  { kind: "walk", emoji: "🦮", label: "Walk", type: "walk", title: "Walk" },
  { kind: "headsup", emoji: "⚠️", label: "Heads-up", type: null, title: "Heads-up" },
];

export const kindMeta = (kind: LineKind) => LINE_KINDS.find((k) => k.kind === kind)!;

/** Cats don't go on walks. */
export const kindsForSpecies = (species: Species) => LINE_KINDS.filter((k) => !(k.kind === "walk" && species === "cat"));

/** What the text box starts with once a chip is picked (editable). */
export function presetText(kind: LineKind, species: Species): string {
  switch (kind) {
    case "meal":
      return species === "cat" ? "Half a can of wet food" : "1 cup of kibble";
    case "medication":
      return "1 pill, hidden in a lickable treat";
    case "walk":
      return "20 minutes around the block";
    default:
      return "";
  }
}

export const DEFAULT_TIME: Record<LineKind, string> = { meal: "08:00", medication: "08:00", walk: "17:00", headsup: "08:00" };

/** "Every day" of the stay, or "once" — one time only. */
export type Span = "day" | "once";
export type When = { mode: "time"; time: string } | { mode: "count"; count: number };

export type Line = { key: string; kind: LineKind; text: string; when: When; span: Span };

export const COUNT_MAX = 6;

/** `count` times spread over the waking day: 1 → 8 AM, 2 → 8 AM · 8 PM, 3 → 8 AM · 2 PM · 8 PM … */
export function spreadTimes(count: number): string[] {
  if (count <= 1) return ["08:00"];
  const start = 8 * 60;
  const end = 20 * 60;
  return Array.from({ length: count }, (_, i) => {
    // Nearest half hour, so the times read naturally.
    const minutes = Math.round((start + ((end - start) * i) / (count - 1)) / 30) * 30;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  });
}

/** Short text for the list of lines already written. */
export function lineSummary(line: Line): string {
  const meta = kindMeta(line.kind);
  if (line.kind === "headsup") return `${meta.emoji} ${line.text}`;
  const how = line.span === "day" ? "every day" : "once";
  const when =
    line.when.mode === "time"
      ? `${formatTime(line.when.time)} ${how}`
      : `${line.when.count} time${line.when.count === 1 ? "" : "s"} ${line.span === "day" ? "a day" : "in all"}`;
  return `${meta.emoji} ${meta.label} · ${when} · ${line.text}`;
}

/** The sentence the helper reads for one task (it also stays the fallback wording). */
export function taskSentence(line: Line, time: string): string {
  return `${kindMeta(line.kind).label}: ${formatTime(time)} — ${line.text}`;
}

/** One line → its checklist rows (no helper involved: this is what the owner chose). */
export function lineToTasks(line: Line): DraftTask[] {
  const meta = kindMeta(line.kind);
  if (!meta.type) return [];
  const times =
    line.when.mode === "time" ? [line.when.time] : spreadTimes(line.when.count).slice(0, line.when.count);
  const repeat = line.span === "day";
  return times.map((time, i) => ({
    key: `${line.key}-${i}`,
    type: meta.type as CareTaskType,
    time,
    title: times.length > 1 ? `${meta.title} ${i + 1}/${times.length}` : meta.title,
    dose: line.text.trim().slice(0, 60),
    notes: "",
    repeat,
  }));
}

export const CAUTION_MAX = 100;
