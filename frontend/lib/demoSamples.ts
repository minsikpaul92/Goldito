import type { MediaKind, PickPurpose } from "./media";

/**
 * Sample media for the desktop frame and demo accounts (no camera there — D25, phase-04 4.7).
 * A sample is read as a Blob and goes through the SAME `uploadMedia()` path as a real pick,
 * so the AI really analyzes it (no fake results).
 *
 * Photos/video live in `assets/demo/`. No people or addresses (Mumu's are cleaned: no metadata, no sound, one phone number blurred).
 * `safety_label`: made-up treat labels (no brands) for the four Treat check outcomes (phase-08 sample table).
 * `mood`: our own dog and cat photos (metadata removed) + the fetch clip — read in the browser only, never uploaded.
 * `sticker`: the same photos — only the cut-out PNG is uploaded, never the photo.
 * Every photo is offered wherever a photo is picked (feed, Diary, tasks, report, Snap, profile); only the treat
 * labels and the fetch clip are tied to what they are for.
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

// Our own cats, one look each: relaxed, wary, blank, startled but curious, relaxed and trusting (cat_notes.json).
const CATS: DemoSample[] = [
  { id: "cat_orange", label: "Orange cat", source: require("../assets/demo/mood/orange_cat_lying_relaxed.jpg") },
  { id: "cat_cream", label: "Wary cat", source: require("../assets/demo/mood/cream_cat_wary_hallway.jpg") },
  { id: "cat_gray", label: "Blank stare", source: require("../assets/demo/mood/gray_cat_blank_stare.jpg") },
  { id: "cat_black", label: "Curious cat", source: require("../assets/demo/mood/black_cat_startled_curious.jpg") },
  { id: "cat_tortie", label: "Belly up", source: require("../assets/demo/mood/tortoiseshell_cat_belly_up_trusting.jpg") },
];

// Mumu, a Bichon Frise: photos and one clip (metadata removed, audio dropped, a shop's phone number blurred).
const MUMU_VIDEO: DemoSample = { id: "mumu_kitchen", label: "Mumu · kitchen", source: require("../assets/demo/mumu/mumu_kitchen.mp4"), kind: "video" };
const MUMU: DemoSample[] = [
  { id: "mumu_leather_chair", label: "Mumu · chair", source: require("../assets/demo/mumu/mumu_leather_chair.jpg") },
  { id: "mumu_party_hat", label: "Mumu · party hat", source: require("../assets/demo/mumu/mumu_party_hat.jpg") },
  { id: "mumu_green_toy", label: "Mumu · green toy", source: require("../assets/demo/mumu/mumu_green_toy.jpg") },
  { id: "mumu_pink_jacket_bed", label: "Mumu · pink jacket", source: require("../assets/demo/mumu/mumu_pink_jacket_bed.jpg") },
  { id: "mumu_car_hat", label: "Mumu · car ride", source: require("../assets/demo/mumu/mumu_car_hat.jpg") },
  { id: "mumu_car_tongue_out", label: "Mumu · tongue out", source: require("../assets/demo/mumu/mumu_car_tongue_out.jpg") },
  { id: "mumu_white_table", label: "Mumu · on the table", source: require("../assets/demo/mumu/mumu_white_table.jpg") },
  { id: "mumu_window_nap", label: "Mumu · window nap", source: require("../assets/demo/mumu/mumu_window_nap.jpg") },
  { id: "mumu_lake_walk", label: "Mumu · lake walk", source: require("../assets/demo/mumu/mumu_lake_walk.jpg") },
  { id: "mumu_cafe_stroller", label: "Mumu · cafe", source: require("../assets/demo/mumu/mumu_cafe_stroller.jpg") },
  { id: "mumu_red_pillow", label: "Mumu · red pillow", source: require("../assets/demo/mumu/mumu_red_pillow.jpg") },
  { id: "mumu_stroller_hat", label: "Mumu · stroller", source: require("../assets/demo/mumu/mumu_stroller_hat.jpg") },
  { id: "mumu_blossom_basket", label: "Mumu · blossoms", source: require("../assets/demo/mumu/mumu_blossom_basket.jpg") },
];

const isPhoto = (sample: DemoSample) => sample.kind !== "video";
const PET_PHOTOS = [...MOOD.filter(isPhoto), ...CATS, ...MUMU];
// Daily samples first (the clip stays in its spot), then every pet photo.
const EVERYDAY = [...DAILY, MUMU_VIDEO, ...PET_PHOTOS];

const SAMPLES: Record<PickPurpose, DemoSample[]> = {
  feed: EVERYDAY,
  task_proof: EVERYDAY,
  report: EVERYDAY,
  handoff: [],
  safety_label: LABELS,
  // The fetch clip is already in MOOD; add the cats and the daily photos after it.
  mood: [...MOOD, MUMU_VIDEO, ...CATS, ...MUMU, ...DAILY.filter(isPhoto)],
  sticker: [...PET_PHOTOS, ...DAILY.filter(isPhoto)],
  // A profile photo: the same made-up pet photos stand in for a face on the desktop frame and demo accounts.
  profile: [...PET_PHOTOS, ...DAILY.filter(isPhoto)],
  // A diary page image is drawn by the app (Share → public link), never picked.
  diary_page: [],
};

export function samplesFor(purpose: PickPurpose, mediaTypes?: MediaKind[]): DemoSample[] {
  const all = SAMPLES[purpose];
  if (!mediaTypes || mediaTypes.length === 0) return all;
  return all.filter((s) => mediaTypes.includes(s.kind ?? "image"));
}
