import type { Species } from "../../types/db";
import {
  AXIS_LABEL,
  Axis,
  LEVEL_WORDS,
  SAFETY_KEYS,
  Score,
  chartAxes,
  chartQuestions,
} from "./questions";

/** What is saved in `pets.profile` (014v): the owner's picks and nothing computed. Levels are worked out when shown. */
export type PetProfile = {
  v: 1;
  /** Chart question key to the picked position (1 to 4). A skipped question has no entry. */
  answers: Record<string, Score>;
  /** Safety question key to the picked value. "unsure" is a pick, a skipped question has no entry. */
  safety: Record<string, string>;
};

export const EMPTY_PROFILE: PetProfile = { v: 1, answers: {}, safety: {} };

export type AxisLevel = { axis: Axis; label: string; level: Score; word: string };

export type SafetyChip = { key: string; tone: "warning" | "info" | "unsure"; text: string };

/** Reads `pets.profile` defensively: anything unexpected is dropped, never thrown on. */
export function parseProfile(raw: unknown): PetProfile {
  const profile: PetProfile = { v: 1, answers: {}, safety: {} };
  if (!raw || typeof raw !== "object") return profile;
  const { answers, safety } = raw as { answers?: unknown; safety?: unknown };
  if (answers && typeof answers === "object") {
    for (const [key, value] of Object.entries(answers)) {
      if (value === 1 || value === 2 || value === 3 || value === 4) profile.answers[key] = value;
    }
  }
  if (safety && typeof safety === "object") {
    for (const [key, value] of Object.entries(safety)) {
      if (SAFETY_KEYS.includes(key) && typeof value === "string") profile.safety[key] = value;
    }
  }
  return profile;
}

/** One level per axis that has at least one answer: the average of its answers, rounded. Empty axes are left out. */
export function axisLevels(species: Species, answers: Record<string, Score>): AxisLevel[] {
  const levels: AxisLevel[] = [];
  for (const axis of chartAxes(species)) {
    const scores = chartQuestions(species)
      .filter((q) => q.axis === axis && answers[q.key] !== undefined)
      .map((q) => answers[q.key]);
    if (scores.length === 0) continue;
    const level = Math.min(4, Math.max(1, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length))) as Score;
    levels.push({ axis, label: AXIS_LABEL[axis], level, word: LEVEL_WORDS[axis][level - 1] });
  }
  return levels;
}

/** The axes the owner has not described, shown as "Not shared yet". */
export function missingAxes(species: Species, answers: Record<string, Score>): Axis[] {
  const have = new Set(axisLevels(species, answers).map((l) => l.axis));
  return chartAxes(species).filter((axis) => !have.has(axis));
}

const WARNINGS: Record<string, Record<string, string>> = {
  s1: { once: "Has snapped once", more: "Has snapped more than once" },
  s2: { none: "Can't be with other animals" },
  s3: { often: "Often tries to slip out" },
  s4: { people: "Guards from people too" },
};

const INFO: Record<string, Record<string, string>> = {
  s5: { medication: "Daily medication", condition: "Health condition to watch", both: "Medication and a condition" },
};

const TOPIC: Record<string, string> = {
  s1: "bites",
  s2: "other animals",
  s3: "slipping out",
  s4: "guarding",
};

/**
 * What a sitter must see first: warnings, health notes, foods to avoid. "Not sure" answers read "Owner isn't sure",
 * which is different from a question left empty (that shows nothing).
 */
export function safetyChips(safety: Record<string, string>, allergens: string[]): SafetyChip[] {
  const chips: SafetyChip[] = [];
  for (const key of ["s1", "s2", "s3", "s4"]) {
    const value = safety[key];
    if (value === "unsure") chips.push({ key, tone: "unsure", text: `Owner isn't sure (${TOPIC[key]})` });
    else if (value && WARNINGS[key][value]) chips.push({ key, tone: "warning", text: WARNINGS[key][value] });
  }
  const health = safety.s5 && INFO.s5[safety.s5];
  if (health) chips.push({ key: "s5", tone: "info", text: health });
  for (const allergen of allergens) chips.push({ key: `food-${allergen}`, tone: "info", text: `No ${allergen}` });
  return chips;
}

export type Glance = {
  axes: AxisLevel[];
  missing: Axis[];
  chips: SafetyChip[];
  /** Nothing described at all: the card then only shows the basics. */
  empty: boolean;
};

export function glance(species: Species, profile: PetProfile, allergens: string[]): Glance {
  const axes = axisLevels(species, profile.answers);
  const chips = safetyChips(profile.safety, allergens);
  return { axes, missing: missingAxes(species, profile.answers), chips, empty: axes.length === 0 && chips.length === 0 };
}
