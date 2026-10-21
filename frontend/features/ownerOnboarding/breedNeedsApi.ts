import { useEffect, useState } from "react";

import { apiPost } from "../../lib/api";
import type { Species } from "../../types/db";

export type BreedNeeds = {
  chips: { kind: "exercise" | "grooming" | "care"; text: string; source: number }[];
  sources: { title: string; url: string }[];
  /** The breed the lookup was made for when it differs from what the owner wrote ("Poodle mix" is looked up as "Poodle"). */
  basis: string | null;
};

export const NEEDS_LABEL = { exercise: "Exercise", grooming: "Grooming", care: "Watch for" } as const;

/**
 * What a breed needs, in up to three lines with their sources, or null when there is nothing to show (no breed, a
 * lookup that found nothing, a failure). It never throws: the card is complete without it.
 */
export async function loadBreedNeeds(species: Species, breed: string): Promise<BreedNeeds | null> {
  const text = breed.trim();
  if (text.length < 2) return null;
  try {
    const answer = await apiPost<{ chips?: BreedNeeds["chips"]; sources?: BreedNeeds["sources"]; basis?: string | null }>(
      "/api/breed-needs",
      { species, breed: text },
    );
    if (!answer.chips || answer.chips.length === 0) return null;
    return { chips: answer.chips, sources: answer.sources ?? [], basis: answer.basis ?? null };
  } catch {
    return null;
  }
}

/** The needs of a breed once it is known (the card fills in a moment later; nothing waits for it). */
export function useBreedNeeds(species: Species | null, breed: string | null): BreedNeeds | null {
  const [needs, setNeeds] = useState<BreedNeeds | null>(null);
  useEffect(() => {
    setNeeds(null);
    if (!species || !breed || breed.trim().length < 2) return;
    let live = true;
    // A short pause, so typing a breed does not search for every letter.
    const timer = setTimeout(() => {
      void loadBreedNeeds(species, breed).then((n) => live && setNeeds(n));
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [species, breed]);
  return needs;
}
