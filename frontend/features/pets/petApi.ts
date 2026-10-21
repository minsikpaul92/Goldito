import { randomUUID } from "expo-crypto";

import { getSupabase } from "../../lib/supabase";
import { Pet, Species } from "../../types/db";
import { Coat, isCoat } from "../ownerOnboarding/questions";
import { asPixelHead, type PixelHead } from "./sprites/pixelize";

const PET_COLUMNS =
  "id, owner_id, species, name, breed, birthdate, weight_kg, notes, profile, created_at, pet_allergies(id, allergen)";

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

export type PetLook = { coat: Coat | null; head: PixelHead | null };

/** How the pet room draws the pet: the coat color the owner picked and the head made from a photo (`pets.profile`). */
export async function getPetLook(petId: string): Promise<PetLook> {
  const { data, error } = await getSupabase().from("pets").select("profile").eq("id", petId).maybeSingle();
  if (error || !data) return { coat: null, head: null };
  const profile = (data as { profile?: { coat?: unknown; pixel_head?: unknown } | null }).profile;
  return { coat: isCoat(profile?.coat) ? profile.coat : null, head: asPixelHead(profile?.pixel_head) };
}

/**
 * Save the pixel head made from a photo into `pets.profile.pixel_head`, or remove it (`null`) to go back to the preset.
 * The owner may update `profile` (grant in 014v, pets_update); the rest of the profile is kept.
 */
export async function savePixelHead(petId: string, head: PixelHead | null): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("pets").select("profile").eq("id", petId).maybeSingle();
  if (error || !data) fail("save the pixel pet");
  const { pixel_head: _old, ...rest } = ((data as { profile?: Record<string, unknown> | null }).profile ?? {}) as Record<string, unknown>;
  const profile = head ? { ...rest, pixel_head: head } : rest;
  const { error: saveError } = await supabase.from("pets").update({ profile }).eq("id", petId);
  if (saveError) fail("save the pixel pet");
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
