import { apiPost } from "../../lib/api";
import { QUESTIONS } from "./questions";

export type Pick = { value: string; quote: string };

/**
 * Picks for the onboarding questions from what the sitter said, each with the words it rests on. A failure carries the
 * server's message, which already says to answer the questions yourself.
 */
export async function extractSitterAnswers(transcript: string): Promise<Record<string, Pick>> {
  const { answers } = await apiPost<{ answers?: Record<string, Pick> }>("/api/ai/sitter-voice", {
    transcript,
    questions: QUESTIONS.map((q) => ({
      key: q.key,
      prompt: q.prompt,
      multi: !!q.multi,
      options: (q.choices ?? []).map((c) => ({ value: c.value, label: c.label })),
    })),
  });
  return answers ?? {};
}
