import type { MediaKind, PickPurpose } from "./media";

/**
 * Sample media for the desktop frame and demo accounts (no camera there — D25, phase-04 4.7).
 * A sample is read as a Blob and goes through the SAME `uploadMedia()` path as a real pick,
 * so the AI really analyzes it (no fake results).
 *
 * Photos/video live in `assets/demo/`. No people or addresses.
 * `safety_label`: made-up treat labels (no brands) for the four Treat check outcomes (phase-08 sample table).
 * `mood`: our own dog photos (metadata removed) + the fetch clip — read in the browser only, never uploaded.
 * `sticker`: the same photos — only the cut-out PNG is uploaded, never the photo.
 * `handoff` has none (the in-app photo check was dropped from 06B).
 */
export type DemoSample = {
  id: string;
  label: string;
  /** `require()` of the bundled image or short video. */
  source: number;
  kind?: MediaKind;
};

const DAILY: DemoSample[] = [
  { id: "meal", label: "Carrot snack", source: require("../assets/demo/meal.jpg") },
  { id: "walk", label: "Park day", source: require("../assets/demo/walk.jpg") },
  { id: "nap", label: "Complaining", source: require("../assets/demo/nap.jpg") },
  {
    id: "play_fetch",
    label: "Fetch play",
    source: require("../assets/demo/play_fetch.mp4"),
    kind: "video",
  },
];

// Expected with the seeded pets: DANGER for Max (chicken), WARNING for Max (animal fat), SAFE, DANGER for Mochi (lily).
const LABELS: DemoSample[] = [
  { id: "chicken_jerky", label: "Chicken jerky", source: require("../assets/demo/labels/chicken_jerky.jpg") },
  { id: "animal_fat_biscuit", label: "Biscuit", source: require("../assets/demo/labels/animal_fat_biscuit.jpg") },
  { id: "sweet_potato_chew", label: "Sweet potato", source: require("../assets/demo/labels/sweet_potato_chew.jpg") },
  { id: "lily_scented_cat_treat", label: "Cat treat", source: require("../assets/demo/labels/lily_scented_cat_treat.jpg") },
];

// Snap → Mood (12.2): one look each — playing, happy, sleeping, watchful — and a clip for the four-frame average.
const MOOD: DemoSample[] = [
  { id: "mood_tug", label: "Tug of war", source: require("../assets/demo/mood/maltese_tug_toy.jpg") },
  { id: "mood_tongue", label: "Tongue out", source: require("../assets/demo/mood/terrier_tongue_out_kitchen.jpg") },
  { id: "mood_grass", label: "Grass walk", source: require("../assets/demo/mood/maltese_grass_leash.jpg") },
  { id: "mood_sleeping", label: "Fast asleep", source: require("../assets/demo/mood/chihuahua_sleeping_blanket.jpg") },
  { id: "mood_watchful", label: "Watching", source: require("../assets/demo/mood/chihuahua_lying_watchful.jpg") },
  { id: "mood_couch", label: "Couch nap", source: require("../assets/demo/mood/terrier_sleeping_couch.jpg") },
  { id: "play_fetch", label: "Fetch play", source: require("../assets/demo/play_fetch.mp4"), kind: "video" },
];

const SAMPLES: Record<PickPurpose, DemoSample[]> = {
  feed: DAILY,
  task_proof: DAILY,
  report: DAILY,
  handoff: [],
  safety_label: LABELS,
  mood: MOOD,
  sticker: MOOD.filter((sample) => sample.kind !== "video"),
  // A profile photo: the same made-up dog photos stand in for a face on the desktop frame and demo accounts.
  profile: MOOD.filter((sample) => sample.kind !== "video"),
  // A diary page image is drawn by the app (Share → public link), never picked.
  diary_page: [],
};

export function samplesFor(purpose: PickPurpose, mediaTypes?: MediaKind[]): DemoSample[] {
  const all = SAMPLES[purpose];
  if (!mediaTypes || mediaTypes.length === 0) return all;
  return all.filter((s) => mediaTypes.includes(s.kind ?? "image"));
}
