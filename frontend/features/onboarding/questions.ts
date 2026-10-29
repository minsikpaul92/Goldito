import { FALLBACK_HOURS, SLOTS } from "../schedule/scheduleApi";
import type {
  CareSlot,
  ClosingRule,
  WeekdayHour,
} from "../schedule/scheduleApi";

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

/** The last chip reads "4+" and saves the digit, so it means "at least" (close enough for an owner choosing a sitter). */
const COUNT = (values: number[]): QuestionChoice[] =>
  values.map((n, i) => ({
    value: String(n),
    label: i === values.length - 1 ? `${n}+` : String(n),
  }));

export const QUESTIONS: SitterQuestion[] = [
  {
    key: "custom_1",
    prompt: "Do you have your own pets at home?",
    choices: YES_NO,
  },
  {
    key: "multiple_owners",
    prompt: "Do you take pets from multiple families?",
    choices: YES_NO,
  },
  {
    key: "max_pets",
    prompt: "How many pets can you host at once?",
    choices: COUNT([1, 2, 3]),
  },
  {
    key: "walks_per_day",
    prompt: "How many walks do you provide a day?",
    choices: COUNT([1, 2, 3]),
  },
  {
    key: "activity",
    prompt: "How active is your home?",
    choices: [
      { value: "active", label: "Active" },
      { value: "relaxed", label: "Relaxed" },
    ],
  },
  {
    key: "park_nearby",
    prompt: "Do you have a fenced yard or outdoor space?",
    choices: YES_NO,
  },
  {
    key: "dog_sizes",
    prompt: "What dog sizes do you take?",
    multi: true,
    choices: [
      { value: "small", label: "Small (<15 lbs / 7 kg)" },
      { value: "medium", label: "Medium (16 to 40 lbs / 7 to 18 kg)" },
      { value: "large", label: "Large (41+ lbs / 18+ kg)" },
    ],
  },
  { key: "cats", prompt: "Do you take cats?", choices: YES_NO },
  {
    key: "handoff",
    prompt: "How do pick-up and drop-off work?",
    multi: true,
    choices: [
      { value: "sitter_picks_up", label: "I can pick up" },
      { value: "owner_brings", label: "Owner drops off" },
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
};

export function emptyDraft(): OnboardingDraft {
  return {
    answers: {},
    custom: [],
    intro: "",
    availability: {
      touched: false,
      rules: [],
      hours: { ...FALLBACK_HOURS },
      weekdayHours: [],
    },
  };
}

/** "small,large" -> ["small", "large"] */
export function choiceList(choice: string | null | undefined): string[] {
  return choice ? choice.split(",").filter(Boolean) : [];
}

/** The chip label(s) for a saved choice, e.g. "Small, Large"; falls back to the raw value. */
export function choiceLabel(
  question: SitterQuestion,
  choice: string | null | undefined,
): string {
  const labels = choiceList(choice).map(
    (v) => question.choices?.find((c) => c.value === v)?.label ?? v,
  );
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
    out.push({
      key: `custom_${i + 1}`,
      question: c.question.trim(),
      answer: c.answer.trim(),
    });
  });
  return out;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Open every day" or "Closed: Sat, Sun night." in the same words as the rules sheet. */
export function availabilitySummary(
  a: OnboardingDraft["availability"],
): string {
  if (a.rules.length === 0 && a.weekdayHours.length === 0)
    return "Open every day.";
  const parts = SLOTS.map(({ slot, label }) => {
    const days = a.rules
      .filter((r) => r.slot === slot)
      .map((r) => WEEKDAY_SHORT[r.weekday]);
    return days.length ? `${days.join(", ")} ${label.toLowerCase()}` : null;
  }).filter(Boolean);
  const closed = parts.length
    ? `Closed: ${parts.join("; ")}.`
    : "Open every day.";
  return a.weekdayHours.length
    ? `${closed} Some weekdays have their own hours.`
    : closed;
}
