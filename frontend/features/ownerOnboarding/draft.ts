import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Species } from "../../types/db";
import { normalizeAllergen } from "../pets/petValidation";
import { EMPTY_PROFILE, PetProfile } from "./scoring";
import { NO_FACTS, VoiceFacts } from "./voiceApi";
import type { Coat, Score } from "./questions";

export type WeightUnit = "kg" | "lbs";

/** Everything the owner has typed or picked so far. Kept on the device after every answer, so a reload goes on. */
export type OwnerOnboardingDraft = {
  /** The kind of the pet being filled in now. */
  species: Species | null;
  /** The kinds still to come after this pet (an owner with a dog and a cat goes through the questions twice). */
  pending: Species[];
  /** True from the second pet on: the owner's own questions and the kind question were already answered. */
  ownerDone: boolean;
  name: string;
  breed: string;
  /** Whole years, or null when skipped. Saved as an approximate birthday. */
  ageYears: number | null;
  /** The weight as typed, in `weightUnit`. Saved as kg (`weightFromDraft`). */
  weight: string;
  weightUnit: WeightUnit;
  petIntro: string;
  /** Cloudinary public ids of uploaded pet photos, cover first. */
  photos: string[];
  answers: Record<string, Score>;
  safety: Record<string, string>;
  /** Foods to avoid: chip names and typed ones, lowercase. */
  foods: string[];
  intro: string;
  /** What the owner said about the pet (voice sign-up): suggestions with their quotes, kept so a reload still shows them. */
  voice: VoiceFacts;
  /** The coat color picked, or empty. */
  coat: Coat | "";
  /** What the photo guess found for the cover photo `for` (a public id): breeds to tap and a coat to suggest. */
  photoGuess: { for: string; breeds: string[]; coat: Coat | null } | null;
  /** Chart questions the voice filled in and the owner has not touched yet. They show "suggested". */
  suggested: string[];
  /** The home address as found on the map (a picked suggestion), or empty when only the pin is set. */
  homeAddress: string;
  home: { lat: number; lng: number } | null;
  /** The step the owner is on (a step id from steps.ts), so a reload goes on from there. */
  step: string;
  /** Made at the first save attempt, so a retry updates the same pet instead of adding another. */
  petId: string | null;
};

export const EMPTY_DRAFT: OwnerOnboardingDraft = {
  species: null,
  pending: [],
  ownerDone: false,
  name: "",
  breed: "",
  ageYears: null,
  weight: "",
  weightUnit: "kg",
  petIntro: "",
  photos: [],
  answers: {},
  safety: {},
  foods: [],
  intro: "",
  voice: NO_FACTS,
  coat: "",
  photoGuess: null,
  suggested: [],
  homeAddress: "",
  home: null,
  step: "species",
  petId: null,
};

const key = (userId: string) => `goldito.ownerOnboarding.${userId}`;

export async function loadDraft(userId: string): Promise<OwnerOnboardingDraft> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<OwnerOnboardingDraft>) };
  } catch {
    return EMPTY_DRAFT;
  }
}

export async function saveDraft(userId: string, draft: OwnerOnboardingDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(draft));
  } catch {
    // The draft is a convenience; the flow works without it.
  }
}

export async function clearDraft(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(userId));
  } catch {
    // Nothing to clean up.
  }
}

/** How many pets of each kind the owner has said they have (this pet and the ones still to come). */
export type PetCounts = Record<Species, number>;

/** The most pets of one kind the sign-up takes; more can be added later from the pets list. */
export const MAX_PETS_PER_KIND = 6;

export function petCounts(draft: OwnerOnboardingDraft): PetCounts {
  const all = draft.species ? [draft.species, ...draft.pending] : [...draft.pending];
  return { dog: all.filter((s) => s === "dog").length, cat: all.filter((s) => s === "cat").length };
}

/**
 * The draft after the counts changed. The pets run dogs first, then cats: the first is filled in now, the rest wait.
 * Changing the kind of the first pet clears what was answered for the old one.
 */
export function withPetCounts(draft: OwnerOnboardingDraft, counts: PetCounts): OwnerOnboardingDraft {
  const list: Species[] = [
    ...Array<Species>(Math.min(MAX_PETS_PER_KIND, counts.dog)).fill("dog"),
    ...Array<Species>(Math.min(MAX_PETS_PER_KIND, counts.cat)).fill("cat"),
  ];
  const [species = null, ...pending] = list;
  if (species === draft.species) return { ...draft, pending };
  return { ...draft, species, pending, answers: {}, safety: {}, voice: NO_FACTS, suggested: [], photoGuess: null, coat: "" };
}

/** The draft for the next pet once one is saved: only what the owner said about themselves carries over. */
export function draftForNextPet(draft: OwnerOnboardingDraft): OwnerOnboardingDraft {
  const [species = null, ...pending] = draft.pending;
  return {
    ...EMPTY_DRAFT,
    species,
    pending,
    ownerDone: true,
    intro: draft.intro,
    homeAddress: draft.homeAddress,
    home: draft.home,
    step: "name",
  };
}

/** An approximate birthday for a whole number of years: the same day and month, that many years back. */
export function birthdateFromAge(ageYears: number, today = new Date()): string {
  const date = new Date(today.getFullYear() - ageYears, today.getMonth(), today.getDate());
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function profileFromDraft(draft: OwnerOnboardingDraft): PetProfile {
  return { ...EMPTY_PROFILE, answers: { ...draft.answers }, safety: { ...draft.safety }, ...(draft.coat ? { coat: draft.coat } : {}) };
}

/** Lowercase and unique, as `pet_allergies` stores them. */
export function foodsFromDraft(draft: OwnerOnboardingDraft): string[] {
  return [...new Set(draft.foods.map(normalizeAllergen).filter((f) => f !== ""))];
}

const KG_PER_LB = 0.45359237;

function parseWeight(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

/** The weight in kg as stored (two decimals, like the column), or null when it is empty, not a number or out of range. */
export function weightFromDraft(draft: OwnerOnboardingDraft): number | null {
  const n = parseWeight(draft.weight);
  if (n === null) return null;
  const kg = draft.weightUnit === "lbs" ? Math.round(n * KG_PER_LB * 100) / 100 : n;
  return kg > 0 && kg < 1000 ? kg : null;
}

/** The text of a weight in kg, shown in `unit` (kg to two decimals, lbs to one). */
export function weightText(kg: number, unit: WeightUnit): string {
  return unit === "lbs" ? String(Math.round((kg / KG_PER_LB) * 10) / 10) : String(Math.round(kg * 100) / 100);
}

/** What the box shows after the unit is switched: the typed number in the new unit (a text that is not a number stays). */
export function convertWeight(text: string, from: WeightUnit, to: WeightUnit): string {
  const n = parseWeight(text);
  if (n === null || from === to) return text;
  return weightText(from === "lbs" ? n * KG_PER_LB : n, to);
}
