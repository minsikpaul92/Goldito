import { Pet, Species } from "../../types/db";
import { PetInput } from "./petApi";

export const MAX_NAME_LENGTH = 40;
export const MAX_ALLERGEN_LENGTH = 40;

/** What the form fields hold (all text, as typed). */
export type PetFormValues = {
  species: Species | null;
  name: string;
  breed: string;
  birthdate: string;
  weight: string;
  notes: string;
  allergens: string[];
};

export type PetFormErrors = Partial<Record<"species" | "name" | "birthdate" | "weight", string>>;

export const EMPTY_PET_FORM: PetFormValues = {
  species: null,
  name: "",
  breed: "",
  birthdate: "",
  weight: "",
  notes: "",
  allergens: [],
};

export function petToFormValues(pet: Pet): PetFormValues {
  return {
    species: pet.species,
    name: pet.name,
    breed: pet.breed ?? "",
    birthdate: pet.birthdate ?? "",
    weight: pet.weight_kg != null ? String(pet.weight_kg) : "",
    notes: pet.notes ?? "",
    allergens: pet.pet_allergies.map((a) => a.allergen.toLowerCase()),
  };
}

/** Allergies are stored lowercase (phase-03 3.5): " Chicken  Fat " → "chicken fat". */
export function normalizeAllergen(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function validatePet(
  values: PetFormValues,
  today = new Date(),
): { errors: PetFormErrors; input: PetInput | null } {
  const errors: PetFormErrors = {};
  const name = values.name.trim();
  const birthdate = values.birthdate.trim();
  const weight = values.weight.trim().replace(",", ".");

  if (!values.species) errors.species = "Choose dog or cat.";
  if (!name) errors.name = "Enter your pet's name.";
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Keep the name under ${MAX_NAME_LENGTH} characters.`;

  if (birthdate && !isRealDate(birthdate)) {
    errors.birthdate = "Use YYYY-MM-DD, e.g. 2022-04-15.";
  } else if (birthdate && new Date(`${birthdate}T00:00:00`) > today) {
    errors.birthdate = "The birthday can't be in the future.";
  }

  const weightKg = weight === "" ? null : Number(weight);
  if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg >= 1000)) {
    errors.weight = "Enter the weight in kg, e.g. 3.2.";
  }

  if (Object.keys(errors).length > 0 || !values.species) return { errors, input: null };
  return {
    errors,
    input: {
      species: values.species,
      name,
      breed: blankToNull(values.breed),
      birthdate: blankToNull(birthdate),
      weightKg,
      notes: blankToNull(values.notes),
      allergens: values.allergens,
    },
  };
}
