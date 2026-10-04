import type { MediaPurpose } from "./cloudinary";
import type { MediaKind } from "./media";

/**
 * Sample media for the desktop frame and demo accounts (no camera there — D25, phase-04 4.7).
 * A sample is read as a Blob and goes through the SAME `uploadMedia()` path as a real pick,
 * so the AI really analyzes it (no fake results).
 *
 * Photos/video live in `assets/demo/`. No people or addresses.
 * `handoff` / `safety_label` samples land with Phase 06B / 08.
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

const SAMPLES: Record<MediaPurpose, DemoSample[]> = {
  feed: DAILY,
  task_proof: DAILY,
  report: DAILY,
  handoff: [],
  safety_label: [],
};

export function samplesFor(purpose: MediaPurpose, mediaTypes?: MediaKind[]): DemoSample[] {
  const all = SAMPLES[purpose];
  if (!mediaTypes || mediaTypes.length === 0) return all;
  return all.filter((s) => mediaTypes.includes(s.kind ?? "image"));
}
