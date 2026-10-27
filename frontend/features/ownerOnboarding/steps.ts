import type { Species } from "../../types/db";
import { SAFETY_QUESTIONS, chartQuestions } from "./questions";

/**
 * The screens of the flow, one question each (11.15 §3). Ids are stored in the draft: "species", "name", "photos", "voice", "breed", "coat",
 * "age", "weight", "reveal", "petIntro", "about", "q:<chart key>", "s:<safety key>", "foods", "ownerIntro", "location", "summary".
 * An owner with more than one pet goes through the list once per pet. The kind of pet and the questions about the owner
 * are asked on the first run only (`ownerDone` is true from the second pet on). Add pet (`askKind`) asks the kind again.
 * "reveal" (the 8-bit pet) is only there when breed, color and weight are all filled (`reveal`).
 */
export function stepIds(species: Species | null, ownerDone = false, askKind = !ownerDone, reveal = false): string[] {
  const ids = askKind ? ["species"] : [];
  if (!species) return ids;
  ids.push("name", "photos", "voice", "breed", "coat", "age", "weight");
  if (reveal) ids.push("reveal");
  ids.push("petIntro", "about");
  for (const q of chartQuestions(species)) ids.push(`q:${q.key}`);
  for (const q of SAFETY_QUESTIONS) ids.push(`s:${q.key}`);
  ids.push("foods");
  if (!ownerDone) ids.push("ownerIntro", "location");
  ids.push("summary");
  return ids;
}

/** A saved step id that no longer exists (the species changed) falls back to the first screen. */
export function stepIndex(ids: string[], step: string): number {
  const i = ids.indexOf(step);
  return i < 0 ? 0 : i;
}

/** Share of the way through, 0 to 1. */
export function progress(ids: string[], step: string): number {
  return ids.length <= 1 ? 0 : stepIndex(ids, step) / (ids.length - 1);
}
