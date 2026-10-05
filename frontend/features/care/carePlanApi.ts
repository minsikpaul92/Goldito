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
  /** Every day (default) or one time only. */
  repeat?: boolean;
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

/** An owner's request to the sitter while a stay is on (`care_change_requests`). */
export type ChangeRequest = {
  id: string;
  petId: string;
  status: "pending" | "approved" | "declined";
  tasks: { type: CareTaskType; time: string; title: string; dose: string | null; notes: string | null; repeat?: boolean }[];
  cautions: string[];
  declineReason: string | null;
  createdAt: string;
};

type ChangeRequestRow = {
  id: string;
  pet_id: string;
  status: ChangeRequest["status"];
  tasks: ChangeRequest["tasks"];
  cautions: string[];
  decline_reason: string | null;
  created_at: string;
};

const asChangeRequest = (r: ChangeRequestRow): ChangeRequest => ({
  id: r.id,
  petId: r.pet_id,
  status: r.status,
  tasks: r.tasks,
  cautions: r.cautions,
  declineReason: r.decline_reason,
  createdAt: r.created_at,
});

const CHANGE_COLUMNS = "id, pet_id, status, tasks, cautions, decline_reason, created_at";

const CHANGE_MESSAGES: Record<string, string> = {
  request_pending: "A request is already waiting for your sitter. Wait for their answer first.",
  no_active_stay: "There is no stay on for this pet right now.",
  empty_request: "Add a task or a Heads-up first.",
  too_many_items: "That's too many items for one request (12 tasks, 8 Heads-ups at most).",
  forbidden: "Only the pet's owner can send a care request.",
  already_answered: "That request was already answered.",
};

function changeError(error: { message: string }, fallback: string): Error {
  const key = Object.keys(CHANGE_MESSAGES).find((k) => error.message.includes(k));
  if (key) return new Error(CHANGE_MESSAGES[key]);
  if (error.message.includes("task_type_not_allowed_for_species")) {
    return new Error("One of these tasks doesn't fit this pet (no walks for cats, no litter for dogs).");
  }
  return new Error(fallback);
}

export async function sendCareChangeRequest(petId: string, tasks: DraftTask[], cautions: string[]): Promise<string> {
  const { data, error } = await getSupabase().rpc("send_care_change_request", {
    p_pet: petId,
    p_tasks: tasks.map((t) => ({
      type: t.type,
      time: t.time,
      title: t.title.trim(),
      dose: t.dose.trim() || null,
      notes: t.notes.trim() || null,
      repeat: t.repeat ?? true,
    })),
    p_cautions: cautions.map((c) => c.trim()).filter(Boolean),
  });
  if (error) throw changeError(error, "Couldn't send the request. Check your connection and try again.");
  return data as string;
}

/** The newest request for a pet (the owner's pet screen shows its state). */
export async function getLatestChangeRequest(petId: string): Promise<ChangeRequest | null> {
  const { data, error } = await getSupabase()
    .from("care_change_requests")
    .select(CHANGE_COLUMNS)
    .eq("pet_id", petId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error("Couldn't load the care request.");
  const row = ((data ?? []) as ChangeRequestRow[])[0];
  return row ? asChangeRequest(row) : null;
}

/** Requests waiting for the signed-in sitter (RLS limits it to their own). */
export async function listPendingChangeRequests(): Promise<(ChangeRequest & { petName: string })[]> {
  const { data, error } = await getSupabase()
    .from("care_change_requests")
    .select(`${CHANGE_COLUMNS}, pets(name)`)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load care requests.");
  return ((data ?? []) as unknown as (ChangeRequestRow & { pets: { name: string } | { name: string }[] | null })[]).map((r) => ({
    ...asChangeRequest(r),
    petName: (Array.isArray(r.pets) ? r.pets[0]?.name : r.pets?.name) ?? "your pet",
  }));
}

export async function getChangeRequest(id: string): Promise<(ChangeRequest & { petName: string }) | null> {
  const { data, error } = await getSupabase()
    .from("care_change_requests")
    .select(`${CHANGE_COLUMNS}, pets(name)`)
    .eq("id", id)
    .limit(1);
  if (error) throw new Error("Couldn't load the care request.");
  const r = ((data ?? []) as unknown as (ChangeRequestRow & { pets: { name: string } | { name: string }[] | null })[])[0];
  if (!r) return null;
  return { ...asChangeRequest(r), petName: (Array.isArray(r.pets) ? r.pets[0]?.name : r.pets?.name) ?? "your pet" };
}

export async function respondCareChangeRequest(id: string, approve: boolean, reason: string | null): Promise<void> {
  const { error } = await getSupabase().rpc("respond_care_change_request", {
    p_request: id,
    p_approve: approve,
    p_reason: reason,
  });
  if (error) throw changeError(error, "Couldn't send your answer. Check your connection and try again.");
}
