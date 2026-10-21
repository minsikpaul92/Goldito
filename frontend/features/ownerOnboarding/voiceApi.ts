import { apiPost, apiPostFile } from "../../lib/api";
import { SAFETY_QUESTIONS, Score, chartQuestions, fill } from "./questions";
import type { Species } from "../../types/db";

export type Fact<T> = { value: T; quote: string };

/** What the owner said, as suggestions: nothing in here is saved until the owner keeps it on a screen. */
export type VoiceFacts = {
  breed: Fact<string> | null;
  age_years: Fact<number> | null;
  weight_kg: Fact<number> | null;
  foods: Fact<string>[];
  /** Chart keys ("d4") with the option position as text ("3"), and safety keys ("s1") with the option value. */
  answers: Record<string, Fact<string>>;
};

export const NO_FACTS: VoiceFacts = { breed: null, age_years: null, weight_kg: null, foods: [], answers: {} };

/** The recording to text. The text is shown to the owner, who can fix it. */
export async function transcribeRecording(recording: Blob): Promise<string> {
  const { transcript } = await apiPostFile<{ transcript: string }>("/api/ai/pet-voice/transcribe", recording);
  return transcript;
}

/** The questions still open, in the shape the server wants (the app is the one source of the wording). */
export function openQuestions(species: Species, name: string, answers: Record<string, Score>, safety: Record<string, string>) {
  const chart = chartQuestions(species)
    .filter((q) => answers[q.key] === undefined)
    .map((q) => ({
      key: q.key,
      prompt: fill(q.prompt, name),
      options: q.options.map((label, i) => ({ value: String(i + 1), label })),
    }));
  const safe = SAFETY_QUESTIONS.filter((q) => !safety[q.key]).map((q) => ({
    key: q.key,
    prompt: fill(q.prompt, name),
    options: q.options,
  }));
  return [...chart, ...safe];
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
  };
}
