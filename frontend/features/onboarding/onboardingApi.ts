import { getSupabase } from "../../lib/supabase";
import { EMPTY_DRAFT, MAX_CUSTOM, OnboardingDraft, toPayload } from "./questions";

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
  const [answers, profile] = await Promise.all([
    supabase
      .from("sitter_profile_answers")
      .select("question_key, question_text, answer, choice, position")
      .eq("sitter_id", userId)
      .order("position"),
    supabase.rpc("get_my_sitter_profile").maybeSingle(),
  ]);
  if (answers.error) fail("load your answers");

  const draft: OnboardingDraft = { ...EMPTY_DRAFT, answers: {}, custom: [] };
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

/** Replace the sitter's answers and intro, and mark onboarding done. */
export async function saveDraft(draft: OnboardingDraft): Promise<void> {
  const { error } = await getSupabase().rpc("save_sitter_answers", {
    p_answers: toPayload(draft),
    p_intro: draft.intro.trim(),
    p_finish: true,
  });
  if (error) fail("save your answers");
}
