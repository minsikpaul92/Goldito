import { FALLBACK_HOURS } from "../schedule/scheduleApi";
import type { CareSlot, ClosingRule, WeekdayHour } from "../schedule/scheduleApi";

/** The numbered questions of sitter onboarding (3D.2, #139). Keys match supabase/migrations/014f. */

export type QuestionChoice = { value: string; label: string };

export type SitterQuestion = {
  key: string;
  prompt: string;
  /** A few fixed choices shown as chips next to the note box. */
  choices?: QuestionChoice[];
  /** Several chips can be on at once (the choice is saved as "small,medium"). */
  multi?: boolean;
};

const YES_NO: QuestionChoice[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const COUNT = (values: number[]): QuestionChoice[] => values.map((n) => ({ value: String(n), label: String(n) }));

export const QUESTIONS: SitterQuestion[] = [
  { key: "multiple_owners", prompt: "Do you look after pets from more than one household at the same time?", choices: YES_NO },
  { key: "max_pets", prompt: "How many pets can you look after at once?", choices: COUNT([1, 2, 3, 4, 5]) },
  { key: "walks_per_day", prompt: "How many walks a day?", choices: COUNT([0, 1, 2, 3, 4]) },
  { key: "meals_per_day", prompt: "How many meals a day?", choices: COUNT([1, 2, 3, 4]) },
  {
    key: "home_all_day",
    prompt: "Are you home all day, or away at work?",
    choices: [
      { value: "home", label: "Home all day" },
      { value: "away", label: "Away at work" },
    ],
  },
  {
    key: "activity",
    prompt: "Are you more active, or mostly relaxed at home?",
    choices: [
      { value: "active", label: "Active" },
      { value: "relaxed", label: "Relaxed" },
    ],
  },
  { key: "park_nearby", prompt: "Is there a park near your home?", choices: YES_NO },
  {
    key: "dog_sizes",
    prompt: "Which dog sizes do you take?",
    multi: true,
    choices: [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" },
    ],
  },
  { key: "cats", prompt: "Do you take cats?", choices: YES_NO },
  {
    key: "handoff",
    prompt: "At drop-off and pick-up, do you collect the pet or does the owner bring it?",
    choices: [
      { value: "sitter_picks_up", label: "I pick up" },
      { value: "owner_brings", label: "Owner brings" },
    ],
  },
];

export const MAX_CUSTOM = 5;
export const MAX_ANSWER = 300;
export const MAX_QUESTION = 120;
export const MAX_INTRO = 600;

export type AnswerDraft = { answer: string; choice: string | null };

export type CustomDraft = { question: string; answer: string };

/** When the sitter hosts: the weekly closing rules and hours of the schedule (014d · 014e), set from the same sheet. */
export type AvailabilityDraft = {
  /** False until the sitter changes something here; untouched, nothing in the schedule is written. */
  touched: boolean;
  rules: ClosingRule[];
  hours: Record<CareSlot, [string, string]>;
  weekdayHours: WeekdayHour[];
};

export type OnboardingDraft = {
  answers: Record<string, AnswerDraft>;
  custom: CustomDraft[];
  intro: string;
  availability: AvailabilityDraft;
  /** Days off added here (YYYY-MM-DD), saved as closed days on the calendar. Days already closed stay in Schedule. */
  daysOff: string[];
};

export function emptyDraft(): OnboardingDraft {
  return {
    answers: {},
    custom: [],
    intro: "",
    availability: { touched: false, rules: [], hours: { ...FALLBACK_HOURS }, weekdayHours: [] },
    daysOff: [],
  };
}

/** "small,large" -> ["small", "large"] */
export function choiceList(choice: string | null | undefined): string[] {
  return choice ? choice.split(",").filter(Boolean) : [];
}

/** The chip label(s) for a saved choice, e.g. "Small, Large"; falls back to the raw value. */
export function choiceLabel(question: SitterQuestion, choice: string | null | undefined): string {
  const labels = choiceList(choice).map((v) => question.choices?.find((c) => c.value === v)?.label ?? v);
  return labels.join(", ");
}

function filled(a: AnswerDraft | undefined): a is AnswerDraft {
  return !!a && (a.answer.trim() !== "" || !!a.choice);
}

/** How many of the built-in questions have an answer or a chip. */
export function answeredCount(draft: OnboardingDraft): number {
  return QUESTIONS.filter((q) => filled(draft.answers[q.key])).length;
}

/** The p_answers list of save_sitter_answers: skipped questions and half-written custom ones are left out. */
export function toPayload(draft: OnboardingDraft): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const q of QUESTIONS) {
    const a = draft.answers[q.key];
    if (!filled(a)) continue;
    const item: Record<string, string> = { key: q.key };
    if (a.answer.trim()) item.answer = a.answer.trim();
    if (a.choice) item.choice = a.choice;
    out.push(item);
  }
  draft.custom.slice(0, MAX_CUSTOM).forEach((c, i) => {
    if (!c.question.trim() || !c.answer.trim()) return;
    out.push({ key: `custom_${i + 1}`, question: c.question.trim(), answer: c.answer.trim() });
  });
  return out;
}
