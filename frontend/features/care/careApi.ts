import { getSupabase } from "../../lib/supabase";
import type { CareCheckinKind, CareTaskRow, CareTaskType, TaskLogRow } from "../../types/db";
import { addDays, appToday, zonedToIso } from "../schedule/dates";

const TASK_COLUMNS =
  "id, pet_id, type, title, dose, scheduled_time, repeat_daily, notes, active, created_at";

export type CareTaskInput = {
  type: CareTaskType;
  title: string;
  dose: string | null;
  /** "HH:MM" in the app timezone. */
  time: string;
  notes: string | null;
  /** Every day (default) or one time only. */
  repeat?: boolean;
};

/** While a stay is on the owner asks through a care request instead (008j). */
const STAY_ON_MESSAGE = "A stay is on — send a care request instead, and your sitter can approve it.";

function fail(action: string): never {
  throw new Error(`Couldn't ${action}. Check your connection and try again.`);
}

export async function listCareTasks(petId: string): Promise<CareTaskRow[]> {
  const { data, error } = await getSupabase()
    .from("care_tasks")
    .select(TASK_COLUMNS)
    .eq("pet_id", petId)
    .order("scheduled_time", { ascending: true });
  if (error) fail("load care tasks");
  return (data ?? []) as CareTaskRow[];
}

/** Today's task logs (app-timezone day) for the status badge; empty until the sitter side creates them. */
export async function listTodayTaskLogs(petId: string): Promise<TaskLogRow[]> {
  const today = appToday();
  const { data, error } = await getSupabase()
    .from("task_logs")
    .select("id, task_id, pet_id, due_at, status, completed_at, note_text")
    .eq("pet_id", petId)
    .gte("due_at", zonedToIso(today, "00:00"))
    .lte("due_at", zonedToIso(addDays(today, 1), "00:00"));
  if (error) fail("load today's status");
  return (data ?? []) as TaskLogRow[];
}

/** RLS: only the pet's owner; the DB guard rejects a walk for a cat / litter for a dog. */
export async function createCareTask(
  petId: string,
  userId: string,
  input: CareTaskInput,
): Promise<CareTaskRow> {
  const { data, error } = await getSupabase()
    .from("care_tasks")
    .insert({
      pet_id: petId,
      type: input.type,
      title: input.title,
      dose: input.dose,
      scheduled_time: input.time,
      notes: input.notes,
      repeat_daily: input.repeat ?? true,
      created_by: userId,
    })
    .select(TASK_COLUMNS)
    .single();
  if (error) {
    if (error.message.includes("task_type_not_allowed_for_species")) {
      throw new Error("That task doesn't fit this pet (no walks for cats, no litter for dogs).");
    }
    if (error.code === "42501") throw new Error(STAY_ON_MESSAGE);
    fail("save this task");
  }
  return data as CareTaskRow;
}

/**
 * Owner edits a task: name, dose, time, memo for the sitter. The type is fixed (delete and add a
 * new task instead). The server drops today's unfinished log when the time changes (008d).
 */
export async function updateCareTask(taskId: string, input: Omit<CareTaskInput, "type">): Promise<void> {
  const { error } = await getSupabase()
    .from("care_tasks")
    .update({ title: input.title, dose: input.dose, scheduled_time: input.time, notes: input.notes })
    .eq("id", taskId);
  if (error) fail("save this task");
}

export async function setCareTaskActive(taskId: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().from("care_tasks").update({ active }).eq("id", taskId);
  if (error) fail(active ? "resume this task" : "pause this task");
}

export async function deleteCareTask(taskId: string): Promise<void> {
  const { error } = await getSupabase().from("care_tasks").delete().eq("id", taskId);
  if (error) fail("delete this task");
}

const RPC_MESSAGES: Record<string, string> = {
  not_on_duty: "You can open today's tasks once you're on duty for this pet.",
  not_in_care_window: "Tasks open once the stay has started.",
  already_done: "That task is already marked done.",
  invalid_media: "That photo can't be used for this task. Pick another.",
  task_log_not_found: "That task is no longer there. Pull to refresh.",
  note_required: "Type a note first.",
  checkin_not_allowed_for_species: "That check-in doesn't fit this pet.",
};

function rpcMessage(error: { message: string }, fallback: string): string {
  const key = Object.keys(RPC_MESSAGES).find((k) => error.message.includes(k));
  return key ? RPC_MESSAGES[key] : fallback;
}

/** Sitter opens a pet's tasks: creates today's logs if needed (idempotent) and returns them (6.2). */
export async function ensureTodayTaskLogs(petId: string): Promise<TaskLogRow[]> {
  const { data, error } = await getSupabase().rpc("ensure_today_task_logs", { p_pet: petId });
  if (error) {
    throw new Error(rpcMessage(error, "Couldn't load today's tasks. Check your connection and try again."));
  }
  return (data ?? []) as TaskLogRow[];
}

/**
 * Mark a task done (6.4). With `mediaId` (a `task_proof` upload) the owner also gets a feed
 * photo. With a `note` the owner gets only that memo; without, a preset line.
 */
export async function completeTaskLog(logId: string, mediaId: string | null, note: string | null): Promise<void> {
  const { error } = await getSupabase().rpc("complete_task_log", {
    p_task_log: logId,
    p_media_id: mediaId,
    p_note_text: note,
  });
  if (error) throw new Error(rpcMessage(error, "Couldn't mark this done. Check your connection and try again."));
}

export type CheckinInput = {
  petId: string;
  kind: CareCheckinKind;
  /** Kind-specific tap value (meal `all`…, walk minutes…); null for a note. */
  value: string | null;
  /** Optional memo (≤ 120). With one, the owner gets only the memo; without, a preset line. */
  note: string | null;
  /** A `task_proof` upload, optional. */
  mediaId: string | null;
};

/** One-tap check-in (6.9): meal · potty · walk · mood · note. The owner is told right away. */
export async function logCareCheckin(input: CheckinInput): Promise<void> {
  const { error } = await getSupabase().rpc("log_care_checkin", {
    p_pet: input.petId,
    p_kind: input.kind,
    p_value: input.value,
    p_note_text: input.note,
    p_media_id: input.mediaId,
  });
  if (error) throw new Error(rpcMessage(error, "Couldn't send this. Check your connection and try again."));
}

export type SentCheckin = {
  id: string;
  kind: CareCheckinKind;
  value: string | null;
  note: string | null;
  at: string;
};

/** What the sitter already sent for this pet today (RLS: the sitter in the care window reads it). */
export async function listTodayCheckins(petId: string): Promise<SentCheckin[]> {
  const { data, error } = await getSupabase()
    .from("care_checkins")
    .select("id, kind, value, note_text, created_at")
    .eq("pet_id", petId)
    .gte("created_at", zonedToIso(appToday(), "00:00"))
    .order("created_at", { ascending: false });
  if (error) fail("load today's check-ins");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as CareCheckinKind,
    value: r.value as string | null,
    note: r.note_text as string | null,
    at: r.created_at as string,
  }));
}

export type PetCaution = { id: string; petId: string; text: string };

/** Active Heads-ups for these pets (RLS: the owner, the sitter in the care window, a sitter deciding on a request). */
export async function listPetCautions(petIds: string[]): Promise<PetCaution[]> {
  if (petIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("pet_cautions")
    .select("id, pet_id, text")
    .in("pet_id", petIds)
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) fail("load the Heads-ups");
  return (data ?? []).map((r) => ({ id: r.id as string, petId: r.pet_id as string, text: r.text as string }));
}

/** The owner adds one by hand (≤ 100 characters). */
export async function addPetCaution(petId: string, userId: string, text: string): Promise<void> {
  const { error } = await getSupabase()
    .from("pet_cautions")
    .insert({ pet_id: petId, text: text.trim(), created_by: userId });
  if (error) {
    if (error.code === "42501") throw new Error(STAY_ON_MESSAGE);
    fail("add this Heads-up");
  }
}

export async function deletePetCaution(id: string): Promise<void> {
  const { error } = await getSupabase().from("pet_cautions").delete().eq("id", id);
  if (error) fail("remove this Heads-up");
}
