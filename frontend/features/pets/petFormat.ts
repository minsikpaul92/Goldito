import { Pet, Species } from "../../types/db";

export const SPECIES_EMOJI: Record<Species, string> = { dog: "🐶", cat: "🐱" };
export const SPECIES_LABEL: Record<Species, string> = { dog: "Dog", cat: "Cat" };

/** "4 yrs" / "8 mos" / "3 wks" from YYYY-MM-DD, or null. */
export function ageLabel(birthdate: string | null, today = new Date()): string | null {
  if (!birthdate) return null;
  const born = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  let months = (today.getFullYear() - born.getFullYear()) * 12 + (today.getMonth() - born.getMonth());
  if (today.getDate() < born.getDate()) months -= 1;
  if (months >= 24) return `${Math.floor(months / 12)} yrs`;
  if (months >= 12) return "1 yr";
  if (months >= 1) return `${months} mo${months === 1 ? "" : "s"}`;
  const weeks = Math.max(0, Math.floor((today.getTime() - born.getTime()) / (7 * 24 * 3600 * 1000)));
  return `${weeks} wk${weeks === 1 ? "" : "s"}`;
}

/** "Dog · Maltese · 4 yrs · 3.2 kg" */
export function describePet(pet: Pet): string {
  return [
    SPECIES_LABEL[pet.species],
    pet.breed,
    ageLabel(pet.birthdate),
    pet.weight_kg != null ? `${pet.weight_kg} kg` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
