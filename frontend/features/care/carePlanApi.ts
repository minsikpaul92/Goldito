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
  /** pending → approved | declined | countered; countered → accepted | withdrawn. */
  status: "pending" | "approved" | "declined" | "countered" | "accepted" | "withdrawn";
  tasks: { type: CareTaskType; time: string; title: string; dose: string | null; notes: string | null; repeat?: boolean }[];
  cautions: string[];
  declineReason: string | null;
  /** The sitter's note (decline or counter-request). */
  note: string | null;
  /** Extra fee the sitter asks for, in cents. */
  counterFeeCents: number | null;
  /** Indexes of `tasks` the sitter asks the owner to do themselves. */
  counterOwnerTasks: number[];
  createdAt: string;
};

type ChangeRequestRow = {
  id: string;
  pet_id: string;
  status: ChangeRequest["status"];
  tasks: ChangeRequest["tasks"];
  cautions: string[];
  decline_reason: string | null;
  note: string | null;
  counter_fee_cents: number | null;
  counter_owner_tasks: number[] | null;
  created_at: string;
};

const asChangeRequest = (r: ChangeRequestRow): ChangeRequest => ({
  id: r.id,
  petId: r.pet_id,
  status: r.status,
  tasks: r.tasks,
  cautions: r.cautions,
  declineReason: r.decline_reason,
  note: r.note,
  counterFeeCents: r.counter_fee_cents,
  counterOwnerTasks: r.counter_owner_tasks ?? [],
  createdAt: r.created_at,
});

const CHANGE_COLUMNS =
  "id, pet_id, status, tasks, cautions, decline_reason, note, counter_fee_cents, counter_owner_tasks, created_at";

const CHANGE_MESSAGES: Record<string, string> = {
  request_pending: "A request is already waiting for your sitter. Wait for their answer first.",
  no_active_stay: "There is no stay on for this pet right now.",
  empty_request: "Add a task or a Heads-up first.",
  too_many_items: "That's too many items for one request (12 tasks, 8 Heads-ups at most).",
  forbidden: "Only the pet's owner can send a care request.",
  already_answered: "That request was already answered.",
  note_required: "Write a short note first.",
  invalid_tasks: "One of those tasks isn't on the request.",
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

export async function respondCareChangeRequest(
  id: string,
  approve: boolean,
  reason: string | null,
  note: string | null = null,
): Promise<void> {
  const { error } = await getSupabase().rpc("respond_care_change_request", {
    p_request: id,
    p_approve: approve,
    p_reason: reason,
    p_note: note,
  });
  if (error) throw changeError(error, "Couldn't send your answer. Check your connection and try again.");
}

/** Sitter → owner instead of a plain no: a note, an optional extra fee, and tasks the owner does themselves. */
export async function counterCareChangeRequest(
  id: string,
  note: string,
  feeCents: number | null,
  ownerTasks: number[],
): Promise<void> {
  const { error } = await getSupabase().rpc("counter_care_change_request", {
    p_request: id,
    p_note: note,
    p_fee_cents: feeCents,
    p_owner_tasks: ownerTasks,
  });
  if (error) throw changeError(error, "Couldn't send your reply. Check your connection and try again.");
}

/** Owner answers the sitter's counter-request. */
export async function answerCareCounter(id: string, accept: boolean): Promise<void> {
  const { error } = await getSupabase().rpc("answer_care_counter", { p_request: id, p_accept: accept });
  if (error) throw changeError(error, "Couldn't send your answer. Check your connection and try again.");
}

export const formatFee = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Requests the sitter countered that the signed-in owner has not answered yet. */
export async function listOpenCounterIds(): Promise<string[]> {
  const { data, error } = await getSupabase().from("care_change_requests").select("id").eq("status", "countered");
  if (error) throw new Error("Couldn't load care requests.");
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}
