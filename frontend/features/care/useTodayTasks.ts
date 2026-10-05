import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import type { CareTaskRow, TaskLogRow } from "../../types/db";
import { ensureTodayTaskLogs, listCareTasks } from "./careApi";

export type TaskPet = { id: string; name: string; ownerName: string };
export type TaskItem = { log: TaskLogRow; task: CareTaskRow; pet: TaskPet };

export type TodayTasksState =
  | { status: "loading" }
  | { status: "ready"; items: TaskItem[] }
  | { status: "error"; message: string };

/**
 * The sitter's tasks for today across the pets in care: opens each pet's day
 * (`ensure_today_task_logs`), joins the task, sorts by time. Reloads whenever the screen is focused.
 */
export function useTodayTasks(pets: TaskPet[]) {
  const [state, setState] = useState<TodayTasksState>({ status: "loading" });
  const petKey = pets.map((p) => p.id).join(",");

  const reload = useCallback(async () => {
    try {
      const perPet = await Promise.all(
        pets.map(async (pet) => {
          const [logs, tasks] = await Promise.all([ensureTodayTaskLogs(pet.id), listCareTasks(pet.id)]);
          const byId = new Map(tasks.map((t) => [t.id, t]));
          return logs.flatMap((log) => {
            const task = byId.get(log.task_id);
            return task ? [{ log, task, pet }] : [];
          });
        }),
      );
      setState({ status: "ready", items: perPet.flat().sort((a, b) => a.log.due_at.localeCompare(b.log.due_at)) });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
    // petKey stands in for `pets` so a new array with the same pets doesn't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petKey]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { state, reload };
}
