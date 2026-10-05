import { useFocusEffect } from "expo-router";
import { Platform } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "../../providers/ToastProvider";
import type { TaskItem } from "./useTodayTasks";

/** D17: the sitter app checks every 30 s while it is open. */
export const REMINDER_TICK_MS = 30_000;
/** Every 10th tick (5 min) the day is re-read, so a task the owner added meanwhile shows up. */
const RELOAD_EVERY_TICKS = 10;
/** D9: after this long a pending task counts as missed. */
const DUE_WINDOW_MS = 60 * 60_000;

/** "Remind me later" is one fixed step — 10 minutes. */
export const SNOOZE_MS = 10 * 60_000;
const SNOOZE_KEY = "pawnote:due-snoozes";

type Snoozes = Record<string, number>;

function loadSnoozes(): Snoozes {
  if (Platform.OS !== "web") return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(SNOOZE_KEY) ?? "{}") as Snoozes;
    return Object.fromEntries(Object.entries(raw).filter(([, until]) => typeof until === "number"));
  } catch {
    return {};
  }
}

function saveSnoozes(snoozes: Snoozes) {
  if (Platform.OS !== "web") return;
  try {
    window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(snoozes));
  } catch {
    // Private mode / blocked storage: the snooze still works until the screen is closed.
  }
}

export type DueReminder = {
  /** The most urgent unfinished task that is due now (or overdue), not dismissed. */
  current: { item: TaskItem; overdue: boolean } | null;
  /** How many more are waiting behind it. */
  more: number;
  dismiss: (logId: string) => void;
  /** Hide this task for 10 minutes; it comes back with a toast (kept across a refresh). */
  snooze: (logId: string) => void;
};

/**
 * In-app reminder for today's scheduled tasks (phase-06 6.6, D17, scheduled tasks only):
 * - `current` is the task to show in the banner — due now first, then overdue;
 * - a toast says "⏰ Time for Dinner · Max" once, when a task *becomes* due while the app is open
 *   (tasks already due when the screen first loads don't flood toasts);
 * - **Remind me in 10 min** hides a task for 10 minutes, then it returns with "⏰ Still waiting";
 * - only the focused screen ticks, so a Home screen kept under another one doesn't double it.
 */
export function useDueReminder(items: TaskItem[], ready: boolean, reload: () => void): DueReminder {
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [snoozes, setSnoozes] = useState<Snoozes>(loadSnoozes);
  const focused = useRef(false);
  const ticks = useRef(0);
  const announced = useRef<Set<string> | null>(null);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setNow(Date.now());
      return () => {
        focused.current = false;
      };
    }, []),
  );

  useEffect(() => {
    const timer = setInterval(() => {
      if (!focused.current) return;
      setNow(Date.now());
      ticks.current += 1;
      if (ticks.current % RELOAD_EVERY_TICKS === 0) reload();
    }, REMINDER_TICK_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const due = (i: TaskItem) => new Date(i.log.due_at).getTime();
  const pending = items.filter((i) => i.log.status === "pending");
  const dueNow = pending.filter((i) => due(i) <= now && now <= due(i) + DUE_WINDOW_MS).sort((a, b) => due(a) - due(b));
  const overdue = pending.filter((i) => now > due(i) + DUE_WINDOW_MS).sort((a, b) => due(a) - due(b));

  const dueKey = dueNow.map((i) => i.log.id).join(",");
  useEffect(() => {
    if (!ready || !focused.current) return;
    if (announced.current === null) {
      announced.current = new Set(dueNow.map((i) => i.log.id)); // what is already due on first look
      return;
    }
    for (const item of dueNow) {
      if (announced.current.has(item.log.id)) continue;
      announced.current.add(item.log.id);
      toast.show(`⏰ Time for ${item.task.title} · ${item.pet.name}`);
    }
    // dueKey changes exactly when the set of due tasks changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueKey, ready]);

  // A snooze ran out: it returns to the banner and says so once (if the task is still open).
  useEffect(() => {
    const expired = Object.entries(snoozes).filter(([, until]) => until <= now);
    if (expired.length === 0) return;
    const next = { ...snoozes };
    for (const [id] of expired) {
      delete next[id];
      const item = items.find((i) => i.log.id === id && i.log.status === "pending");
      if (item && focused.current) toast.show(`⏰ Still waiting: ${item.task.title} · ${item.pet.name}`);
    }
    saveSnoozes(next);
    setSnoozes(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const snooze = useCallback((logId: string) => {
    setSnoozes((prev) => {
      const next = { ...prev, [logId]: Date.now() + SNOOZE_MS };
      saveSnoozes(next);
      return next;
    });
  }, []);

  const queue = [...dueNow.map((item) => ({ item, overdue: false })), ...overdue.map((item) => ({ item, overdue: true }))].filter(
    (q) => !dismissed.has(q.item.log.id) && !((snoozes[q.item.log.id] ?? 0) > now),
  );
  const dismiss = useCallback((logId: string) => setDismissed((prev) => new Set(prev).add(logId)), []);

  return { current: queue[0] ?? null, more: Math.max(0, queue.length - 1), dismiss, snooze };
}
