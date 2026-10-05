import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  CAUTION_MAX,
  COUNT_MAX,
  DEFAULT_TIME,
  Line,
  LineKind,
  Span,
  kindMeta,
  kindsForSpecies,
  lineSummary,
  presetText,
} from "../features/care/careLines";
import { formatTime } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import type { Species } from "../types/db";
import { Button } from "./ui/Button";
import { Stepper } from "./ui/Stepper";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";
import { TimePickerSheet } from "./ui/TimePickerSheet";

type Props = {
  species: Species;
  lines: Line[];
  onLines: (lines: Line[]) => void;
  disabled?: boolean;
};

const LINE_MAX = 10;
const TEXT_MAX = 60;

/**
 * The owner writes the care request one line at a time: pick a chip (Meals · Medication · Walk ·
 * Heads-up), the text starts with a preset you can edit, then **when** — a time from the wheel, or
 * "N times a day". **Add line** puts it on the list and a fresh chip row appears for the next one.
 */
export function CareLineBuilder({ species, lines, onLines, disabled }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [kind, setKind] = useState<LineKind | null>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"time" | "count">("time");
  const [time, setTime] = useState("08:00");
  const [count, setCount] = useState(2);
  const [span, setSpan] = useState<Span>("day");
  const [picking, setPicking] = useState(false);

  const pick = (k: LineKind) => {
    setKind(k);
    setText("");
    setTime(DEFAULT_TIME[k]);
    setMode("time");
    setCount(2);
    setSpan("day");
  };

  const reset = () => {
    setKind(null);
    setText("");
  };

  // Leaving the box empty uses the hint (the preset); a Heads-up always needs its own words.
  const finalText = kind ? text.trim() || presetText(kind, species) : "";
  const canAdd = kind != null && finalText.length > 0 && lines.length < LINE_MAX;

  const add = () => {
    if (!kind || !canAdd) return;
    const line: Line = {
      key: `line-${Date.now()}-${lines.length}`,
      kind,
      text: finalText,
      when: kind === "headsup" ? { mode: "time", time: "08:00" } : mode === "time" ? { mode: "time", time } : { mode: "count", count },
      span,
    };
    onLines([...lines, line]);
    reset();
  };

  return (
    <View style={styles.root} testID="line-builder">
      {lines.length > 0 ? (
        <View style={styles.list} testID="lines">
          {lines.map((line) => (
            <View key={line.key} style={styles.lineRow} testID={`line-${line.key}`}>
              <Text style={styles.lineText}>{lineSummary(line)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove this line"
                disabled={disabled}
                hitSlop={8}
                onPress={() => onLines(lines.filter((l) => l.key !== line.key))}
                testID={`line-remove-${line.key}`}
              >
                <Text style={styles.x}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>{lines.length === 0 ? "What does your sitter need to know?" : "Add another line"}</Text>
      <View style={styles.chips}>
        {kindsForSpecies(species).map((k) => {
          const on = kind === k.kind;
          return (
            <Pressable
              key={k.kind}
              accessibilityRole="radio"
              aria-checked={on}
              disabled={disabled}
              onPress={() => (on ? reset() : pick(k.kind))}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
              testID={`line-kind-${k.kind}`}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{`${k.emoji} ${k.label}`}</Text>
            </Pressable>
          );
        })}
      </View>

      {kind ? (
        <View style={styles.editor} testID="line-editor">
          <TextField
            label={
              kind === "headsup"
                ? "What should your sitter watch out for?"
                : `${kindMeta(kind).label} — what to give or do (empty = the hint)`
            }
            value={text}
            maxLength={kind === "headsup" ? CAUTION_MAX : TEXT_MAX}
            placeholder={kind === "headsup" ? "e.g. No knocking — text me instead" : presetText(kind, species)}
            onChangeText={setText}
            testID="line-text"
          />
          {kind !== "headsup" ? (
            <>
              <View style={styles.chips}>
                {(["time", "count"] as const).map((m) => (
                  <Pressable
                    key={m}
                    accessibilityRole="radio"
                    aria-checked={mode === m}
                    onPress={() => setMode(m)}
                    style={({ pressed }) => [styles.chip, mode === m && styles.chipOn, pressed && styles.pressed]}
                    testID={`line-mode-${m}`}
                  >
                    <Text style={[styles.chipText, mode === m && styles.chipTextOn]}>{m === "time" ? "At a time" : "Several times"}</Text>
                  </Pressable>
                ))}
              </View>
              {mode === "time" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Time ${formatTime(time)}, tap to change`}
                  onPress={() => setPicking(true)}
                  style={({ pressed }) => [styles.timeButton, pressed && styles.pressed]}
                  testID="line-time"
                >
                  <Text style={styles.timeText}>{formatTime(time)}</Text>
                  <Text style={styles.chevron}>▾</Text>
                </Pressable>
              ) : (
                <View style={styles.countBox}>
                  <Stepper
                    label="Times"
                    value={`${count} times`}
                    actions={["fewer", "more"]}
                    canDecrease={count > 1}
                    canIncrease={count < COUNT_MAX}
                    onDecrease={() => setCount((c) => Math.max(1, c - 1))}
                    onIncrease={() => setCount((c) => Math.min(COUNT_MAX, c + 1))}
                    testID="line-count"
                  />
                  <Text style={styles.hint}>We spread them over the day — you can change each time in the checklist.</Text>
                </View>
              )}
              <View style={styles.chips}>
                {([["day", "Every day"], ["once", "Once"]] as const).map(([s, label]) => (
                  <Pressable
                    key={s}
                    accessibilityRole="radio"
                    aria-checked={span === s}
                    onPress={() => setSpan(s)}
                    style={({ pressed }) => [styles.chip, span === s && styles.chipOn, pressed && styles.pressed]}
                    testID={`line-span-${s}`}
                  >
                    <Text style={[styles.chipText, span === s && styles.chipTextOn]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <View style={styles.actions}>
            <Button label="Add line" onPress={add} disabled={!canAdd || disabled} testID="line-add" />
            <TextButton label="Cancel" onPress={reset} testID="line-cancel" />
          </View>
        </View>
      ) : null}

      <TimePickerSheet
        visible={picking}
        value={time}
        title="Time"
        onClose={() => setPicking(false)}
        onPick={(t) => {
          setTime(t);
          setPicking(false);
        }}
      />
    </View>
  );
}


const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.sm },
    list: { borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
    lineRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.color.border,
    },
    lineText: { flex: 1, fontSize: theme.fontSize.body, color: theme.color.text },
    x: { fontSize: 16, fontWeight: "700", color: theme.color.textMuted, paddingHorizontal: theme.spacing.xs },
    label: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    chip: {
      minHeight: 44,
      paddingHorizontal: theme.spacing.md,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.color.primary,
      backgroundColor: theme.color.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    chipOn: { backgroundColor: theme.color.primary },
    chipText: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.primary },
    chipTextOn: { color: theme.color.primaryText },
    pressed: { opacity: 0.7 },
    editor: {
      gap: theme.spacing.sm,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    timeButton: {
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
    countBox: { gap: theme.spacing.xs },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    actions: { gap: theme.spacing.xs },
  });
