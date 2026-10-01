import { randomUUID } from "expo-crypto";

import { getSupabase } from "../../lib/supabase";
import { Pet, Species } from "../../types/db";

const PET_COLUMNS =
  "id, owner_id, species, name, breed, birthdate, weight_kg, notes, created_at, pet_allergies(id, allergen)";

export type PetInput = {
  species: Species;
  name: string;
  breed: string | null;
  birthdate: string | null;
  weightKg: number | null;
  notes: string | null;
  /** Lowercase, unique (phase-03 3.5). */
  allergens: string[];
};

function fail(action: string): never {
  throw new Error(`Couldn't ${action}. Check your connection and try again.`);
}

export async function listMyPets(ownerId: string): Promise<Pet[]> {
  const { data, error } = await getSupabase()
    .from("pets")
    .select(PET_COLUMNS)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (error) fail("load your pets");
  return (data ?? []) as Pet[];
}

export async function getPet(petId: string): Promise<Pet | null> {
  const { data, error } = await getSupabase().from("pets").select(PET_COLUMNS).eq("id", petId).maybeSingle();
  if (error) fail("load this pet");
  return data as Pet | null;
}

/**
 * Insert the pet, then its allergies. RLS: owner_id must be the caller (pets_insert).
 * The id is made here and the insert returns nothing: pets_select checks access through
 * a function that reads `pets`, which cannot see a row inserted by the same statement,
 * so insert(...).select() could be refused.
 */
export async function createPet(ownerId: string, input: PetInput): Promise<string> {
  const supabase = getSupabase();
  const petId = randomUUID();
  const { error } = await supabase.from("pets").insert({
    id: petId,
    owner_id: ownerId,
    species: input.species,
    name: input.name,
    breed: input.breed,
    birthdate: input.birthdate,
    weight_kg: input.weightKg,
    notes: input.notes,
  });
  if (error) fail("save this pet");

  if (input.allergens.length > 0) {
    const { error: allergyError } = await supabase
      .from("pet_allergies")
      .insert(input.allergens.map((allergen) => ({ pet_id: petId, allergen })));
    if (allergyError) fail("save the allergies");
  }
  return petId;
}

/** Species is not sent: it can't change after creation (D22, column grants in 002). */
export async function updatePet(pet: Pet, input: PetInput): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("pets")
    .update({
      name: input.name,
      breed: input.breed,
      birthdate: input.birthdate,
      weight_kg: input.weightKg,
      notes: input.notes,
    })
    .eq("id", pet.id);
  if (error) fail("save this pet");

  const current = new Map(pet.pet_allergies.map((a) => [a.allergen.toLowerCase(), a.id]));
  const removedIds = [...current].filter(([name]) => !input.allergens.includes(name)).map(([, id]) => id);
  const added = input.allergens.filter((name) => !current.has(name));

  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase.from("pet_allergies").delete().in("id", removedIds);
    if (deleteError) fail("update the allergies");
  }
  if (added.length > 0) {
    const { error: insertError } = await supabase
      .from("pet_allergies")
      .insert(added.map((allergen) => ({ pet_id: pet.id, allergen })));
    if (insertError) fail("update the allergies");
  }
}
