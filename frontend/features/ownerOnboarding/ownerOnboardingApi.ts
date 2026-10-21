import { randomUUID } from "expo-crypto";

import { getSupabase } from "../../lib/supabase";
import { completePetPhoto } from "./petPhotosApi";
import {
  OwnerOnboardingDraft,
  birthdateFromAge,
  foodsFromDraft,
  profileFromDraft,
  weightFromDraft,
} from "./draft";

function fail(action: string): never {
  throw new Error(`Couldn't ${action}. Check your connection and try again.`);
}

/**
 * Whether the signed-in owner still has to go through the sign-up questions. Only an explicit null counts (014v gives
 * new owners null and marks everyone who existed before as done), so an unknown answer never traps anyone.
 */
export async function needsOwnerOnboarding(userId: string): Promise<boolean> {
  const { data } = await getSupabase().from("owner_profiles").select("onboarded_at").eq("id", userId).maybeSingle();
  return !!data && (data as { onboarded_at: string | null }).onboarded_at === null;
}

/** "Add a pet later" and the end of the flow both land here. */
export async function markOwnerOnboarded(userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("owner_profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) fail("save your answers");
}

/**
 * Saves the pet with its answers and allergies in one call (create_pet_with_profile, safe to retry with the same id),
 * then adds the photos and marks the owner done. Returns the pet id.
 */
export async function saveOwnerOnboarding(userId: string, draft: OwnerOnboardingDraft, petId: string): Promise<string> {
  if (!draft.species || !draft.name.trim()) fail("save your pet");
  const supabase = getSupabase();
  const { error } = await supabase.rpc("create_pet_with_profile", {
    p_id: petId,
    p_species: draft.species,
    p_name: draft.name.trim(),
    p_breed: draft.breed.trim() || null,
    p_birthdate: draft.ageYears === null ? null : birthdateFromAge(draft.ageYears),
    p_weight_kg: weightFromDraft(draft),
    p_notes: draft.petIntro.trim() || null,
    p_profile: profileFromDraft(draft),
    p_allergens: foodsFromDraft(draft),
  });
  if (error) fail("save your pet");
  // One after the other, so the first photo stays the cover. A retry sends the same photos again and adds nothing twice.
  for (const publicId of draft.photos) {
    try {
      await completePetPhoto(petId, publicId);
    } catch {
      fail("save the photos");
    }
  }
  await markOwnerOnboarded(userId);
  return petId;
}

export function newPetId(): string {
  return randomUUID();
}
