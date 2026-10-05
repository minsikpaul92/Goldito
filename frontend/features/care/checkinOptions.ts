import type { CareCheckinKind, Species } from "../../types/db";

export type CheckinOption = { value: string; label: string };

/** The one-tap values of each check-in (sitter-care-loop §3). Notes have no tap value. */
export const CHECKIN_GROUPS: {
  kind: Exclude<CareCheckinKind, "note">;
  emoji: string;
  label: string;
  options: CheckinOption[];
  dogsOnly?: boolean;
}[] = [
  {
    kind: "meal",
    emoji: "🍽️",
    label: "Meal",
    options: [
      { value: "all", label: "All" },
      { value: "most", label: "Most" },
      { value: "little", label: "A little" },
      { value: "none", label: "None" },
    ],
  },
  {
    kind: "potty",
    emoji: "💩",
    label: "Potty",
    options: [
      { value: "normal", label: "Normal" },
      { value: "soft", label: "Soft" },
      { value: "none", label: "None" },
    ],
  },
  {
    kind: "walk",
    emoji: "🦮",
    label: "Walk",
    dogsOnly: true,
    options: ["10", "20", "30", "45", "60"].map((m) => ({ value: m, label: `${m} min` })),
  },
  {
    kind: "mood",
    emoji: "😊",
    label: "Mood",
    options: [
      { value: "happy", label: "😊 Happy" },
      { value: "calm", label: "😌 Calm" },
      { value: "tired", label: "😴 Tired" },
    ],
  },
];

export const MEMO_MAX = 120;

/** Walks are for dogs (D23); everything else suits both. */
export function groupsFor(species: Species) {
  return CHECKIN_GROUPS.filter((g) => !(g.dogsOnly && species === "cat"));
}
