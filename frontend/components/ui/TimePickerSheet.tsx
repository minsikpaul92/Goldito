import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatTime } from "../../features/schedule/dates";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

type Props = {
  visible: boolean;
  /** "HH:MM", 24 h. */
  value: string;
  title?: string;
  onClose: () => void;
  onPick: (time: string) => void;
  testID?: string;
};

const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n: number) => String(n).padStart(2, "0");

function split(value: string) {
  const [h, m] = value.split(":").map(Number);
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute: m, pm: h >= 12 };
}

function join(hour12: number, minute: number, pm: boolean) {
  return `${pad((hour12 % 12) + (pm ? 12 : 0))}:${pad(minute)}`;
}

/**
 * Tap-to-pick time: hour, minute (every 5) and AM/PM are buttons — no steppers, no typing, works
 * the same with a mouse or a finger (DESIGN.md §7.7).
 */
export function TimePickerSheet({ visible, value, title = "Pick a time", onClose, onPick, testID = "time-picker" }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState(split(value));

  useEffect(() => {
    if (visible) setDraft(split(value));
  }, [visible, value]);

  const chip = (label: string, selected: boolean, onPress: () => void, id: string) => (
    <Pressable
      key={id}
      accessibilityRole="radio"
      // react-native-web ignores accessibilityState.checked; aria-checked reaches the DOM.
      aria-checked={selected}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
      testID={id}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      testID={testID}
      footer={
        <Button
          label={`Set ${formatTime(join(draft.hour12, draft.minute, draft.pm))}`}
          onPress={() => onPick(join(draft.hour12, draft.minute, draft.pm))}
          testID={`${testID}-set`}
        />
      }
    >
      <View style={styles.row} accessibilityRole="radiogroup">
        {chip("AM", !draft.pm, () => setDraft((d) => ({ ...d, pm: false })), "time-ampm-am")}
        {chip("PM", draft.pm, () => setDraft((d) => ({ ...d, pm: true })), "time-ampm-pm")}
      </View>
      <Text style={styles.label}>Hour</Text>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {HOURS.map((h) => chip(String(h), draft.hour12 === h, () => setDraft((d) => ({ ...d, hour12: h })), `time-hour-${h}`))}
      </View>
      <Text style={styles.label}>Minute</Text>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {MINUTES.map((m) => chip(pad(m), draft.minute === m, () => setDraft((d) => ({ ...d, minute: m })), `time-min-${pad(m)}`))}
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: theme.spacing.sm },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    label: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    chip: {
      minWidth: 52,
      minHeight: 44,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    chipOn: { borderColor: theme.color.primary, backgroundColor: theme.color.accent },
    chipText: { fontSize: theme.fontSize.body, fontWeight: "600", color: theme.color.textMuted },
    chipTextOn: { color: theme.color.text },
  });
