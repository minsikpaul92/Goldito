import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PetCaution, listPetCautions, listTodayCheckins } from "../features/care/careApi";
import { ChangeRequest, listPendingChangeRequests } from "../features/care/carePlanApi";
import { careTypeMeta, todayStatus } from "../features/care/careFormat";
import { useDueReminder } from "../features/care/useDueReminder";
import { TaskItem, useTodayTasks } from "../features/care/useTodayTasks";
import type { CaringPet } from "../features/feed/caringPets";
import { SPECIES_EMOJI } from "../features/pets/petFormat";
import { formatTime, isoToZoned } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { DueAlert } from "./DueAlert";
import { TaskDoneSheet } from "./TaskDoneSheet";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Sheet } from "./ui/Sheet";
import { TextButton } from "./ui/TextButton";

/** Open tasks listed on Home; the rest are one tap away in All tasks. */
const TODAY_ROWS = 3;

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
  const [cautions, setCautions] = useState<PetCaution[]>([]);
  const [showCautions, setShowCautions] = useState(false);
  const [requests, setRequests] = useState<(ChangeRequest & { petName: string })[]>([]);

  const petKey = pets.map((p) => p.id).join(",");
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.all(pets.map((p) => listTodayCheckins(p.id).catch(() => [])))
        .then((lists) => live && setCheckins(lists.reduce((n, l) => n + l.length, 0)))
        .catch(() => undefined);
      void listPendingChangeRequests()
        .then((list) => live && setRequests(list))
        .catch(() => undefined);
      void listPetCautions(pets.map((p) => p.id))
        .then((list) => live && setCautions(list))
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

  const owners = useMemo(() => {
    const groups = new Map<string, CaringPet[]>();
    for (const p of pets) groups.set(p.ownerName, [...(groups.get(p.ownerName) ?? []), p]);
    return [...groups.entries()];
  }, [pets]);

  const petName = (id: string) => pets.find((p) => p.id === id)?.name ?? "";

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

      {/* An owner's care request is waiting for an answer: one line, the whole request one tap away. */}
      {requests.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Care request for ${requests[0].petName} is waiting`}
          onPress={() => router.push(`/sitter/care-request/${requests[0].id}`)}
          style={({ pressed }) => [styles.headsUp, styles.requestLine, pressed && styles.pressed]}
          testID="request-line"
        >
          <Text style={styles.headsUpText} numberOfLines={1}>{`📝 Care request for ${requests[0].petName} — tap to answer`}</Text>
          <Text style={styles.headsUpMore}>{requests.length > 1 ? `+${requests.length - 1}` : "›"}</Text>
        </Pressable>
      ) : null}

      {/* The owner's Heads-ups for the pets in care: one line here, all of them one tap away. */}
      {cautions.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Heads-up: ${cautions.length} things to watch out for`}
          onPress={() => setShowCautions(true)}
          style={({ pressed }) => [styles.headsUp, pressed && styles.pressed]}
          testID="headsup-compact"
        >
          <Text style={styles.headsUpText} numberOfLines={1}>
            {`⚠️ ${petName(cautions[0].petId)}: ${cautions[0].text}`}
          </Text>
          <Text style={styles.headsUpMore}>{cautions.length > 1 ? `+${cautions.length - 1}` : "›"}</Text>
        </Pressable>
      ) : null}

      {/* Today's open tasks, always — the one that is due turns into an alarm popup (DueAlert). */}
      <Card style={styles.next} testID="dashboard-next">
        {state.status === "error" ? (
          <Text style={styles.error}>{state.message}</Text>
        ) : open.length > 0 ? (
          <>
            <Text style={styles.nextLabel}>{`Today · ${open.length} to do`}</Text>
            {open.slice(0, TODAY_ROWS).map((item, index) => {
              const status = todayStatus(item.log);
              const dueMs = new Date(item.log.due_at).getTime();
              const tag = status.kind === "missed" ? "⚠️ Overdue" : dueMs <= Date.now() ? "⏰ Due now" : null;
              const snoozed = reminder.snoozedUntil[item.log.id];
              return (
                <View key={item.log.id} style={styles.taskRow} testID={`today-row-${item.log.id}`}>
                  <View style={styles.taskText}>
                    <Text style={styles.nextTitle} numberOfLines={1} testID={index === 0 ? "tasks-next" : undefined}>
                      {`${careTypeMeta(item.task.type).emoji} ${item.task.title}`}
                    </Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      {[item.pet.name, formatTime(isoToZoned(item.log.due_at).time), item.task.dose].filter(Boolean).join(" · ")}
                    </Text>
                    {snoozed ? (
                      <Text style={styles.muted} testID="tasks-snoozed">
                        {`💤 Snoozed until ${new Date(snoozed).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                      </Text>
                    ) : tag ? (
                      <Text style={styles.tag}>{tag}</Text>
                    ) : null}
                  </View>
                  <Button
                    label="Done"
                    onPress={() => setFinishing(item)}
                    style={styles.rowDone}
                    testID={index === 0 ? "dashboard-next-done" : `today-done-${item.log.id}`}
                  />
                </View>
              );
            })}
            {open.length > TODAY_ROWS ? (
              <TextButton label={`+ ${open.length - TODAY_ROWS} more — see all tasks`} onPress={() => router.push("/sitter/tasks")} testID="today-more" />
            ) : null}
          </>
        ) : state.status === "ready" ? (
          <Text style={styles.nextTitle} testID={items.length > 0 ? "tasks-all-done" : "tasks-empty"}>
            {items.length > 0 ? "All done for today 🎉" : "No tasks today"}
          </Text>
        ) : (
          <Text style={styles.muted}>Loading…</Text>
        )}
      </Card>

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
        {shortcut("🕘 My history", () => router.push("/sitter/history"), "shortcut-history")}
      </View>

      <Sheet visible={showCautions} title="Heads-up" onClose={() => setShowCautions(false)} testID="headsup-sheet">
        {pets
          .filter((p) => cautions.some((c) => c.petId === p.id))
          .map((p) => (
            <View key={p.id} style={styles.headsUpGroup}>
              <Text style={styles.nextTitle}>{`${SPECIES_EMOJI[p.species]} ${p.name} — from ${p.ownerName}`}</Text>
              {cautions
                .filter((c) => c.petId === p.id)
                .map((c) => (
                  <Text key={c.id} style={styles.headsUpLine}>{`• ${c.text}`}</Text>
                ))}
            </View>
          ))}
      </Sheet>

      <DueAlert reminder={reminder} paused={finishing != null} onDone={setFinishing} />
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
    taskRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    taskText: { flex: 1, gap: 1 },
    rowDone: { minWidth: 76, minHeight: 40 },
    tag: { fontSize: theme.fontSize.small, fontWeight: "700", color: theme.color.warning },
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
    headsUp: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.warning,
      backgroundColor: theme.color.accent,
    },
    requestLine: { borderColor: theme.color.primary },
    headsUpText: { flex: 1, fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.text },
    headsUpMore: { fontSize: theme.fontSize.small, fontWeight: "700", color: theme.color.primary },
    headsUpGroup: { gap: 2, marginBottom: theme.spacing.sm },
    headsUpLine: { fontSize: theme.fontSize.body, color: theme.color.text },
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
