import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { UploadError, uploadMedia } from "../lib/cloudinary";
import { pickMedia } from "../lib/media";
import {
  completeTaskLog,
  ensureTodayTaskLogs,
  listCareTasks,
} from "../features/care/careApi";
import { careTypeMeta, statusLabel, todayStatus } from "../features/care/careFormat";
import { formatTime, isoToZoned } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import type { CareTaskRow, TaskLogRow } from "../types/db";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

type PetRef = { id: string; name: string; ownerName: string };

type Item = { log: TaskLogRow; task: CareTaskRow; pet: PetRef };

type State =
  | { status: "loading" }
  | { status: "ready"; items: Item[] }
  | { status: "error"; message: string };

/**
 * Sitter's tasks for today (phase-06 6.3): opens each pet's day (ensure_today_task_logs), shows
 * what is next, and finishes a task in one tap — **Mark done**, or **📷 Done with photo**
 * (the owner gets a feed photo too). No typing (D38).
 */
export function TodayTasks({ pets }: { pets: PetRef[] }) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [busyId, setBusyId] = useState<string | null>(null);

  const petKey = pets.map((p) => p.id).join(",");
  const petsById = useMemo(() => new Map(pets.map((p) => [p.id, p])), [pets]);

  const load = useCallback(async () => {
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
      setState({
        status: "ready",
        items: perPet.flat().sort((a, b) => a.log.due_at.localeCompare(b.log.due_at)),
      });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
    // petKey stands in for `pets` so a new array with the same pets doesn't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petKey]);

  // Also refreshes when the sitter comes back to Home (e.g. after sharing a photo).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const finish = async (item: Item, withPhoto: boolean) => {
    if (busyId) return;
    setBusyId(item.log.id);
    try {
      let mediaId: string | null = null;
      if (withPhoto) {
        const picked = await pickMedia({ purpose: "task_proof" });
        if (!picked) return;
        const uploaded = await uploadMedia({
          petId: item.pet.id,
          purpose: "task_proof",
          file: picked.file,
          resourceType: "image",
        });
        mediaId = uploaded.mediaId;
      }
      await completeTaskLog(item.log.id, mediaId);
      toast.show(`${item.task.title} done ✅ ${item.pet.ownerName} was told`);
      await load();
    } catch (error) {
      toast.show(error instanceof UploadError || error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusyId(null);
    }
  };

  if (pets.length === 0) return null;

  const items = state.status === "ready" ? state.items : [];
  const open = items.filter((i) => i.log.status === "pending");
  const next = open.find((i) => todayStatus(i.log).kind !== "missed") ?? open[0];

  return (
    <View style={styles.section} testID="today-tasks">
      <Text accessibilityRole="header" style={styles.heading}>
        Today&apos;s tasks
      </Text>

      {state.status === "loading" ? <Text style={styles.muted}>Loading…</Text> : null}
      {state.status === "error" ? (
        <View style={styles.gap}>
          <Text style={styles.error}>{state.message}</Text>
          <Button label="Try again" variant="secondary" onPress={() => void load()} testID="tasks-retry" />
        </View>
      ) : null}
      {state.status === "ready" && items.length === 0 ? (
        <Text style={styles.muted} testID="tasks-empty">
          No tasks for {[...petsById.values()].map((p) => p.name).join(" & ")} today.
        </Text>
      ) : null}

      {next ? (
        <Text style={styles.next} testID="tasks-next">
          {`Next up: ${next.pet.name} · ${next.task.title} · ${formatTime(isoToZoned(next.log.due_at).time)}`}
        </Text>
      ) : null}

      {items.map((item) => {
        const meta = careTypeMeta(item.task.type);
        const status = todayStatus(item.log);
        const label = statusLabel(status);
        const busy = busyId === item.log.id;
        return (
          <Card key={item.log.id} testID={`task-${item.log.id}`} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.emoji} accessibilityElementsHidden>
                {meta.emoji}
              </Text>
              <View style={styles.body}>
                <Text style={styles.title}>{item.task.title}</Text>
                <Text style={styles.muted}>
                  {[item.pet.name, formatTime(isoToZoned(item.log.due_at).time), item.task.dose]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                {item.task.notes ? <Text style={styles.muted}>{item.task.notes}</Text> : null}
                {label ? (
                  <Text style={styles.badge} testID={`task-status-${item.log.id}`}>
                    {label}
                  </Text>
                ) : null}
              </View>
            </View>
            {item.log.status === "pending" ? (
              <View style={styles.actions}>
                <Button
                  label={busy ? "…" : "Mark done"}
                  disabled={busyId != null}
                  onPress={() => void finish(item, false)}
                  testID={`task-done-${item.log.id}`}
                />
                <Button
                  label="📷 Done with photo"
                  variant="secondary"
                  disabled={busyId != null}
                  onPress={() => void finish(item, true)}
                  testID={`task-photo-${item.log.id}`}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { gap: theme.spacing.sm },
    heading: { fontSize: theme.fontSize.body, fontWeight: "600", color: theme.color.text },
    gap: { gap: theme.spacing.xs },
    next: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.primary },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
    card: { gap: theme.spacing.sm },
    row: { flexDirection: "row", gap: theme.spacing.sm },
    emoji: { fontSize: 24 },
    body: { flex: 1, gap: 2 },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    badge: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.text },
    actions: { gap: theme.spacing.xs },
  });
