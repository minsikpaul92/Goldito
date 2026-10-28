import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { statusIcon, statusLabel, statusTone, todayStatus } from "../features/care/careFormat";
import { useDueReminder } from "../features/care/useDueReminder";
import { TaskItem, TaskPet, useTodayTasks } from "../features/care/useTodayTasks";
import { formatTime, isoToZoned } from "../features/schedule/dates";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Art } from "./art/Art";
import { careArt } from "./careArt";
import { TaskDoneSheet } from "./TaskDoneSheet";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { ScreenSubtitle } from "./ui/ScreenHeader";
import { sectionTitleStyle } from "./ui/SectionTitle";
import { Tag } from "./ui/Tag";

const timeOf = (item: TaskItem) => formatTime(isoToZoned(item.log.due_at).time);

/**
 * Sitter's tasks for today (phase-06 6.3), laid out as the Oct 25 design: the next task on a green block with its own
 * Done, the rest under "Still to do", and what is finished folded under "Done today". Done opens a small sheet
 * (memo + photo + Done).
 */
export function TodayTasks({ pets }: { pets: TaskPet[] }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { state, reload } = useTodayTasks(pets);
  const [finishing, setFinishing] = useState<TaskItem | null>(null);
  const [showDone, setShowDone] = useState(false);

  const names = useMemo(() => pets.map((p) => p.name).join(" & "), [pets]);
  const items = state.status === "ready" ? state.items : [];
  // The full list also tells you (toast) when a task becomes due; the banner lives on Home.
  useDueReminder(items, state.status === "ready", reload);
  if (pets.length === 0) return null;

  const open = items.filter((i) => i.log.status === "pending");
  const done = items.filter((i) => i.log.status === "done");
  const next = open.find((i) => todayStatus(i.log).kind !== "missed") ?? open[0];
  const rest = open.filter((i) => i !== next);
  const counts = state.status === "ready" && items.length > 0 ? `${open.length} left · ${done.length} done` : null;

  return (
    <View style={styles.section} testID="today-tasks">
      {/* The screen's title ("Tasks") is in the stack header. */}
      <ScreenSubtitle testID="tasks-count">{counts ? `${names} · ${counts}` : names}</ScreenSubtitle>

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
        <View style={styles.allDone} testID="tasks-all-done">
          <Art name="snap/sticker-paw" size={32} />
          <Text style={styles.allDoneText}>All done for today</Text>
        </View>
      ) : null}

      {next ? (
        <View style={styles.next} testID="tasks-next">
          <View style={styles.nextHead}>
            <Text style={styles.kicker}>{`Next up · ${timeOf(next)}`}</Text>
            <Art name={careArt(next.task.type, theme).art} size={44} />
          </View>
          <Text style={styles.nextTitle}>{`${next.pet.name} · ${next.task.title}`}</Text>
          {next.task.dose || next.task.notes ? (
            <Text style={styles.nextSub}>{[next.task.dose, next.task.notes].filter(Boolean).join(" · ")}</Text>
          ) : null}
          <View style={styles.nextTag}>
            <StatusTag item={next} />
          </View>
          <Button
            label="Done"
            variant="secondary"
            accessibilityLabel={`Done: ${next.pet.name} ${next.task.title}`}
            onPress={() => setFinishing(next)}
            style={styles.nextDone}
            testID={`task-done-${next.log.id}`}
          />
        </View>
      ) : null}

      {rest.length > 0 ? (
        <View style={styles.headRow}>
          <Text accessibilityRole="header" style={styles.heading}>
            Still to do
          </Text>
          <Text style={styles.mutedBold}>{`${rest.length} more`}</Text>
        </View>
      ) : null}

      {rest.map((item) => {
        const { art, tint } = careArt(item.task.type, theme);
        return (
          <View key={item.log.id} style={styles.task} testID={`task-${item.log.id}`}>
            <View style={[styles.tile, { backgroundColor: tint }]}>
              <Art name={art} size={40} />
            </View>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.task.title}
                </Text>
                <StatusTag item={item} />
              </View>
              <Text style={styles.muted} numberOfLines={1}>
                {[item.pet.name, timeOf(item), item.task.dose ?? item.task.notes].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Button
              label="Done"
              variant="secondary"
              accessibilityLabel={`Done: ${item.pet.name} ${item.task.title}`}
              onPress={() => setFinishing(item)}
              style={styles.rowDone}
              testID={`task-done-${item.log.id}`}
            />
          </View>
        );
      })}

      {done.length > 0 ? (
        <View style={styles.doneCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDone }}
            onPress={() => setShowDone((v) => !v)}
            style={styles.toggle}
            testID="tasks-done-toggle"
          >
            <Icon name={showDone ? "expand" : "forward"} size={18} color={theme.color.primary} />
            <Text style={styles.toggleText}>{`Done today (${done.length})`}</Text>
          </Pressable>
          {showDone
            ? done.map((item) => (
                <View key={item.log.id} style={styles.finished}>
                  <Icon name="check" size={18} strokeWidth={2.5} color={theme.color.success} />
                  <Text style={styles.finishedText} testID={`task-finished-${item.log.id}`}>
                    {`${item.task.title} · ${item.pet.name}`}
                    {item.log.note_text ? <Text style={styles.quote}>{` · “${item.log.note_text}”`}</Text> : null}
                  </Text>
                  <Text style={styles.time}>{formatTime(isoToZoned(item.log.completed_at ?? item.log.due_at).time)}</Text>
                </View>
              ))
            : null}
        </View>
      ) : null}

      <TaskDoneSheet item={finishing} onClose={() => setFinishing(null)} onDone={() => void reload()} />
    </View>
  );
}

/** Pending or Missed, as a flat Tag (late is gold, never red). */
function StatusTag({ item }: { item: TaskItem }) {
  const status = todayStatus(item.log);
  const label = statusLabel(status);
  if (!label) return null;
  return <Tag label={label} tone={statusTone(status)} icon={statusIcon(status)} testID={`task-status-${item.log.id}`} />;
}

const makeStyles = (theme: Theme) => {
  const display = theme.fontFamily.display;
  const block = theme.ui.radius.block;
  return StyleSheet.create({
    section: { gap: theme.spacing.sm + 2 },
    headRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: theme.spacing.xs },
    heading: sectionTitleStyle(theme),
    gap: { gap: theme.spacing.xs },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    mutedBold: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.textMuted },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
    allDone: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: block,
      backgroundColor: theme.color.accent,
    },
    allDoneText: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },

    // The next task: one green block, white words, its own Done.
    next: { gap: theme.spacing.xs, padding: theme.spacing.md + 2, borderRadius: block, backgroundColor: theme.color.primary },
    nextHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
    kicker: {
      flex: 1,
      fontSize: theme.fontSize.small,
      fontWeight: theme.fontWeight.bold,
      letterSpacing: 0.7,
      textTransform: "uppercase",
      color: theme.color.primaryText,
    },
    nextTitle: {
      fontSize: theme.fontSize.title,
      lineHeight: theme.fontSize.title + 4,
      color: theme.color.primaryText,
      ...(display ? { fontFamily: display } : { fontWeight: theme.fontWeight.bold }),
    },
    nextSub: { fontSize: theme.fontSize.small, color: theme.color.accent },
    nextTag: { flexDirection: "row", marginTop: theme.spacing.xs },
    nextDone: { marginTop: theme.spacing.sm },

    // The rest: a white row with a tinted drawing, the words, and a small Done.
    task: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm + 4,
      padding: theme.spacing.sm,
      minHeight: 68,
      borderRadius: block,
      backgroundColor: theme.color.surface,
    },
    tile: { width: 48, height: 48, borderRadius: theme.radius.lg, alignItems: "center", justifyContent: "center" },
    body: { flex: 1, minWidth: 0, gap: 2 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs + 2, flexWrap: "wrap" },
    title: { flexShrink: 1, fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    rowDone: { minHeight: 44, paddingVertical: 0, paddingHorizontal: theme.spacing.md },

    // Done today: one white card, folded.
    doneCard: {
      gap: theme.spacing.xs + 2,
      paddingHorizontal: theme.spacing.sm + 6,
      paddingTop: theme.spacing.xs,
      paddingBottom: theme.spacing.sm + 6,
      borderRadius: block,
      backgroundColor: theme.color.surface,
    },
    toggle: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, minHeight: 44, alignSelf: "flex-start" },
    toggleText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.primary },
    finished: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    finishedText: { flex: 1, minWidth: 0, fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    quote: { fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    time: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.textMuted, fontVariant: ["tabular-nums"] },
  });
};
