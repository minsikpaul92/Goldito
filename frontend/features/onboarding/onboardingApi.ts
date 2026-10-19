import { getSupabase } from "../../lib/supabase";
import {
  SLOTS,
  loadClosingRules,
  loadSitterDefaults,
  loadWeekdayHours,
  saveClosingRules,
  saveDefaultHours,
  saveWeekdayHours,
} from "../schedule/scheduleApi";
import { MAX_CUSTOM, OnboardingDraft, emptyDraft, toPayload } from "./questions";

type AnswerRow = {
  question_key: string;
  question_text: string | null;
  answer: string | null;
  choice: string | null;
  position: number;
};

function fail(action: string): never {
  throw new Error(`Couldn't ${action}. Check your connection and try again.`);
}

/**
 * Whether the signed-in sitter still has to go through onboarding. Only an explicit null counts (014f gives new
 * sitters null and marks everyone who existed before as done), so an unknown answer never traps anyone.
 */
export async function needsOnboarding(userId: string): Promise<boolean> {
  const { data } = await getSupabase().from("sitter_profiles").select("onboarded_at").eq("id", userId).maybeSingle();
  return !!data && (data as { onboarded_at: string | null }).onboarded_at === null;
}

/** The sitter's saved answers and intro, as an editable draft. */
export async function loadDraft(userId: string): Promise<OnboardingDraft> {
  const supabase = getSupabase();
  const [answers, profile, rules, weekdayHours, defaults] = await Promise.all([
    supabase
      .from("sitter_profile_answers")
      .select("question_key, question_text, answer, choice, position")
      .eq("sitter_id", userId)
      .order("position"),
    supabase.rpc("get_my_sitter_profile").maybeSingle(),
    loadClosingRules(userId),
    loadWeekdayHours(userId),
    loadSitterDefaults(),
  ]);
  if (answers.error) fail("load your answers");

  const draft = emptyDraft();
  draft.availability = { touched: false, rules, hours: defaults.hours, weekdayHours };
  for (const row of (answers.data ?? []) as AnswerRow[]) {
    if (row.question_key.startsWith("custom_")) {
      draft.custom.push({ question: row.question_text ?? "", answer: row.answer ?? "" });
    } else {
      draft.answers[row.question_key] = { answer: row.answer ?? "", choice: row.choice };
    }
  }
  draft.custom = draft.custom.slice(0, MAX_CUSTOM);
  draft.intro = ((profile.data as { bio: string | null } | null)?.bio ?? "").trim();
  return draft;
}

/**
 * Replace the sitter's answers and intro and mark onboarding done, then write what they changed in "When can you host?":
 * the weekly rules and hours. The schedule is only touched when they set something there.
 */
export async function saveDraft(userId: string, draft: OnboardingDraft, savedHours: OnboardingDraft["availability"]["hours"]): Promise<void> {
  const { error } = await getSupabase().rpc("save_sitter_answers", {
    p_answers: toPayload(draft),
    p_intro: draft.intro.trim(),
    p_finish: true,
  });
  if (error) fail("save your answers");

  const { availability } = draft;
  if (availability.touched) {
    await saveClosingRules(availability.rules);
    if (SLOTS.some(({ slot }) => availability.hours[slot][0] !== savedHours[slot][0] || availability.hours[slot][1] !== savedHours[slot][1])) {
      await saveDefaultHours(userId, availability.hours);
    }
    await saveWeekdayHours(availability.weekdayHours);
  }
}
