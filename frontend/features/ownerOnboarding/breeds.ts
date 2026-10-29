import type { Species } from "../../types/db";

/**
 * The breeds with reviewed care needs (backend `app/data/breed_needs.json`; keep the two lists in step). Add pet offers
 * them as a searchable list; any other breed can still be typed (it then has no needs card).
 */
export const PRESET_BREEDS: Record<Species, string[]> = {
  dog: [
    "Labrador Retriever",
    "Golden Retriever",
    "German Shepherd",
    "Poodle",
    "Bulldog",
    "Beagle",
    "Rottweiler",
    "Dachshund",
    "Pembroke Welsh Corgi",
    "Siberian Husky",
    "Shih Tzu",
    "Chihuahua",
    "Maltese",
    "Pomeranian",
    "Yorkshire Terrier",
    "Boston Terrier",
    "Cavalier King Charles Spaniel",
    "Australian Shepherd",
    "Border Collie",
    "French Bulldog",
  ],
  cat: ["Domestic Shorthair", "Domestic Longhair", "Maine Coon", "Ragdoll", "Bengal", "Siamese", "Persian", "British Shorthair"],
};

/** Presets that contain what was typed (all of them for an empty box), A to Z. */
export function matchBreeds(species: Species, typed: string): string[] {
  const query = typed.trim().toLowerCase();
  return [...PRESET_BREEDS[species]].filter((breed) => breed.toLowerCase().includes(query)).sort((a, b) => a.localeCompare(b));
}
