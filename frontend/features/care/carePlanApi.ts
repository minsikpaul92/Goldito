import { ApiError, apiPost } from "../../lib/api";
import { getSupabase } from "../../lib/supabase";
import type { CareTaskType } from "../../types/db";

/** What `POST /api/ai/care-plan` returns: a draft the owner reviews (nothing is saved yet). */
export type CarePlanResponse = {
  tasks: { type: CareTaskType; time: string; title: string; dose: string | null; notes: string | null }[];
  cautions: string[];
  skipped: { type: string; title: string; reason: string }[];
  model: string;
  latency_ms: number;
};

/** One checklist row while the owner edits it (strings, so text fields can hold them). */
export type DraftTask = {
  key: string;
  type: CareTaskType;
  /** "HH:MM" */
  time: string;
  title: string;
  dose: string;
  notes: string;
};

export const CARE_REQUEST_MAX = 2000;

export async function makeCarePlan(petId: string, text: string): Promise<CarePlanResponse> {
  try {
    return await apiPost<CarePlanResponse>("/api/ai/care-plan", { pet_id: petId, text });
  } catch (error) {
    // The server's message is already written for the owner (503 / 502); keep it.
    if (error instanceof ApiError && (error.status === 503 || error.status === 502)) throw new Error(error.message);
    if (error instanceof ApiError && error.status === 403) throw new Error("Only the pet's owner can write a care request.");
    throw new Error("Couldn't make the checklist. Check your connection and try again.");
  }
}

export function draftFromPlan(plan: CarePlanResponse): DraftTask[] {
  return plan.tasks.map((t, i) => ({
    key: `${i}-${t.type}-${t.time}`,
    type: t.type,
    time: t.time,
    title: t.title,
    dose: t.dose ?? "",
    notes: t.notes ?? "",
  }));
}

/**
 * Save the note, its checklist and the Heads-ups together (`save_care_request`: one transaction —
 * a failure leaves nothing behind).
 */
export async function saveCareRequest(input: {
  petId: string;
  text: string;
  model: string | null;
  tasks: DraftTask[];
  cautions: string[];
}): Promise<void> {
  const { error } = await getSupabase().rpc("save_care_request", {
    p_pet: input.petId,
    p_text: input.text.trim(),
    p_model: input.model,
    p_tasks: input.tasks.map((t) => ({
      type: t.type,
      time: t.time,
      title: t.title.trim(),
      dose: t.dose.trim() || null,
      notes: t.notes.trim() || null,
    })),
    p_cautions: input.cautions.map((c) => c.trim()).filter(Boolean),
  });
  if (error) {
    if (error.message.includes("task_type_not_allowed_for_species")) {
      throw new Error("One of these tasks doesn't fit this pet (no walks for cats, no litter for dogs).");
    }
    throw new Error("Couldn't save the checklist. Check your connection and try again.");
  }
}
