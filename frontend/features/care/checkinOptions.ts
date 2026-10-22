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

/** The four taps on the sitter's pet room (11.12): one tap = one check-in with a sensible default. */
export const PET_ACTIONS: {
  key: "feed" | "walk" | "potty" | "nap" | "wake";
  emoji: string;
  label: string;
  kind: CareCheckinKind;
  value: string | null;
  dogsOnly?: boolean;
}[] = [
  { key: "feed", emoji: "🍽️", label: "Feed", kind: "meal", value: "all" },
  { key: "walk", emoji: "🦮", label: "Walk", kind: "walk", value: "20", dogsOnly: true },
  { key: "potty", emoji: "💩", label: "Poop", kind: "potty", value: "normal" },
  { key: "nap", emoji: "💤", label: "Nap", kind: "nap", value: null },
];

/** Once a nap has started the Nap tap becomes Awake: the pet sleeps until the sitter says it woke up. */
const AWAKE: (typeof PET_ACTIONS)[number] = { key: "wake", emoji: "☀️", label: "Awake", kind: "wake", value: null };

export function petActionsFor(species: Species, sleeping = false) {
  return PET_ACTIONS.filter((a) => !(a.dogsOnly && species === "cat")).map((a) => (a.key === "nap" && sleeping ? AWAKE : a));
}

/** Walks are for dogs (D23); everything else suits both. */
export function groupsFor(species: Species) {
  return CHECKIN_GROUPS.filter((g) => !(g.dogsOnly && species === "cat"));
}
