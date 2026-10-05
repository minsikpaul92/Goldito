import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { careTypeMeta } from "../features/care/careFormat";
import type { DueReminder } from "../features/care/useDueReminder";
import type { TaskItem } from "../features/care/useTodayTasks";
import { formatTime, isoToZoned } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { TextButton } from "./ui/TextButton";

/** Top-of-Home reminder for a task that is due now (or overdue): Done right there, or dismiss. */
export function DueBanner({ reminder, onDone }: { reminder: DueReminder; onDone: (item: TaskItem) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { current, more, dismiss, snooze } = reminder;
  if (!current) return null;
  const { item, overdue } = current;

  return (
    <View style={[styles.root, overdue && styles.overdue]} accessibilityRole="alert" testID="due-banner">
      <View style={styles.head}>
        <Text style={styles.label} testID="due-banner-label">
          {overdue ? "⚠️ Overdue" : "⏰ Due now"}
        </Text>
        <View style={styles.headActions}>
          <TextButton label="💤 Remind me in 10 min" onPress={() => snooze(item.log.id)} testID="due-banner-snooze" />
          <TextButton label="✕" onPress={() => dismiss(item.log.id)} testID="due-banner-dismiss" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.body}>
          <Text style={styles.title} testID="due-banner-title">
            {`${careTypeMeta(item.task.type).emoji} ${item.task.title}`}
          </Text>
          <Text style={styles.meta}>
            {[item.pet.name, formatTime(isoToZoned(item.log.due_at).time), item.task.dose].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <Button label="Done" onPress={() => onDone(item)} style={styles.done} testID="due-banner-done" />
      </View>
      {more > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/sitter/tasks")} testID="due-banner-more">
          <Text style={styles.more}>{`+ ${more} more waiting — see all tasks`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      gap: 2,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.lg,
      borderWidth: 2,
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
    },
    overdue: { borderColor: theme.color.warning },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: -4 },
    headActions: { flexDirection: "row", alignItems: "center" },
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    body: { flex: 1, gap: 2 },
    done: { minWidth: 88 },
    label: { fontSize: theme.fontSize.small, fontWeight: "700", color: theme.color.text },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    meta: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    more: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.primary, paddingVertical: 4 },
  });
