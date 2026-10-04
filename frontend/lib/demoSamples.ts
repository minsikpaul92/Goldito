import type { MediaPurpose } from "./cloudinary";

/**
 * Sample photos for the desktop frame and demo accounts (no camera there — D25, phase-04 4.7).
 * A sample is read as a Blob and goes through the SAME `uploadMedia()` path as a real photo,
 * so the AI really analyzes it (no fake results).
 *
 * The current images are PLACEHOLDERS (labelled "PLACEHOLDER SAMPLE"). Muk replaces the files in
 * `assets/demo/` with real dog / cat photos using the same names — no code change needed.
 * No people, no addresses, fictional brands only.
 *
 * `handoff` (dog_at_door · car_crate_ok · car_no_crate · empty_room) and `safety_label`
 * (chicken_jerky · animal_fat_biscuit · sweet_potato_chew · lily_scented_cat_treat) must be the
 * same photos as the Phase 06B / 08 fixtures, so those samples are added with those phases.
 */
export type DemoSample = {
  id: string;
  label: string;
  /** `require()` of the bundled image. */
  source: number;
};

const DAILY: DemoSample[] = [
  { id: "meal", label: "Breakfast", source: require("../assets/demo/meal.jpg") },
  { id: "walk", label: "Walk", source: require("../assets/demo/walk.jpg") },
  { id: "nap", label: "Nap", source: require("../assets/demo/nap.jpg") },
  // Max watching a squirrel — the daily note's episode comes from a photo (D38).
  { id: "walk_squirrel", label: "Squirrel in the park", source: require("../assets/demo/walk_squirrel.jpg") },
];

const SAMPLES: Record<MediaPurpose, DemoSample[]> = {
  feed: DAILY,
  task_proof: DAILY,
  report: DAILY,
  handoff: [],
  safety_label: [],
};

export function samplesFor(purpose: MediaPurpose): DemoSample[] {
  return SAMPLES[purpose];
}
