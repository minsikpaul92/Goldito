import { getSupabase } from "./supabase";

/** Photo request (Phase 11.1, 014): the owner asks the sitter on duty for a photo; the next shared photo answers it. */
export type PhotoRequest = { id: string; pet_id: string; status: "open" | "fulfilled"; created_at: string };

const MESSAGES: Record<string, string> = {
  not_in_care: "You can ask for a photo while a sitter is caring for this pet.",
  not_allowed: "You can't ask for a photo of this pet.",
};

/** The pet's open ask, if any (RLS: only the owner who asked and the asked sitter see it). */
export async function getOpenPhotoRequest(petId: string): Promise<PhotoRequest | null> {
  const { data, error } = await getSupabase()
    .from("photo_requests")
    .select("id, pet_id, status, created_at")
    .eq("pet_id", petId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PhotoRequest | null) ?? null;
}

/** Asks the sitter on duty; asking again returns the ask that is already open. */
export async function requestPhoto(petId: string): Promise<PhotoRequest> {
  const { data, error } = await getSupabase().rpc("request_photo", { p_pet: petId });
  if (error) {
    const code = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    throw new Error(code ? MESSAGES[code] : "Couldn't send the request. Check your connection and try again.");
  }
  return data as PhotoRequest;
}
