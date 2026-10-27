import type { MediaKind, PickPurpose } from "./media";

/**
 * Sample media for the desktop frame and demo accounts (no camera there — D25, phase-04 4.7).
 * A sample is read as a Blob and goes through the SAME `uploadMedia()` path as a real pick,
 * so the AI really analyzes it (no fake results).
 *
 * Photos/video live in `assets/demo/`. No people or addresses (Mumu's are cleaned: no metadata).
 * `safety_label`: made-up treat labels (no brands) for the four Treat check outcomes (phase-08 sample table).
 * `mood`: our own dog and cat photos (metadata removed) + the fetch clip — read in the browser only, never uploaded.
 * `sticker`: the same photos — only the cut-out PNG is uploaded, never the photo.
 * Every photo is offered wherever a photo is picked (feed, Diary, tasks, report, Snap, profile); only the treat
 * labels and the fetch clip are tied to what they are for.
 * `handoff` has none (the in-app photo check was dropped from 06B).
 */
export type SampleCategory = "dog" | "cat" | "human" | "treat";

export type DemoSample = {
  id: string;
  label: string;
  /** `require()` of the bundled image or short video. */
  source: number;
  kind?: MediaKind;
  category?: SampleCategory;
  subjectName?: string;
};

const DAILY: DemoSample[] = [
  { id: "meal", label: "Carrot snack", source: require("../assets/demo/meal.jpg"), category: "dog", subjectName: "Cooper" },
  { id: "walk", label: "Park day", source: require("../assets/demo/walk.jpg"), category: "dog", subjectName: "Cooper" },
  { id: "nap", label: "Complaining", source: require("../assets/demo/nap.jpg"), category: "dog", subjectName: "Max" },
  {
    id: "play_fetch",
    label: "Fetch play",
    source: require("../assets/demo/play_fetch.mp4"),
    kind: "video",
    category: "dog",
    subjectName: "Cooper",
  },
];

// Expected with the seeded pets: DANGER for Max (chicken), WARNING for Max (animal fat), SAFE, DANGER for Mochi (lily).
// The last two follow real ingredient lists (no brand): WARNING for Max (meat meal, animal fat, British "flavour"), DANGER for Max (chicken, chicken liver).
const LABELS: DemoSample[] = [
  { id: "chicken_jerky", label: "Chicken jerky", source: require("../assets/demo/labels/chicken_jerky.jpg"), category: "treat", subjectName: "Treats" },
  { id: "animal_fat_biscuit", label: "Biscuit", source: require("../assets/demo/labels/animal_fat_biscuit.jpg"), category: "treat", subjectName: "Treats" },
  { id: "sweet_potato_chew", label: "Sweet potato", source: require("../assets/demo/labels/sweet_potato_chew.jpg"), category: "treat", subjectName: "Treats" },
  { id: "lily_scented_cat_treat", label: "Cat treat", source: require("../assets/demo/labels/lily_scented_cat_treat.jpg"), category: "treat", subjectName: "Treats" },
  { id: "meat_meal_biscuit", label: "Meat meal biscuit", source: require("../assets/demo/labels/meat_meal_biscuit.jpg"), category: "treat", subjectName: "Treats" },
  { id: "chicken_kabob", label: "Chicken kabob", source: require("../assets/demo/labels/chicken_kabob.jpg"), category: "treat", subjectName: "Treats" },
];

// Snap → Mood (12.2): one look each — playing, happy, sleeping, watchful — and a clip for the four-frame average.
const MOOD: DemoSample[] = [
  { id: "mood_tug", label: "Tug of war", source: require("../assets/demo/mood/maltese_tug_toy.jpg"), category: "dog", subjectName: "Max" },
  { id: "mood_tongue", label: "Tongue out", source: require("../assets/demo/mood/terrier_tongue_out_kitchen.jpg"), category: "dog", subjectName: "Charlie" },
  { id: "mood_grass", label: "Grass walk", source: require("../assets/demo/mood/maltese_grass_leash.jpg"), category: "dog", subjectName: "Max" },
  { id: "mood_sleeping", label: "Fast asleep", source: require("../assets/demo/mood/chihuahua_sleeping_blanket.jpg"), category: "dog", subjectName: "Bella" },
  { id: "mood_watchful", label: "Watching", source: require("../assets/demo/mood/chihuahua_lying_watchful.jpg"), category: "dog", subjectName: "Bella" },
  { id: "mood_couch", label: "Couch nap", source: require("../assets/demo/mood/terrier_sleeping_couch.jpg"), category: "dog", subjectName: "Charlie" },
  { id: "chihuahua_bus_bag", label: "Bus ride", source: require("../assets/demo/mood/chihuahua_bus_bag.jpg"), category: "dog", subjectName: "Bella" },
  { id: "chihuahua_lap_curious", label: "Curious lap", source: require("../assets/demo/mood/chihuahua_lap_curious.jpg"), category: "dog", subjectName: "Bella" },
  { id: "maltese_cafe_street", label: "Cafe terrace", source: require("../assets/demo/mood/maltese_cafe_street.jpg"), category: "dog", subjectName: "Max" },
  { id: "play_fetch", label: "Fetch play", source: require("../assets/demo/play_fetch.mp4"), kind: "video", category: "dog", subjectName: "Cooper" },
];

// Our own cats, one look each: relaxed, wary, blank, startled but curious, relaxed and trusting (cat_notes.json).
const CATS: DemoSample[] = [
  { id: "cat_orange", label: "Orange cat", source: require("../assets/demo/mood/orange_cat_lying_relaxed.jpg"), category: "cat", subjectName: "Mochi" },
  { id: "cat_cream", label: "Wary cat", source: require("../assets/demo/mood/cream_cat_wary_hallway.jpg"), category: "cat", subjectName: "Coco" },
  { id: "cat_gray", label: "Blank stare", source: require("../assets/demo/mood/gray_cat_blank_stare.jpg"), category: "cat", subjectName: "Luna" },
  { id: "cat_black", label: "Curious cat", source: require("../assets/demo/mood/black_cat_startled_curious.jpg"), category: "cat", subjectName: "Shadow" },
  { id: "cat_tortie", label: "Belly up", source: require("../assets/demo/mood/tortoiseshell_cat_belly_up_trusting.jpg"), category: "cat", subjectName: "Cleo" },
];

// Mumu, a Bichon Frise: photos (metadata removed).
const MUMU: DemoSample[] = [
  { id: "mumu_leather_chair", label: "Mumu · chair", source: require("../assets/demo/mumu/mumu_leather_chair.jpg"), category: "dog", subjectName: "Mumu" },
  { id: "mumu_party_hat", label: "Mumu · party hat", source: require("../assets/demo/mumu/mumu_party_hat.jpg"), category: "dog", subjectName: "Mumu" },
  { id: "mumu_green_toy", label: "Mumu · green toy", source: require("../assets/demo/mumu/mumu_green_toy.jpg"), category: "dog", subjectName: "Mumu" },
  { id: "mumu_pink_jacket_bed", label: "Mumu · pink jacket", source: require("../assets/demo/mumu/mumu_pink_jacket_bed.jpg"), category: "dog", subjectName: "Mumu" },
  { id: "mumu_car_hat", label: "Mumu · car ride", source: require("../assets/demo/mumu/mumu_car_hat.jpg"), category: "dog", subjectName: "Mumu" },
  { id: "mumu_car_tongue_out", label: "Mumu · tongue out", source: require("../assets/demo/mumu/mumu_car_tongue_out.jpg"), category: "dog", subjectName: "Mumu" },
  { id: "mumu_lake_walk", label: "Mumu · lake walk", source: require("../assets/demo/mumu/mumu_lake_walk.jpg"), category: "dog", subjectName: "Mumu" },
  { id: "mumu_red_pillow", label: "Mumu · red pillow", source: require("../assets/demo/mumu/mumu_red_pillow.jpg"), category: "dog", subjectName: "Mumu" },
  { id: "mumu_stroller_hat", label: "Mumu · stroller", source: require("../assets/demo/mumu/mumu_stroller_hat.jpg"), category: "dog", subjectName: "Mumu" },
  { id: "mumu_blossom_basket", label: "Mumu · blossoms", source: require("../assets/demo/mumu/mumu_blossom_basket.jpg"), category: "dog", subjectName: "Mumu" },
];

const PEOPLE: DemoSample[] = [
  { id: "person_robert", label: "Robert · Owner", source: require("../assets/demo/people/robert.jpg"), category: "human", subjectName: "Robert" },
  { id: "person_chloe", label: "Chloe · Sitter", source: require("../assets/demo/people/chloe.jpg"), category: "human", subjectName: "Chloe" },
  { id: "person_minsik", label: "Minsik · Sitter", source: require("../assets/demo/people/minsik.jpg"), category: "human", subjectName: "Minsik" },
  { id: "person_seulgi", label: "Seulgi · Sitter", source: require("../assets/demo/people/seulgi.jpg"), category: "human", subjectName: "Seulgi" },
];

const isPhoto = (sample: DemoSample) => sample.kind !== "video";
const PET_PHOTOS = [...MOOD.filter(isPhoto), ...CATS, ...MUMU];
// Daily samples first (the clip stays in its spot), then every pet photo, then people.
const EVERYDAY = [...DAILY, ...PET_PHOTOS, ...PEOPLE];

const SAMPLES: Record<PickPurpose, DemoSample[]> = {
  feed: EVERYDAY,
  task_proof: EVERYDAY,
  report: EVERYDAY,
  handoff: [],
  safety_label: LABELS,
  // The fetch clip is already in MOOD; add the cats and the daily photos after it.
  mood: [...MOOD, ...CATS, ...MUMU, ...DAILY.filter(isPhoto)],
  sticker: [...PET_PHOTOS, ...DAILY.filter(isPhoto)],
  // A profile photo: includes pet photos and friendly human portraits.
  profile: [...PEOPLE, ...PET_PHOTOS, ...DAILY.filter(isPhoto)],
  // A diary page image is drawn by the app (Share → public link), never picked.
  diary_page: [],
};

export function samplesFor(purpose: PickPurpose, mediaTypes?: MediaKind[]): DemoSample[] {
  const all = SAMPLES[purpose];
  if (!mediaTypes || mediaTypes.length === 0) return all;
  return all.filter((s) => mediaTypes.includes(s.kind ?? "image"));
}
