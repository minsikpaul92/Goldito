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
    prompt: "When a visitor comes in, {name}…",
    options: ["Keeps a distance", "Watches, then comes over", "Comes over for a sniff", "Runs over to say hello"],
  },
  {
    key: "d2",
    axis: "sociability",
    prompt: "Meeting another dog on a walk, {name}…",
    options: ["Pulls away or tenses up", "Walks past", "Says a calm hello", "Wants to play right away"],
  },
  {
    key: "d3",
    axis: "sociability",
    prompt: "Around children, {name}…",
    options: ["Prefers to avoid them", "Is careful", "Is fine", "Loves them"],
  },
  {
    key: "d4",
    axis: "sensitivity",
    prompt: "When there are loud noises (thunder, vacuum, fireworks), {name}…",
    options: ["Doesn't notice", "Looks up, then relaxes", "Gets nervous for a while", "Panics or hides"],
  },
  {
    key: "d5",
    axis: "sensitivity",
    prompt: "In a new place or a change of routine, {name}…",
    options: ["Settles right away", "Is a little unsure", "Needs a day or two", "Gets stressed"],
  },
  {
    key: "d6",
    axis: "sensitivity",
    prompt: "When left alone at home, {name}…",
    options: ["Sleeps or plays", "Settles after a few minutes", "Whines or paces", "Gets very upset"],
  },
  {
    key: "d7",
    axis: "energy",
    prompt: "A normal day, {name} needs…",
    options: ["A short stroll", "One good walk", "Two long walks or a run", "Hours of activity"],
  },
  {
    key: "d8",
    axis: "energy",
    prompt: "Indoors, {name} is mostly…",
    options: ["Asleep on the couch", "Relaxed, follows me around", "Playful in bursts", "Always on the move"],
  },
  {
    key: "d9",
    axis: "appetite",
    prompt: "At meal time, {name}…",
    options: ["Eats slowly, sometimes skips", "Eats calmly", "Eats eagerly", "Gulps it down and wants more"],
  },
  {
    key: "d10",
    axis: "appetite",
    prompt: "About treats, {name}…",
    options: ["Takes them or leaves them", "Likes them", "Works hard for them", "Would do anything for one"],
  },
  {
    key: "d11",
    axis: "trainability",
    prompt: "Commands like \"sit\" and \"come\", {name}…",
    options: ["Is still learning", "Knows the basics", "Follows reliably", "Follows even with distractions"],
  },
  {
    key: "d12",
    axis: "trainability",
    prompt: "On a leash, {name}…",
    options: ["Is hard to hold when excited", "Pulls a lot", "Pulls a little", "Walks nicely beside me"],
  },
];

export const CAT_QUESTIONS: ChartQuestion[] = [
  {
    key: "c1",
    axis: "sociability",
    prompt: "When a visitor comes in, {name}…",
    options: ["Hides", "Watches from a distance", "Comes over to look", "Greets them at the door"],
  },
  {
    key: "c2",
    axis: "sociability",
    prompt: "Around other pets, {name}…",
    options: ["Avoids them", "Puts up with them", "Is curious", "Wants to play"],
  },
  {
    key: "c3",
    axis: "sociability",
    prompt: "When picked up or petted, {name}…",
    options: ["Prefers not to be held", "Allows it for a moment", "Enjoys it", "Asks for it"],
  },
  {
    key: "c4",
    axis: "sensitivity",
    prompt: "When there are loud noises, {name}…",
    options: ["Doesn't notice", "Looks up, then relaxes", "Gets nervous for a while", "Panics or hides"],
  },
  {
    key: "c5",
    axis: "sensitivity",
    prompt: "In a new place or a change of routine, {name}…",
    options: ["Settles right away", "Is a little unsure", "Needs a day or two", "Gets stressed"],
  },
  {
    key: "c6",
    axis: "sensitivity",
    prompt: "When left alone at home, {name}…",
    options: ["Sleeps or plays", "Settles after a few minutes", "Cries or paces", "Gets very upset"],
  },
  {
    key: "c7",
    axis: "energy",
    prompt: "About playtime, {name} wants…",
    options: ["Hardly any", "A little each day", "Several sessions a day", "Play all the time"],
  },
  {
    key: "c8",
    axis: "energy",
    prompt: "Indoors, {name} is mostly…",
    options: ["Asleep", "Relaxed, watching the room", "Playful in bursts", "Always on the move"],
  },
  {
    key: "c9",
    axis: "appetite",
    prompt: "At meal and treat time, {name}…",
    options: ["Eats little, sometimes skips", "Eats calmly", "Eats eagerly", "Always asks for more"],
  },
  {
    key: "c10",
    axis: "handling",
    prompt: "A carrier, brushing or medicine, {name}…",
    options: ["Fights it", "Puts up with it", "Accepts it", "Doesn't mind at all"],
  },
];

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
    prompt: "Has {name} ever bitten or snapped at a person?",
    options: [
      { value: "never", label: "Never" },
      { value: "once", label: "Once" },
      { value: "more", label: "More than once" },
      NOT_SURE,
    ],
  },
  {
    key: "s2",
    prompt: "With other animals, {name}…",
    options: [
      { value: "all", label: "Gets along with all" },
      { value: "picky", label: "Is picky about some" },
      { value: "none", label: "Can't be with others" },
      NOT_SURE,
    ],
  },
  {
    key: "s3",
    prompt: "Could {name} slip out of a door or gate?",
    options: [
      { value: "never", label: "Never" },
      { value: "excited", label: "Sometimes, when excited" },
      { value: "often", label: "Often tries" },
      NOT_SURE,
    ],
  },
  {
    key: "s4",
    prompt: "Guarding food, toys or spaces, {name}…",
    options: [
      { value: "never", label: "Never does" },
      { value: "animals", label: "Does, with other animals" },
      { value: "people", label: "Does, with people too" },
      NOT_SURE,
    ],
  },
  {
    key: "s5",
    prompt: "Anything a sitter must know about {name}'s health?",
    options: [
      { value: "nothing", label: "Nothing" },
      { value: "medication", label: "Daily medication" },
      { value: "condition", label: "A condition to watch" },
      { value: "both", label: "Both" },
    ],
  },
];

/** The last safety question: foods to avoid. Chips plus "Something else". Saved as pet allergies. */
export const FOOD_CHIPS = ["Chicken", "Beef", "Dairy", "Wheat", "Fish"] as const;

/** s6 is the foods question: "none" or "listed" (the foods themselves are saved as the pet's allergies). */
export const SAFETY_KEYS = [...SAFETY_QUESTIONS.map((q) => q.key), "s6"];

export function fill(text: string, name: string): string {
  return text.replace(/\{name\}/g, name.trim() || "your pet");
}
