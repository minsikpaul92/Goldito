import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { Stepper } from "./ui/Stepper";
import { TextButton } from "./ui/TextButton";
import { formatTime, shiftTime, timeToMinutes } from "../features/schedule/dates";
import { CareSlot, ClosingRule, SLOTS } from "../features/schedule/scheduleApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const TIME_STEP = 30;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type SlotHours = Record<CareSlot, [string, string]>;

const ruleKey = (weekday: number, slot: CareSlot) => `${weekday}:${slot}`;

/** Problem with the hours as a sentence, or null when they can be saved. */
export function hoursProblem(hours: SlotHours): string | null {
  for (const { slot, label } of SLOTS) {
    const [start, end] = hours[slot];
    if (start === end) return `${label} needs different start and end times.`;
    // Overnight may end the next morning; the others end the same day.
    if (slot !== "overnight" && timeToMinutes(end) <= timeToMinutes(start)) return `${label} must end after it starts.`;
  }
  return null;
}

type Props = {
  visible: boolean;
  rules: ClosingRule[];
  hours: SlotHours;
  saving: boolean;
  error: string | null;
  onApply: (rules: ClosingRule[], hours: SlotHours) => void;
  onClose: () => void;
};

/**
 * Weekly closing rules: pick the weekdays × slots to close for good, and the hours of the three slots.
 * Nothing picked = open. The result is these rules plus the days closed by hand on the calendar (014d).
 * Remount with a `key` per opening so the draft starts from what is saved.
 */
export function ClosingRulesSheet({ visible, rules, hours, saving, error, onApply, onClose }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [closed, setClosed] = useState(() => new Set(rules.map((r) => ruleKey(r.weekday, r.slot))));
  const [draftHours, setDraftHours] = useState<SlotHours>(hours);
  const problem = hoursProblem(draftHours);

  const toggle = (weekday: number, slot: CareSlot) =>
    setClosed((current) => {
      const next = new Set(current);
      const key = ruleKey(weekday, slot);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setHour = (slot: CareSlot, index: 0 | 1, value: string) =>
    setDraftHours((h) => ({ ...h, [slot]: index === 0 ? [value, h[slot][1]] : [h[slot][0], value] }));

  const apply = () => {
    const picked: ClosingRule[] = [];
    for (const { slot } of SLOTS) {
      for (let weekday = 0; weekday < 7; weekday++) {
        if (closed.has(ruleKey(weekday, slot))) picked.push({ weekday, slot });
      }
    }
    onApply(picked, draftHours);
  };

  return (
    <Sheet
      visible={visible}
      title="Closing rules"
      onClose={onClose}
      testID="rules-sheet"
      footer={
        <Button
          label={saving ? "Applying…" : "Apply"}
          onPress={apply}
          disabled={saving || !!problem}
          testID="rules-apply"
        />
      }
    >
      <Text style={styles.hint}>
        Tap the days and times you never take. Closed slots can't be booked, every week. With nothing picked you are
        open, and owners can find you. Days you close by hand on the calendar stay closed too.
      </Text>

      <View style={styles.grid} testID="rules-grid">
        <View style={styles.row}>
          <View style={styles.rowLabel} />
          {WEEKDAYS.map((name) => (
            <Text key={name} style={styles.weekday} accessibilityElementsHidden importantForAccessibility="no">
              {name}
            </Text>
          ))}
        </View>
        {SLOTS.map(({ slot, label }) => (
          <View key={slot} style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            {WEEKDAYS.map((_, weekday) => {
              const isClosed = closed.has(ruleKey(weekday, slot));
              return (
                <Pressable
                  key={weekday}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Close ${label.toLowerCase()} on ${WEEKDAY_NAMES[weekday]}s`}
                  aria-checked={isClosed}
                  onPress={() => toggle(weekday, slot)}
                  style={[styles.cell, isClosed && styles.cellClosed]}
                  testID={`rule-${slot}-${weekday}`}
                >
                  {isClosed ? <Text style={styles.cross}>✕</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <TextButton label="Open everything" onPress={() => setClosed(new Set())} disabled={closed.size === 0} testID="rules-clear" />

      <Text style={styles.heading}>Hours</Text>
      <Text style={styles.hint}>
        The hours of each slot on days you haven't set by hand. A day you opened by hand keeps its own hours.
      </Text>
      {SLOTS.map(({ slot, label }) => {
        const [start, end] = draftHours[slot];
        return (
          <View key={slot} style={styles.slot}>
            <Text style={styles.slotLabel}>{label}</Text>
            <View style={styles.times}>
              <View style={styles.time}>
                <Text style={styles.caption}>From</Text>
                <Stepper
                  label={`${label} start`}
                  value={formatTime(start)}
                  onDecrease={() => setHour(slot, 0, shiftTime(start, -TIME_STEP))}
                  onIncrease={() => setHour(slot, 0, shiftTime(start, TIME_STEP))}
                  testID={`rules-${slot}-start`}
                />
              </View>
              <View style={styles.time}>
                <Text style={styles.caption}>{slot === "overnight" ? "To (next day)" : "To"}</Text>
                <Stepper
                  label={`${label} end`}
                  value={formatTime(end)}
                  onDecrease={() => setHour(slot, 1, shiftTime(end, -TIME_STEP))}
                  onIncrease={() => setHour(slot, 1, shiftTime(end, TIME_STEP))}
                  testID={`rules-${slot}-end`}
                />
              </View>
            </View>
          </View>
        );
      })}

      {problem ? (
        <Text style={styles.problem} testID="rules-problem">
          {problem}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.problem} testID="rules-error">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    grid: {
      gap: theme.spacing.xs,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    rowLabel: {
      width: 74,
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
    weekday: {
      flex: 1,
      textAlign: "center",
      fontSize: theme.fontSize.caption,
      color: theme.color.textMuted,
    },
    cell: {
      flex: 1,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    cellClosed: {
      backgroundColor: theme.color.border,
    },
    cross: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.bold,
      color: theme.color.text,
    },
    heading: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
      paddingTop: theme.spacing.sm,
    },
    slot: {
      gap: theme.spacing.xs,
      paddingBottom: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    slotLabel: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    times: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
    },
    time: {
      gap: theme.spacing.xs,
    },
    caption: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    problem: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
  });
