import { router } from "expo-router";
import { useEffect } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { careTypeMeta } from "../features/care/careFormat";
import type { DueReminder } from "../features/care/useDueReminder";
import type { TaskItem } from "../features/care/useTodayTasks";
import { formatTime, isoToZoned } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { TextButton } from "./ui/TextButton";

/** A short double beep + a buzz where the browser allows it (needs a prior tap on the page). */
function alertFeedback() {
  if (Platform.OS !== "web") return;
  try {
    navigator.vibrate?.([200, 100, 200]);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.22].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.14);
    });
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // No sound is fine — the popup itself is the alert.
  }
}

type Props = {
  reminder: DueReminder;
  /** Hide the popup while something else (the Done sheet) is open on top. */
  paused?: boolean;
  onDone: (item: TaskItem) => void;
};

/**
 * Alarm-style popup for a task that is due now (or overdue): Done right there, snooze 10 minutes,
 * or dismiss. Opens by itself over whatever the sitter is looking at on Home.
 */
export function DueAlert({ reminder, paused, onDone }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { current, more, dismiss, snooze } = reminder;
  const logId = current?.item.log.id;

  useEffect(() => {
    if (logId) alertFeedback();
  }, [logId]);

  if (!current) return null;
  const { item, overdue } = current;

  return (
    <Modal visible={!paused} transparent animationType="fade" onRequestClose={() => dismiss(item.log.id)}>
      <View style={styles.backdrop}>
        <View style={[styles.card, overdue && styles.overdue]} accessibilityRole="alert" accessibilityViewIsModal testID="due-alert">
          <Text style={styles.label} testID="due-alert-label">
            {overdue ? "⚠️ Overdue" : "⏰ Due now"}
          </Text>
          <Text style={styles.title} testID="due-alert-title">
            {`${careTypeMeta(item.task.type).emoji} ${item.task.title}`}
          </Text>
          <Text style={styles.meta}>
            {[item.pet.name, formatTime(isoToZoned(item.log.due_at).time), item.task.dose].filter(Boolean).join(" · ")}
          </Text>
          <Button label="Done" onPress={() => onDone(item)} testID="due-alert-done" />
          <Button label="💤 Remind me in 10 min" variant="secondary" onPress={() => snooze(item.log.id)} testID="due-alert-snooze" />
          <View style={styles.foot}>
            <TextButton label="Dismiss" onPress={() => dismiss(item.log.id)} testID="due-alert-dismiss" />
            {more > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => router.push("/sitter/tasks")} testID="due-alert-more">
                <Text style={styles.more}>{`+ ${more} more waiting — see all tasks`}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: "center", padding: theme.spacing.lg, backgroundColor: theme.color.overlay },
    card: {
      gap: theme.spacing.sm,
      padding: theme.spacing.lg,
      borderRadius: theme.radius.lg,
      borderWidth: 2,
      borderColor: theme.color.primary,
      backgroundColor: theme.color.surface,
    },
    overdue: { borderColor: theme.color.warning },
    label: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    title: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    meta: { fontSize: theme.fontSize.body, color: theme.color.textMuted },
    foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" },
    more: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.primary, paddingVertical: 4 },
  });
