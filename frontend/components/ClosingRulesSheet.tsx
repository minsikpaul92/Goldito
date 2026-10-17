import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { Stepper } from "./ui/Stepper";
import { TextButton } from "./ui/TextButton";
import { formatTime, shiftTime, timeToMinutes } from "../features/schedule/dates";
import { CareSlot, ClosingRule, SLOTS, WeekdayHour } from "../features/schedule/scheduleApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const TIME_STEP = 30;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type SlotHours = Record<CareSlot, [string, string]>;

const ruleKey = (weekday: number, slot: CareSlot) => `${weekday}:${slot}`;

/** Problem with one slot's hours as a sentence, or null when they are fine. */
function slotProblem(slot: CareSlot, label: string, [start, end]: [string, string], where: string): string | null {
  if (start === end) return `${label}${where} needs different start and end times.`;
  // Overnight may end the next morning; the others end the same day.
  if (slot !== "overnight" && timeToMinutes(end) <= timeToMinutes(start)) return `${label}${where} must end after it starts.`;
  return null;
}

type DayOverrides = Partial<Record<number, Partial<Record<CareSlot, [string, string]>>>>;

/** Problem with the every-day hours or any weekday's own hours, or null when they can be saved. */
export function hoursProblem(hours: SlotHours, byDay: DayOverrides = {}): string | null {
  for (const { slot, label } of SLOTS) {
    const problem = slotProblem(slot, label, hours[slot], "");
    if (problem) return problem;
  }
  for (let weekday = 0; weekday < 7; weekday++) {
    for (const { slot, label } of SLOTS) {
      const own = byDay[weekday]?.[slot];
      const problem = own && slotProblem(slot, label, own, ` on ${WEEKDAY_NAMES[weekday]}s`);
      if (problem) return problem;
    }
  }
  return null;
}

type Props = {
  visible: boolean;
  rules: ClosingRule[];
  hours: SlotHours;
  weekdayHours: WeekdayHour[];
  saving: boolean;
  error: string | null;
  onApply: (rules: ClosingRule[], hours: SlotHours, weekdayHours: WeekdayHour[]) => void;
  onClose: () => void;
};

/**
 * Weekly closing rules: pick the weekdays × slots to close for good, and the hours of the three slots.
 * Nothing picked = open. The result is these rules plus the days closed by hand on the calendar (014d).
 * Remount with a `key` per opening so the draft starts from what is saved.
 */
export function ClosingRulesSheet({ visible, rules, hours, weekdayHours, saving, error, onApply, onClose }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [closed, setClosed] = useState(() => new Set(rules.map((r) => ruleKey(r.weekday, r.slot))));
  const [draftHours, setDraftHours] = useState<SlotHours>(hours);
  // Hours a single weekday keeps for itself; `view` is which hours the steppers edit: every day, or one weekday.
  const [byDay, setByDay] = useState<DayOverrides>(() => {
    const own: DayOverrides = {};
    for (const h of weekdayHours) own[h.weekday] = { ...own[h.weekday], [h.slot]: [h.startsAt, h.endsAt] };
    return own;
  });
  const [view, setView] = useState<"all" | number>("all");
  const problem = hoursProblem(draftHours, byDay);

  const shown = (slot: CareSlot): [string, string] =>
    view === "all" ? draftHours[slot] : (byDay[view]?.[slot] ?? draftHours[slot]);
  const hasOwn = (weekday: number) => Object.keys(byDay[weekday] ?? {}).length > 0;

  const toggle = (weekday: number, slot: CareSlot) =>
    setClosed((current) => {
      const next = new Set(current);
      const key = ruleKey(weekday, slot);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setHour = (slot: CareSlot, index: 0 | 1, value: string) => {
    const [start, end] = shown(slot);
    const next: [string, string] = index === 0 ? [value, end] : [start, value];
    if (view === "all") setDraftHours((h) => ({ ...h, [slot]: next }));
    else setByDay((d) => ({ ...d, [view]: { ...d[view], [slot]: next } }));
  };

  const apply = () => {
    const picked: ClosingRule[] = [];
    for (const { slot } of SLOTS) {
      for (let weekday = 0; weekday < 7; weekday++) {
        if (closed.has(ruleKey(weekday, slot))) picked.push({ weekday, slot });
      }
    }
    // Only the hours that differ from the every-day hours are kept as a weekday's own.
    const own: WeekdayHour[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      for (const { slot } of SLOTS) {
        const pair = byDay[weekday]?.[slot];
        if (pair && (pair[0] !== draftHours[slot][0] || pair[1] !== draftHours[slot][1])) {
          own.push({ weekday, slot, startsAt: pair[0], endsAt: pair[1] });
        }
      }
    }
    onApply(picked, draftHours, own);
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
        The hours of each slot on days you haven't set by hand. Pick a weekday to give it its own hours; the others keep
        the every-day hours. A day you opened by hand keeps its own hours.
      </Text>
      <View style={styles.dayChips} testID="rules-hours-days">
        {(["all", 0, 1, 2, 3, 4, 5, 6] as const).map((day) => {
          const selected = view === day;
          const label = day === "all" ? "Every day" : WEEKDAYS[day];
          return (
            <Pressable
              key={String(day)}
              accessibilityRole="button"
              accessibilityLabel={day === "all" ? "Hours for every day" : `Hours for ${WEEKDAY_NAMES[day]}s`}
              aria-pressed={selected}
              onPress={() => setView(day)}
              style={[styles.dayChip, selected && styles.dayChipOn]}
              testID={`rules-hours-day-${day}`}
            >
              <Text style={[styles.dayChipText, selected && styles.dayChipTextOn]}>
                {day !== "all" && hasOwn(day) ? `${label} •` : label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {view !== "all" ? (
        <View style={styles.dayNote}>
          <Text style={styles.hint}>
            {hasOwn(view) ? `${WEEKDAY_NAMES[view]}s have their own hours.` : `${WEEKDAY_NAMES[view]}s use the every-day hours.`}
          </Text>
          {hasOwn(view) ? (
            <TextButton
              label="Same as every day"
              onPress={() => setByDay((d) => ({ ...d, [view]: undefined }))}
              testID="rules-hours-reset"
            />
          ) : null}
        </View>
      ) : null}
      {SLOTS.map(({ slot, label }) => {
        const [start, end] = shown(slot);
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
    dayChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    dayChip: {
      minHeight: 36,
      paddingHorizontal: theme.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    dayChipOn: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.primary,
    },
    dayChipText: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
    dayChipTextOn: {
      color: theme.color.primaryText,
    },
    dayNote: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
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
