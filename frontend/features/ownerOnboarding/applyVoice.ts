import { normalizeAllergen } from "../pets/petValidation";
import { type OwnerOnboardingDraft, weightText } from "./draft";
import { NO_FACTS, type VoiceFacts } from "./voiceApi";
import type { InterviewItem } from "../../components/ownerOnboarding/VoiceInterview";

/** Longest intro the owner can keep (the "About" screen cuts typing at the same length). */
export const MAX_PET_INTRO = 500;

/** The questions the owner is asked about the pet, in order: read out while talking, and one box each on the form. */
export function voiceItems(name: string, unit: OwnerOnboardingDraft["weightUnit"]): InterviewItem[] {
  return [
    { key: "breed", question: `What breed is ${name}?`, placeholder: "A mix is fine" },
    { key: "age", question: `How old is ${name}?`, placeholder: "Years" },
    { key: "weight", question: `How much does ${name} weigh?`, placeholder: unit },
    { key: "eats", question: `What does ${name} eat?`, multiline: true },
    { key: "allergies", question: `Is ${name} allergic to anything?`, placeholder: "Foods, with commas" },
    { key: "personality", question: `What is ${name} like?`, multiline: true },
    { key: "likes", question: `What does ${name} love?`, multiline: true },
    { key: "dislikes", question: `What does ${name} dislike?`, multiline: true },
    { key: "careful", question: "What should we be careful with?", multiline: true },
  ];
}

/** The answers read from the words said, one text per question, for the owner to fix. */
export function formFromFacts(facts: VoiceFacts, unit: OwnerOnboardingDraft["weightUnit"]): Record<string, string> {
  const note = (key: string) => facts.notes?.[key]?.value ?? "";
  return {
    breed: facts.breed?.value ?? "",
    age: facts.age_years ? String(facts.age_years.value) : "",
    weight: facts.weight_kg ? weightText(facts.weight_kg.value, unit) : "",
    eats: note("eats"),
    allergies: facts.foods.map((food) => food.value).join(", "),
    personality: note("personality"),
    likes: note("likes"),
    dislikes: note("dislikes"),
    careful: note("careful"),
  };
}

/** The intro the answers make: what the pet is like first, then the other items with a short label. */
export function introFromForm(values: Record<string, string>, max: number): string {
  const lines: [key: string, label: string | null][] = [
    ["personality", null],
    ["eats", "Eats"],
    ["likes", "Likes"],
    ["dislikes", "Dislikes"],
    ["careful", "Careful with"],
  ];
  return lines
    .flatMap(([key, label]) => {
      const said = (values[key] ?? "").replace(/\s+/g, " ").trim();
      return said ? [label ? `${label}: ${said}` : said] : [];
    })
    .join("\n")
    .slice(0, max);
}

/**
 * What the answers the owner kept change in the draft. A box left empty changes nothing. The owner read and fixed these
 * boxes, so what is in them is theirs, allergies included. `facts` (null when they typed) stays in `voice`, so the
 * safety answers heard are shown for the owner to confirm by tapping. The personality chart is tapped, not spoken.
 */
export function applyVoiceForm(
  draft: OwnerOnboardingDraft,
  values: Record<string, string>,
  facts: VoiceFacts | null,
): Partial<OwnerOnboardingDraft> {
  const patch: Partial<OwnerOnboardingDraft> = { voice: facts ?? NO_FACTS };

  const breed = (values.breed ?? "").trim();
  if (breed) patch.breed = breed;

  const age = (values.age ?? "").match(/\d{1,2}/);
  if (age && Number(age[0]) <= 30) patch.ageYears = Number(age[0]);

  const weight = (values.weight ?? "").trim();
  if (weight) patch.weight = weight;

  const allergies = (values.allergies ?? "")
    .split(/[,\n]/)
    .map(normalizeAllergen)
    .filter(Boolean);
  if (allergies.length > 0) {
    patch.foods = [...new Set([...draft.foods, ...allergies])];
    // Allergies always get one more look on the foods screen before they count.
    patch.foodsChecked = false;
    // The foods question is answered as "listed", the same as tapping a chip.
    patch.safety = { ...draft.safety, s6: "listed" };
  }

  const intro = introFromForm(values, MAX_PET_INTRO);
  if (intro) patch.petIntro = intro;
  return patch;
}
