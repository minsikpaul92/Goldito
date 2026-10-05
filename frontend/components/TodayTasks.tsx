import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { careTypeMeta, statusLabel, todayStatus } from "../features/care/careFormat";
import { TaskItem, TaskPet, useTodayTasks } from "../features/care/useTodayTasks";
import { formatTime, isoToZoned } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { TaskDoneSheet } from "./TaskDoneSheet";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

/**
 * Sitter's tasks for today (phase-06 6.3): what is left, one **Done** per task. Done opens a small
 * sheet (memo + photo + Done); a finished task leaves the list and shows up under "Done today".
 */
export function TodayTasks({ pets }: { pets: TaskPet[] }) {
  const styles = useThemedStyles(makeStyles);
  const { state, reload } = useTodayTasks(pets);
  const [finishing, setFinishing] = useState<TaskItem | null>(null);
  const [showDone, setShowDone] = useState(false);

  const names = useMemo(() => pets.map((p) => p.name).join(" & "), [pets]);
  if (pets.length === 0) return null;

  const items = state.status === "ready" ? state.items : [];
  const open = items.filter((i) => i.log.status === "pending");
  const done = items.filter((i) => i.log.status === "done");
  const next = open.find((i) => todayStatus(i.log).kind !== "missed") ?? open[0];

  return (
    <View style={styles.section} testID="today-tasks">
      <View style={styles.headRow}>
        <Text accessibilityRole="header" style={styles.heading}>
          Today&apos;s tasks
        </Text>
        {state.status === "ready" && items.length > 0 ? (
          <Text style={styles.muted} testID="tasks-count">{`${open.length} left · ${done.length} done`}</Text>
        ) : null}
      </View>

      {state.status === "loading" ? <Text style={styles.muted}>Loading…</Text> : null}
      {state.status === "error" ? (
        <View style={styles.gap}>
          <Text style={styles.error}>{state.message}</Text>
          <Button label="Try again" variant="secondary" onPress={() => void reload()} testID="tasks-retry" />
        </View>
      ) : null}
      {state.status === "ready" && items.length === 0 ? (
        <Text style={styles.muted} testID="tasks-empty">
          No tasks for {names} today.
        </Text>
      ) : null}
      {state.status === "ready" && items.length > 0 && open.length === 0 ? (
        <Text style={styles.allDone} testID="tasks-all-done">
          All done for today 🎉
        </Text>
      ) : null}

      {next ? (
        <Text style={styles.next} testID="tasks-next">
          {`Next up: ${next.pet.name} · ${next.task.title} · ${formatTime(isoToZoned(next.log.due_at).time)}`}
        </Text>
      ) : null}

      {open.map((item) => {
        const meta = careTypeMeta(item.task.type);
        const label = statusLabel(todayStatus(item.log));
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
            <Button label="Done" onPress={() => setFinishing(item)} testID={`task-done-${item.log.id}`} />
          </Card>
        );
      })}

      {done.length > 0 ? (
        <View style={styles.gap}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowDone((v) => !v)}
            testID="tasks-done-toggle"
          >
            <Text style={styles.toggle}>{`${showDone ? "▾" : "▸"} Done today (${done.length})`}</Text>
          </Pressable>
          {showDone
            ? done.map((item) => (
                <Text key={item.log.id} style={styles.muted} testID={`task-finished-${item.log.id}`}>
                  {`✅ ${item.task.title} · ${item.pet.name} · ${formatTime(isoToZoned(item.log.completed_at ?? item.log.due_at).time)}${item.log.note_text ? ` · “${item.log.note_text}”` : ""}`}
                </Text>
              ))
            : null}
        </View>
      ) : null}

      <TaskDoneSheet item={finishing} onClose={() => setFinishing(null)} onDone={() => void reload()} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { gap: theme.spacing.sm },
    headRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
    heading: { fontSize: theme.fontSize.body, fontWeight: "600", color: theme.color.text },
    gap: { gap: theme.spacing.xs },
    next: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.primary },
    allDone: { fontSize: theme.fontSize.body, fontWeight: "600", color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
    toggle: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.primary, paddingVertical: 4 },
    card: { gap: theme.spacing.sm },
    row: { flexDirection: "row", gap: theme.spacing.sm },
    emoji: { fontSize: 24 },
    body: { flex: 1, gap: 2 },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    badge: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.text },
  });
