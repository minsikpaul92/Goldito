import { getSupabase } from "../../lib/supabase";
import type { CareTaskRow, CareTaskType, TaskLogRow } from "../../types/db";
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
};

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
    .select("id, task_id, pet_id, due_at, status, completed_at")
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
      repeat_daily: true,
      created_by: userId,
    })
    .select(TASK_COLUMNS)
    .single();
  if (error) {
    if (error.message.includes("task_type_not_allowed_for_species")) {
      throw new Error("That task doesn't fit this pet (no walks for cats, no litter for dogs).");
    }
    fail("save this task");
  }
  return data as CareTaskRow;
}

export async function setCareTaskActive(taskId: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().from("care_tasks").update({ active }).eq("id", taskId);
  if (error) fail(active ? "resume this task" : "pause this task");
}

export async function deleteCareTask(taskId: string): Promise<void> {
  const { error } = await getSupabase().from("care_tasks").delete().eq("id", taskId);
  if (error) fail("delete this task");
}
