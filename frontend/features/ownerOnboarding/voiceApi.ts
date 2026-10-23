import { apiPost, apiPostFile } from "../../lib/api";
import { SAFETY_QUESTIONS, fill } from "./questions";
import type { Species } from "../../types/db";

export type Fact<T> = { value: T; quote: string };

/** What the owner said, as suggestions: nothing in here is saved until the owner keeps it on a screen. */
export type VoiceFacts = {
  breed: Fact<string> | null;
  age_years: Fact<number> | null;
  weight_kg: Fact<number> | null;
  foods: Fact<string>[];
  /** Safety keys ("s1") with the option value. The personality chart is tapped, never spoken. */
  answers: Record<string, Fact<string>>;
  /** The owner's own words for the free-text items of the numbered list, by item (see VOICE_GUIDE). */
  notes: Record<string, Fact<string>>;
};

export const NO_FACTS: VoiceFacts = { breed: null, age_years: null, weight_kg: null, foods: [], answers: {}, notes: {} };

/** The recording to text. The text is shown to the owner, who can fix it. */
export async function transcribeRecording(recording: Blob): Promise<string> {
  const { transcript } = await apiPostFile<{ transcript: string }>("/api/ai/pet-voice/transcribe", recording);
  return transcript;
}

/** The safety questions still open, in the shape the server wants (the app is the one source of the wording). */
export function openQuestions(name: string, safety: Record<string, string>) {
  return SAFETY_QUESTIONS.filter((q) => !safety[q.key]).map((q) => ({
    key: q.key,
    prompt: fill(q.prompt, name),
    options: q.options,
  }));
}

/** Facts from the (fixed) text. Fails with the server's message, which already says what to do instead. */
export async function extractFacts(
  species: Species,
  name: string,
  transcript: string,
  questions: ReturnType<typeof openQuestions>,
): Promise<VoiceFacts> {
  const facts = await apiPost<Partial<VoiceFacts>>("/api/ai/pet-voice", { species, name, transcript, questions });
  return {
    breed: facts.breed ?? null,
    age_years: facts.age_years ?? null,
    weight_kg: facts.weight_kg ?? null,
    foods: facts.foods ?? [],
    answers: facts.answers ?? {},
    notes: facts.notes ?? {},
  };
}
