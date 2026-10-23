import type { Species } from "../../types/db";

/**
 * The owner sign-up questions (11.15, #185). Wording follows docs/plan/pet-profile-onboarding.ko.md §4. Every chart
 * question has four options ordered from the weaker to the stronger side of its axis, so the position (1 to 4) is the
 * score. Nothing here is a behaviour assessment: the owner describes their pet, the app shows it back.
 */

export type Axis = "sociability" | "sensitivity" | "energy" | "appetite" | "trainability" | "handling";

export type Score = 1 | 2 | 3 | 4;

export type ChartQuestion = {
  key: string;
  axis: Axis;
  /** `{name}` is replaced by the pet's name. */
  prompt: string;
  options: [string, string, string, string];
};

export type SafetyQuestion = {
  key: string;
  prompt: string;
  options: { value: string; label: string }[];
};

export const AXIS_LABEL: Record<Axis, string> = {
  sociability: "Sociability",
  sensitivity: "Sensitivity",
  energy: "Energy",
  appetite: "Appetite",
  trainability: "Trainability",
  handling: "Handling",
};

/** Four words per axis, weaker to stronger. The chart never shows a number. */
export const LEVEL_WORDS: Record<Axis, [string, string, string, string]> = {
  sociability: ["Reserved", "Selective", "Friendly", "Social"],
  sensitivity: ["Unfazed", "Mild", "Sensitive", "Very sensitive"],
  energy: ["Couch", "Steady", "Active", "Very active"],
  appetite: ["Light", "Steady", "Hearty", "Food-driven"],
  trainability: ["Learning", "Basics", "Reliable", "Star pupil"],
  handling: ["Resists", "Tolerates", "Accepts", "Easygoing"],
};

export const DOG_AXES: Axis[] = ["sociability", "sensitivity", "energy", "appetite", "trainability"];
export const CAT_AXES: Axis[] = ["sociability", "sensitivity", "energy", "appetite", "handling"];

export const DOG_QUESTIONS: ChartQuestion[] = [
  {
    key: "d1",
    axis: "sociability",
    prompt: "When a guest visits, {name}…",
    options: ["Stays back", "Watches first", "Comes to sniff", "Runs to say hi!"],
  },
  {
    key: "d2",
    axis: "sociability",
    prompt: "Seeing other dogs on a walk, {name}…",
    options: ["Pulls away", "Just walks past", "Calm hello", "Wants to play!"],
  },
  {
    key: "d3",
    axis: "sociability",
    prompt: "Around kids, {name}…",
    options: ["Avoids them", "Careful", "Calm & fine", "Loves kids!"],
  },
  {
    key: "d4",
    axis: "sensitivity",
    prompt: "With loud noises, {name}…",
    options: ["Doesn't care", "Alert, then relaxes", "Gets nervous", "Panics or hides"],
  },
  {
    key: "d5",
    axis: "sensitivity",
    prompt: "In a new place, {name}…",
    options: ["Settles quickly", "A bit unsure", "Needs a few days", "Gets very stressed"],
  },
  {
    key: "d6",
    axis: "sensitivity",
    prompt: "When left home alone, {name}…",
    options: ["Chills & sleeps", "Settles quickly", "Whines a bit", "Very anxious"],
  },
  {
    key: "d7",
    axis: "energy",
    prompt: "On a normal day, {name} needs…",
    options: ["A short stroll", "One good walk", "Two good walks", "Hours of activity"],
  },
  {
    key: "d8",
    axis: "energy",
    prompt: "At home, {name} is mostly…",
    options: ["Sleeping", "Relaxed & chill", "Playful", "Always active"],
  },
  {
    key: "d9",
    axis: "appetite",
    prompt: "At meal time, {name}…",
    options: ["Slow or picky", "Eats calmly", "Eats eagerly", "Fast & wants more!"],
  },
  {
    key: "d10",
    axis: "appetite",
    prompt: "With treats, {name}…",
    options: ["Not interested", "Likes them", "Works for them", "Obsessed with treats!"],
  },
  {
    key: "d11",
    axis: "trainability",
    prompt: "With basic commands (\"sit\", \"stay\"), {name}…",
    options: ["Still learning", "Knows the basics", "Reliable", "Star pupil!"],
  },
  {
    key: "d12",
    axis: "trainability",
    prompt: "Walking on a leash, {name}…",
    options: ["Hard to hold", "Pulls a lot", "Pulls a little", "Walks nicely beside me"],
  },
];

export const CAT_QUESTIONS: ChartQuestion[] = [
  {
    key: "c1",
    axis: "sociability",
    prompt: "When a guest visits, {name}…",
    options: ["Hides away", "Watches from afar", "Comes to check", "Greets at the door"],
  },
  {
    key: "c2",
    axis: "sociability",
    prompt: "Around other pets, {name}…",
    options: ["Avoids them", "Tolerates them", "Curious", "Wants to play!"],
  },
  {
    key: "c3",
    axis: "sociability",
    prompt: "When petted or held, {name}…",
    options: ["Dislikes it", "Tolerates briefly", "Enjoys it", "Demands cuddles!"],
  },
  {
    key: "c4",
    axis: "sensitivity",
    prompt: "With loud noises, {name}…",
    options: ["Doesn't care", "Alert, then relaxes", "Gets nervous", "Panics or hides"],
  },
  {
    key: "c5",
    axis: "sensitivity",
    prompt: "In a new place, {name}…",
    options: ["Settles quickly", "A bit unsure", "Needs a few days", "Gets very stressed"],
  },
  {
    key: "c6",
    axis: "sensitivity",
    prompt: "When left home alone, {name}…",
    options: ["Chills & sleeps", "Settles quickly", "Cries a bit", "Very distressed"],
  },
  {
    key: "c7",
    axis: "energy",
    prompt: "For playtime, {name} wants…",
    options: ["Rarely plays", "A little each day", "Multiple times a day", "Nonstop play!"],
  },
  {
    key: "c8",
    axis: "energy",
    prompt: "At home, {name} is mostly…",
    options: ["Asleep", "Relaxed & watching", "Playful", "Zoomies & active!"],
  },
  {
    key: "c9",
    axis: "appetite",
    prompt: "At meal and treat time, {name}…",
    options: ["Pick or skips", "Eats calmly", "Eats eagerly", "Always begs for more!"],
  },
  {
    key: "c10",
    axis: "handling",
    prompt: "Grooming, vet visits, or meds, {name}…",
    options: ["Fights it", "Tolerates it", "Accepts it", "Super easygoing"],
  },
];

/** Where the ideas for the questions come from (we wrote the questions ourselves; see docs/plan/pet-profile-onboarding.ko.md §4). */
export const QUESTION_SOURCES: Record<Species, { label: string; url: string }[]> = {
  dog: [
    { label: "MCPQ-R, dog personality", url: "https://wellbeingintlstudiesrepository.org/person/9" },
    { label: "C-BARQ, Penn Vet", url: "https://vetapps.vet.upenn.edu/cbarq/" },
    { label: "DPQ, Gosling lab", url: "https://gosling.psy.utexas.edu/scales-weve-developed/dog-personality-questionnaire-dpq/" },
  ],
  cat: [
    { label: "Feline Five", url: "https://kinship.com/cat-behavior/feline-five-study" },
    { label: "Fe-BARQ, Penn Vet", url: "https://vetapps.vet.upenn.edu/febarq/about.cfm" },
  ],
};

export function chartQuestions(species: Species): ChartQuestion[] {
  return species === "cat" ? CAT_QUESTIONS : DOG_QUESTIONS;
}

export function chartAxes(species: Species): Axis[] {
  return species === "cat" ? CAT_AXES : DOG_AXES;
}

const NOT_SURE = { value: "unsure", label: "Not sure" };

/** Safety questions are always answered by the owner, never by the app (and never pre-selected). */
export const SAFETY_QUESTIONS: SafetyQuestion[] = [
  {
    key: "s1",
    prompt: "Ever bitten or snapped at a person?",
    options: [
      { value: "never", label: "Never" },
      { value: "once", label: "Once" },
      { value: "more", label: "Multiple times" },
      NOT_SURE,
    ],
  },
  {
    key: "s2",
    prompt: "With other animals, {name}…",
    options: [
      { value: "all", label: "Friendly with all" },
      { value: "picky", label: "Picky with some" },
      { value: "none", label: "No other animals" },
      NOT_SURE,
    ],
  },
  {
    key: "s3",
    prompt: "Could {name} run out an open door?",
    options: [
      { value: "never", label: "Never" },
      { value: "excited", label: "Sometimes" },
      { value: "often", label: "Often tries" },
      NOT_SURE,
    ],
  },
  {
    key: "s4",
    prompt: "Guarding food or toys, {name}…",
    options: [
      { value: "never", label: "Never" },
      { value: "animals", label: "Yes, with pets" },
      { value: "people", label: "Yes, with people too" },
      NOT_SURE,
    ],
  },
  {
    key: "s5",
    prompt: "Any health conditions or daily meds?",
    options: [
      { value: "nothing", label: "None" },
      { value: "medication", label: "Daily meds" },
      { value: "condition", label: "Condition to watch" },
      { value: "both", label: "Both" },
    ],
  },
];

/** The last safety question: foods to avoid. Chips plus "Something else". Saved as pet allergies. */
export const FOOD_CHIPS = ["Chicken", "Beef", "Dairy", "Wheat", "Fish"] as const;

/** s6 is the foods question: "none" or "listed" (the foods themselves are saved as the pet's allergies). */
export const SAFETY_KEYS = [...SAFETY_QUESTIONS.map((q) => q.key), "s6"];

/** The coat colors offered (and what the pet-photo guess may return). Saved as `pets.profile.coat`. */
export const COATS = [
  { value: "white", label: "White" },
  { value: "cream", label: "Cream" },
  { value: "golden", label: "Golden" },
  { value: "orange", label: "Orange" },
  { value: "brown", label: "Brown" },
  { value: "black", label: "Black" },
  { value: "gray", label: "Gray" },
  { value: "mixed", label: "Mixed" },
] as const;

export type Coat = (typeof COATS)[number]["value"];

export function isCoat(value: unknown): value is Coat {
  return COATS.some((c) => c.value === value);
}

export function fill(text: string, name: string): string {
  return text.replace(/\{name\}/g, name.trim() || "your pet");
}
