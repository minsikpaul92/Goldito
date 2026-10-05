import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DraftTask } from "../features/care/carePlanApi";
import { careTypeMeta } from "../features/care/careFormat";
import { formatTime } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Chip } from "./ui/Chip";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";
import { TimePickerSheet } from "./ui/TimePickerSheet";

type Props = {
  tasks: DraftTask[];
  onTasks: (tasks: DraftTask[]) => void;
  cautions: string[];
  onCautions: (cautions: string[]) => void;
  skipped: { type: string; title: string; reason: string }[];
};

const CAUTION_MAX = 100;

/**
 * The checklist the AI drafted from the owner's note, to read and fix before saving: each task's
 * name, dose and time can be changed or the task removed; Heads-ups can be removed or added;
 * what was left out is listed with the reason.
 */
export function ChecklistCard({ tasks, onTasks, cautions, onCautions, skipped }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [pickingTime, setPickingTime] = useState<string | null>(null);
  const [newCaution, setNewCaution] = useState("");
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const notSeen = skipped.map((s, i) => ({ ...s, id: `${s.title}-${i}` })).filter((s) => !seen.has(s.id));

  const patch = (key: string, change: Partial<DraftTask>) =>
    onTasks(tasks.map((t) => (t.key === key ? { ...t, ...change } : t)));

  const addCaution = () => {
    const text = newCaution.trim();
    if (!text || cautions.some((c) => c.toLowerCase() === text.toLowerCase())) return;
    onCautions([...cautions, text]);
    setNewCaution("");
  };

  const picking = tasks.find((t) => t.key === pickingTime);

  return (
    <View style={styles.root} testID="checklist">
      <Text accessibilityRole="header" style={styles.heading}>
        Checklist for your sitter
      </Text>
      {tasks.length === 0 ? (
        <Text style={styles.muted} testID="checklist-empty">
          No tasks with a clock time were found. Add times to your note and try again, or add tasks by hand later.
        </Text>
      ) : null}

      {tasks.map((task) => (
        <Card key={task.key} style={styles.card} testID={`draft-${task.key}`}>
          <View style={styles.head}>
            <Text style={styles.type}>{`${careTypeMeta(task.type).emoji} ${careTypeMeta(task.type).label}`}</Text>
            <TextButton label="Remove" danger onPress={() => onTasks(tasks.filter((t) => t.key !== task.key))} testID={`draft-remove-${task.key}`} />
          </View>
          <TextField
            label="Name"
            value={task.title}
            maxLength={60}
            onChangeText={(title) => patch(task.key, { title })}
            testID={`draft-title-${task.key}`}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Time ${formatTime(task.time)}, tap to change`}
            onPress={() => setPickingTime(task.key)}
            style={({ pressed }) => [styles.time, pressed && styles.pressed]}
            testID={`draft-time-${task.key}`}
          >
            <Text style={styles.timeText}>{formatTime(task.time)} · every day</Text>
            <Text style={styles.chevron}>▾</Text>
          </Pressable>
          <TextField
            label="Dose or how to give it (optional)"
            value={task.dose}
            maxLength={60}
            onChangeText={(dose) => patch(task.key, { dose })}
            testID={`draft-dose-${task.key}`}
          />
        </Card>
      ))}

      {notSeen.length > 0 ? (
        <View style={styles.skipped} testID="checklist-skipped" accessibilityRole="alert">
          <Text style={styles.skippedTitle}>Left out — not on the checklist</Text>
          {notSeen.map((s) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss: ${s.title}`}
              onPress={() => setSeen((prev) => new Set(prev).add(s.id))}
              style={({ pressed }) => [styles.skippedRow, pressed && styles.pressed]}
              testID={`skipped-ack-${s.id}`}
            >
              <Text style={styles.skippedText}>{`${s.title} — ${s.reason}`}</Text>
              <Text style={styles.skippedX}>✕</Text>
            </Pressable>
          ))}
          <Text style={styles.skippedHint}>Tap an item to dismiss it.</Text>
        </View>
      ) : null}

      <Text accessibilityRole="header" style={styles.heading}>
        Heads-up
      </Text>
      <Text style={styles.muted}>Your sitter sees these at the top of Home and on booking requests.</Text>
      <View style={styles.chips} testID="cautions">
        {cautions.map((c, i) => (
          <Chip key={`${c}-${i}`} label={c} onRemove={() => onCautions(cautions.filter((_, j) => j !== i))} testID={`caution-${i}`} />
        ))}
      </View>
      <TextField
        label="Add a Heads-up"
        value={newCaution}
        maxLength={CAUTION_MAX}
        placeholder="e.g. No knocking — text me instead"
        onChangeText={setNewCaution}
        onSubmitEditing={addCaution}
        testID="caution-input"
      />
      <Button label="Add Heads-up" variant="secondary" onPress={addCaution} disabled={!newCaution.trim()} testID="caution-add" />

      <TimePickerSheet
        visible={picking != null}
        value={picking?.time ?? "08:00"}
        title="Task time (every day)"
        onClose={() => setPickingTime(null)}
        onPick={(time) => {
          if (picking) patch(picking.key, { time });
          setPickingTime(null);
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.sm },
    heading: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    card: { gap: theme.spacing.xs },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    type: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    time: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    timeText: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    chevron: { fontSize: 22, color: theme.color.textMuted },
    pressed: { opacity: 0.8 },
    skipped: {
      gap: theme.spacing.xs,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.error,
    },
    skippedTitle: { fontSize: theme.fontSize.body, fontWeight: "700", color: "#FFFFFF" },
    skippedRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.sm,
      backgroundColor: "rgba(255,255,255,0.16)",
    },
    skippedText: { flex: 1, fontSize: theme.fontSize.body, color: "#FFFFFF" },
    skippedX: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
    skippedHint: { fontSize: theme.fontSize.small, color: "#FFFFFF", opacity: 0.85 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
  });
