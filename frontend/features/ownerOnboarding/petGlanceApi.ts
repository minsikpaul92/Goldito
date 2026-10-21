import { getSupabase } from "../../lib/supabase";
import type { Species } from "../../types/db";
import { ageLabel } from "../pets/petFormat";
import { loadPetPhotos } from "./petPhotosApi";
import { PetProfile, glance, parseProfile } from "./scoring";

export type PetGlanceData = {
  id: string;
  name: string;
  species: Species;
  facts: string;
  coverPublicId: string | null;
  profile: PetProfile;
  allergens: string[];
  /** True when there is something to show beyond the name: answers, warnings, or a photo. */
  hasContent: boolean;
};

type Row = {
  id: string;
  species: Species;
  name: string;
  breed: string | null;
  birthdate: string | null;
  weight_kg: number | null;
  profile: unknown;
  pet_allergies: { allergen: string }[] | null;
};

const SPECIES_WORD: Record<Species, string> = { dog: "Dog", cat: "Cat" };

/** "Dog · Maltese · 4 yrs · 6 kg" */
export function glanceFacts(species: Species, breed: string | null, birthdate: string | null, weightKg: number | null): string {
  return [SPECIES_WORD[species], breed, ageLabel(birthdate), weightKg != null ? `${weightKg} kg` : null].filter(Boolean).join(" · ");
}

/**
 * What the "at a glance" card needs for one pet, read as the signed-in person (RLS decides: the owner, a booked or
 * requested sitter, a sitter with an open inquiry). Null when the pet cannot be read; a failure is not shown as an error,
 * the card is a bonus on the screens it sits on.
 */
export async function loadPetGlance(petId: string): Promise<PetGlanceData | null> {
  const { data, error } = await getSupabase()
    .from("pets")
    .select("id, species, name, breed, birthdate, weight_kg, profile, pet_allergies(allergen)")
    .eq("id", petId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  const photos = await loadPetPhotos(petId).catch(() => []);
  const profile = parseProfile(row.profile);
  const allergens = (row.pet_allergies ?? []).map((a) => a.allergen);
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    facts: glanceFacts(row.species, row.breed, row.birthdate, row.weight_kg),
    coverPublicId: photos[0]?.publicId ?? null,
    profile,
    allergens,
    hasContent: !glance(row.species, profile, allergens).empty || photos.length > 0,
  };
}
