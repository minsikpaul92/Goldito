import type { Species } from "../../types/db";
import { SAFETY_QUESTIONS, chartQuestions } from "./questions";

/**
 * The screens of the flow, one question each (11.15 §3). Ids are stored in the draft: "species", "name", "photos", "breed",
 * "age", "weight", "petIntro", "q:<chart key>", "s:<safety key>", "foods", "summary".
 */
export function stepIds(species: Species | null): string[] {
  const ids = ["species"];
  if (!species) return ids;
  ids.push("name", "photos", "breed", "age", "weight", "petIntro");
  for (const q of chartQuestions(species)) ids.push(`q:${q.key}`);
  for (const q of SAFETY_QUESTIONS) ids.push(`s:${q.key}`);
  ids.push("foods", "summary");
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
