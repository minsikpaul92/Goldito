import type { IconName } from "../../components/ui/Icon";
import type { CareCheckinKind, Species } from "../../types/db";

export type CheckinOption = { value: string; label: string; icon?: IconName };

/** The moods a sitter can log (015i). The first one is what a double tap sends. */
export const MOOD_OPTIONS: CheckinOption[] = [
  { value: "happy", label: "Happy", icon: "moodHappy" },
  { value: "playful", label: "Playful", icon: "moodPlayful" },
  { value: "excited", label: "Excited", icon: "moodExcited" },
  { value: "calm", label: "Calm", icon: "moodCalm" },
  { value: "tired", label: "Tired", icon: "moodTired" },
  { value: "missing", label: "Missing you", icon: "moodMissing" },
  { value: "sad", label: "Sad", icon: "moodSad" },
  { value: "anxious", label: "Anxious", icon: "moodAnxious" },
];

/** The one-tap values of each check-in. Notes have no tap value. */
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
    options: ["5", "10", "15", "20", "30", "45", "60"].map((m) => ({ value: m, label: `${m} min` })),
  },
  {
    kind: "mood",
    emoji: "😊",
    label: "Mood",
    options: MOOD_OPTIONS,
  },
];

export const MEMO_MAX = 120;

/** One choice on a Home tile. `memo` = "Other": the sitter must type a few words, and they are what the owner reads. */
export type TileOption = { kind: CareCheckinKind; value: string | null; label: string; memo?: boolean; icon?: IconName };

export type HomeTileKey = "ate" | "potty" | "walk" | "nap" | "mood";

/**
 * The Quick check-in tiles on the sitter Home (Figma 1730:104509). Tap = the choices open on the tile; two quick taps =
 * the first choice goes out. Walk becomes Nap for a cat (D23); a real walk with distance is #339, the Short / Mid / Long
 * taps are the log until then.
 */
export const HOME_TILES: Record<HomeTileKey, { label: string; options: TileOption[] }> = {
  ate: {
    label: "Ate",
    options: [
      { kind: "meal", value: "all", label: "Ate everything" },
      { kind: "meal", value: "most", label: "Left a little" },
      { kind: "meal", value: "none", label: "Didn't eat" },
      { kind: "meal", value: "other", label: "Other", memo: true },
    ],
  },
  potty: {
    label: "Potty",
    options: [
      { kind: "potty", value: "normal", label: "All done" },
      { kind: "potty", value: "soft", label: "Soft stool" },
      { kind: "potty", value: "other", label: "Other", memo: true },
    ],
  },
  walk: {
    label: "Walk",
    options: [
      { kind: "walk", value: "5", label: "Short · about 5 min" },
      { kind: "walk", value: "15", label: "Mid · about 15 min" },
      { kind: "walk", value: "30", label: "Long · 30+ min" },
    ],
  },
  nap: {
    label: "Nap",
    options: [
      { kind: "nap", value: null, label: "Nap" },
      { kind: "wake", value: null, label: "Awake" },
    ],
  },
  mood: { label: "Mood", options: MOOD_OPTIONS.map((o) => ({ kind: "mood" as const, value: o.value, label: o.label, icon: o.icon })) },
};

export const homeTilesFor = (species: Species): HomeTileKey[] =>
  species === "cat" ? ["ate", "potty", "nap", "mood"] : ["ate", "potty", "walk", "mood"];

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
