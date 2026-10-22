import { useCallback, useEffect, useMemo, useState } from "react";

import { listCareTasks, listTodayCheckins, listTodayTaskLogs } from "../care/careApi";
import { PendingTask, PetStatus, StatusCheckin, derivePetStatus } from "../../lib/petStatus";
import { useNotifications } from "../../providers/NotificationsProvider";

const REFRESH_MS = 60_000;

/**
 * What the pet room shows for one pet: today's check-ins and tasks still open, worked out by `derivePetStatus`.
 * Reloads when a notice arrives (the sitter's check-in reaches the owner as one), and the clock moves on every minute
 * so a pet turns hungry without a reload. A failed load keeps the last picture: the room is a bonus on Home.
 */
export function usePetRoom(petId: string | null, reloadKey = 0): PetStatus | null {
  const { inboxRevision } = useNotifications();
  const [data, setData] = useState<{ checkins: StatusCheckin[]; pending: PendingTask[] } | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    if (!petId) return;
    try {
      const [checkins, logs] = await Promise.all([listTodayCheckins(petId), listTodayTaskLogs(petId)]);
      const open = logs.filter((l) => l.status === "pending");
      const titles = open.length > 0 ? new Map((await listCareTasks(petId)).map((t) => [t.id, t.title])) : new Map();
      const pending = open.map((l) => ({ title: titles.get(l.task_id) ?? "Task", dueAt: l.due_at }));
      setData({ checkins: checkins.map((c) => ({ kind: c.kind, value: c.value, at: c.at })), pending });
      setNow(new Date());
    } catch {
      // Keep what is shown.
    }
  }, [petId]);

  useEffect(() => setData(null), [petId]);

  useEffect(() => {
    void load();
  }, [load, inboxRevision, reloadKey]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => (data ? derivePetStatus(data.checkins, data.pending, now) : null), [data, now]);
}
