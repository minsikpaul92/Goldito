import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { listTodayCheckins } from "../features/care/careApi";
import { careTypeMeta, todayStatus } from "../features/care/careFormat";
import { useDueReminder } from "../features/care/useDueReminder";
import { TaskItem, useTodayTasks } from "../features/care/useTodayTasks";
import type { CaringPet } from "../features/feed/caringPets";
import { SPECIES_EMOJI } from "../features/pets/petFormat";
import { formatTime, isoToZoned } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { DueBanner } from "./DueBanner";
import { TaskDoneSheet } from "./TaskDoneSheet";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

/**
 * The sitter's Home while a stay is on: one screen, no scrolling — today's numbers, the next task
 * with its Done button, the pets in care (tap → check-in), and buttons into the bigger screens.
 */
export function SitterDashboard({ pets }: { pets: CaringPet[] }) {
  const styles = useThemedStyles(makeStyles);
  const taskPets = useMemo(() => pets.map((p) => ({ id: p.id, name: p.name, ownerName: p.ownerName })), [pets]);
  const { state, reload } = useTodayTasks(taskPets);
  const [finishing, setFinishing] = useState<TaskItem | null>(null);
  const [checkins, setCheckins] = useState<number | null>(null);

  const petKey = pets.map((p) => p.id).join(",");
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.all(pets.map((p) => listTodayCheckins(p.id).catch(() => [])))
        .then((lists) => live && setCheckins(lists.reduce((n, l) => n + l.length, 0)))
        .catch(() => undefined);
      return () => {
        live = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [petKey]),
  );

  const items = state.status === "ready" ? state.items : [];
  const reminder = useDueReminder(items, state.status === "ready", reload);
  const open = items.filter((i) => i.log.status === "pending");
  const done = items.length - open.length;
  const next = open.find((i) => todayStatus(i.log).kind !== "missed") ?? open[0];

  const owners = useMemo(() => {
    const groups = new Map<string, CaringPet[]>();
    for (const p of pets) groups.set(p.ownerName, [...(groups.get(p.ownerName) ?? []), p]);
    return [...groups.entries()];
  }, [pets]);

  const stat = (label: string, value: string, id: string) => (
    <View style={styles.stat} testID={id} accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const shortcut = (label: string, onPress: () => void, id: string) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
      testID={id}
    >
      <Text style={styles.shortcutText}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.root} testID="sitter-dashboard">
      <View style={styles.stats}>
        {stat("Tasks done", items.length > 0 ? `${done}/${items.length}` : "—", "stat-tasks")}
        {stat("Check-ins", checkins == null ? "—" : String(checkins), "stat-checkins")}
        {stat("Pets in care", String(pets.length), "stat-pets")}
      </View>

      {/* Something due (or overdue) takes the place of the "Next up" card, so Home stays one screen. */}
      {reminder.current ? (
        <DueBanner reminder={reminder} onDone={setFinishing} />
      ) : (
        <Card style={styles.next} testID="dashboard-next">
          {state.status === "error" ? (
            <Text style={styles.error}>{state.message}</Text>
          ) : next ? (
            <>
              <Text style={styles.nextLabel}>Next up</Text>
              <Text style={styles.nextTitle} testID="tasks-next">
                {`${careTypeMeta(next.task.type).emoji} ${next.task.title}`}
              </Text>
              <Text style={styles.muted}>
                {[next.pet.name, formatTime(isoToZoned(next.log.due_at).time), next.task.dose].filter(Boolean).join(" · ")}
              </Text>
              <Button label="Done" onPress={() => setFinishing(next)} testID="dashboard-next-done" />
            </>
          ) : state.status === "ready" ? (
            <Text style={styles.nextTitle} testID={items.length > 0 ? "tasks-all-done" : "tasks-empty"}>
              {items.length > 0 ? "All done for today 🎉" : "No tasks today"}
            </Text>
          ) : (
            <Text style={styles.muted}>Loading…</Text>
          )}
        </Card>
      )}

      <Card style={styles.caring} testID="today-caring">
        <Text style={styles.nextLabel}>Now caring · tap a pet to check in</Text>
        {owners.map(([owner, list]) => (
          <View key={owner} style={styles.ownerRow}>
            <Text style={styles.muted}>{`${owner}'s ${list.length > 1 ? "pets" : "pet"}`}</Text>
            <View style={styles.chips}>
              {list.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Check in on ${p.name}`}
                  onPress={() => router.push(`/sitter/checkin/${p.id}`)}
                  style={({ pressed }) => [styles.petChip, pressed && styles.pressed]}
                  testID={`caring-pet-${p.id}`}
                >
                  <Text style={styles.petChipText}>{`${SPECIES_EMOJI[p.species]} ${p.name}`}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </Card>

      <View style={styles.shortcuts}>
        {shortcut("✅ All tasks", () => router.push("/sitter/tasks"), "shortcut-tasks")}
        {shortcut("📸 Photos", () => router.push("/sitter/feed"), "shortcut-photos")}
        {shortcut("🕘 My history", () => router.push("/sitter/history"), "shortcut-history")}
        {shortcut("📅 Bookings", () => router.push("/sitter/bookings"), "shortcut-bookings")}
      </View>

      <TaskDoneSheet item={finishing} onClose={() => setFinishing(null)} onDone={() => void reload()} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.sm },
    stats: { flexDirection: "row", gap: theme.spacing.xs },
    stat: {
      flex: 1,
      alignItems: "center",
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    statValue: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    statLabel: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    next: { gap: theme.spacing.xs },
    nextLabel: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    nextTitle: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
    caring: { gap: theme.spacing.xs },
    ownerRow: { gap: 2 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    petChip: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.md,
      borderRadius: 22,
      backgroundColor: theme.color.accent,
      borderWidth: 1,
      borderColor: theme.color.primary,
    },
    petChipText: { fontSize: theme.fontSize.body, fontWeight: "600", color: theme.color.primary },
    shortcuts: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    shortcut: {
      width: "48.5%",
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    shortcutText: { fontSize: theme.fontSize.body, fontWeight: "600", color: theme.color.text },
    pressed: { opacity: 0.7 },
  });
