import { apiPost } from "../../lib/api";
import type { Species } from "../../types/db";
import { Coat, isCoat } from "./questions";

export type PhotoGuess = { breeds: string[]; coat: Coat | null };

/** The app stops waiting for a guess after this long; a late one is not worth a delay (11.15 §7). */
export const GUESS_TIMEOUT_MS = 15_000;

/**
 * Breed and coat suggestions for the cover photo, or null when there is nothing to offer (another animal, no answer,
 * too slow, a failure). It never throws: the guess is a bonus and the flow goes on without it.
 */
export async function guessFromPhoto(publicId: string, species: Species): Promise<PhotoGuess | null> {
  try {
    const answer = await Promise.race([
      apiPost<{ species_match?: boolean; breeds?: unknown; coat_color?: unknown }>("/api/ai/pet-photo", {
        public_id: publicId,
        species,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), GUESS_TIMEOUT_MS)),
    ]);
    if (!answer || answer.species_match === false) return null;
    const breeds = Array.isArray(answer.breeds)
      ? answer.breeds.filter((b): b is string => typeof b === "string" && b.trim() !== "").slice(0, 3)
      : [];
    const coat = isCoat(answer.coat_color) ? answer.coat_color : null;
    return breeds.length === 0 && !coat ? null : { breeds, coat };
  } catch {
    return null;
  }
}
