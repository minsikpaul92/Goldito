import { type OwnerOnboardingDraft, weightText } from "./draft";
import type { VoiceFacts } from "./voiceApi";

/** The intro the owner's words make: what the pet is like first, then the other items with a short label. */
const INTRO_LINES: [key: string, label: string | null][] = [
  ["personality", null],
  ["eats", "Eats"],
  ["likes", "Likes"],
  ["dislikes", "Dislikes"],
  ["careful", "Careful with"],
];

/** What the owner said, one line per item, as they said it. Empty when nothing was said. */
export function introFromNotes(notes: VoiceFacts["notes"], max: number): string {
  const lines = INTRO_LINES.flatMap(([key, label]) => {
    const said = notes[key]?.value.trim();
    return said ? [label ? `${label}: ${said}` : said] : [];
  });
  return lines.join("\n").slice(0, max);
}

/** Longest intro the owner can keep (the "About" screen cuts typing at the same length). */
export const MAX_PET_INTRO = 500;

/**
 * What the owner's words change in the draft. Only empty fields are filled, the owner's own picks stay. The intro is
 * the owner's own words for the free-text items. Safety answers and foods are never filled: they stay in `voice` and
 * each screen shows what was heard for the owner to confirm by tapping. The personality chart is tapped, not spoken.
 */
export function applyVoiceFacts(draft: OwnerOnboardingDraft, facts: VoiceFacts): Partial<OwnerOnboardingDraft> {
  const patch: Partial<OwnerOnboardingDraft> = { voice: facts };
  if (facts.breed && draft.breed.trim() === "") patch.breed = facts.breed.value;
  if (facts.age_years && draft.ageYears === null) patch.ageYears = facts.age_years.value;
  if (facts.weight_kg && draft.weight.trim() === "") patch.weight = weightText(facts.weight_kg.value, draft.weightUnit);

  const intro = introFromNotes(facts.notes ?? {}, MAX_PET_INTRO);
  if (intro && draft.petIntro.trim() === "") patch.petIntro = intro;
  return patch;
}
