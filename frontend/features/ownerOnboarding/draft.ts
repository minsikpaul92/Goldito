import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Species } from "../../types/db";
import { normalizeAllergen } from "../pets/petValidation";
import { EMPTY_PROFILE, PetProfile } from "./scoring";
import type { Score } from "./questions";

/** Everything the owner has typed or picked so far. Kept on the device after every answer, so a reload goes on. */
export type OwnerOnboardingDraft = {
  species: Species | null;
  name: string;
  breed: string;
  /** Whole years, or null when skipped. Saved as an approximate birthday. */
  ageYears: number | null;
  weightKg: string;
  petIntro: string;
  /** Cloudinary public ids of uploaded pet photos, cover first. */
  photos: string[];
  answers: Record<string, Score>;
  safety: Record<string, string>;
  /** Foods to avoid: chip names and typed ones, lowercase. */
  foods: string[];
  intro: string;
  /** The step the owner is on (a step id from steps.ts), so a reload goes on from there. */
  step: string;
  /** Made at the first save attempt, so a retry updates the same pet instead of adding another. */
  petId: string | null;
};

export const EMPTY_DRAFT: OwnerOnboardingDraft = {
  species: null,
  name: "",
  breed: "",
  ageYears: null,
  weightKg: "",
  petIntro: "",
  photos: [],
  answers: {},
  safety: {},
  foods: [],
  intro: "",
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

/** An approximate birthday for a whole number of years: the same day and month, that many years back. */
export function birthdateFromAge(ageYears: number, today = new Date()): string {
  const date = new Date(today.getFullYear() - ageYears, today.getMonth(), today.getDate());
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function profileFromDraft(draft: OwnerOnboardingDraft): PetProfile {
  return { ...EMPTY_PROFILE, answers: { ...draft.answers }, safety: { ...draft.safety } };
}

/** Lowercase and unique, as `pet_allergies` stores them. */
export function foodsFromDraft(draft: OwnerOnboardingDraft): string[] {
  return [...new Set(draft.foods.map(normalizeAllergen).filter((f) => f !== ""))];
}

export function weightFromDraft(draft: OwnerOnboardingDraft): number | null {
  const n = Number(draft.weightKg.trim().replace(",", "."));
  return draft.weightKg.trim() !== "" && Number.isFinite(n) && n > 0 && n < 1000 ? n : null;
}
