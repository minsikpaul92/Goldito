import { type OwnerOnboardingDraft, weightText } from "./draft";
import type { Score } from "./questions";
import type { VoiceFacts } from "./voiceApi";

/**
 * What the owner's words change in the draft. Only empty fields are filled, the owner's own picks stay. Chart answers
 * are filled and marked "suggested". Safety answers and foods are never filled: they stay in `voice` and each screen
 * shows what was heard for the owner to confirm by tapping.
 */
export function applyVoiceFacts(draft: OwnerOnboardingDraft, facts: VoiceFacts): Partial<OwnerOnboardingDraft> {
  const patch: Partial<OwnerOnboardingDraft> = { voice: facts };
  if (facts.breed && draft.breed.trim() === "") patch.breed = facts.breed.value;
  if (facts.age_years && draft.ageYears === null) patch.ageYears = facts.age_years.value;
  if (facts.weight_kg && draft.weight.trim() === "") patch.weight = weightText(facts.weight_kg.value, draft.weightUnit);

  const answers = { ...draft.answers };
  const suggested = [...draft.suggested];
  for (const [key, fact] of Object.entries(facts.answers)) {
    const score = Number(fact.value);
    // Chart keys are d1..d12 and c1..c10; the safety keys start with s and are left alone.
    if (!/^[dc]\d+$/.test(key) || ![1, 2, 3, 4].includes(score) || answers[key] !== undefined) continue;
    answers[key] = score as Score;
    if (!suggested.includes(key)) suggested.push(key);
  }
  patch.answers = answers;
  patch.suggested = suggested;
  return patch;
}
