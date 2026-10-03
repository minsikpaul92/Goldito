import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { dayOfMonth, formatDay, formatMonth, monthGrid } from "../features/schedule/dates";
import { DaySlot, SLOTS, SlotState, slotKey } from "../features/schedule/scheduleApi";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { PressableScale } from "./ui/PressableScale";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export const STATE_LABEL: Record<SlotState, string> = {
  open: "Open",
  full: "Full",
  blocked: "Blocked",
  closed: "Closed",
};

type Props = {
  /** Any day in the month to show. */
  month: string;
  today: string;
  slots: Map<string, DaySlot>;
  /** Inclusive range; from === to for one day. */
  selection: { from: string; to: string } | null;
  onSelectDay: (day: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canGoPrev: boolean;
};

/**
 * Month grid, one column per weekday, three slot letters (M · A · N) per day. States differ
 * by fill and strike-through as well as color (DESIGN.md §9). Past days are disabled.
 * Range selection is two clicks (start, end) — no drag (phase-03b, D25).
 */
export function SlotCalendar({
  month,
  today,
  slots,
  selection,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  canGoPrev,
}: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const pillStyle = (state: SlotState) => [styles.pill, styles[`pill_${state}`]];
  const letterStyle = (state: SlotState) => [styles.letter, styles[`letter_${state}`]];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          disabled={!canGoPrev}
          onPress={onPrevMonth}
          style={[styles.navButton, !canGoPrev && styles.disabled]}
          testID="calendar-prev"
        >
          <Ionicons name="chevron-back" size={theme.icon.sm} color={theme.color.primary} />
        </PressableScale>
        <Text accessibilityRole="header" style={styles.month} testID="calendar-month">
          {formatMonth(month)}
        </Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={onNextMonth}
          style={styles.navButton}
          testID="calendar-next"
        >
          <Ionicons name="chevron-forward" size={theme.icon.sm} color={theme.color.primary} />
        </PressableScale>
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((name, i) => (
          <Text key={i} style={styles.weekday} accessibilityElementsHidden importantForAccessibility="no">
            {name}
          </Text>
        ))}
      </View>

      {monthGrid(month).map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((day, i) => {
            if (!day) return <View key={i} style={styles.cell} />;
            const past = day < today;
            const selected = !!selection && selection.from <= day && day <= selection.to;
            const states = SLOTS.map(({ slot }) => slots.get(slotKey(day, slot))?.state ?? "closed");
            const label = `${formatDay(day)}: ${SLOTS.map((s, k) => `${s.label} ${STATE_LABEL[states[k]].toLowerCase()}`).join(", ")}`;
            return (
              <PressableScale
                key={day}
                accessibilityRole="button"
                accessibilityLabel={label}
                aria-selected={selected}
                disabled={past}
                onPress={() => onSelectDay(day)}
                style={[styles.cell, styles.day, selected && styles.selected, past && styles.past]}
                testID={`day-${day}`}
              >
                <Text style={[styles.date, day === today && styles.today]}>{dayOfMonth(day)}</Text>
                <View style={styles.pills}>
                  {SLOTS.map(({ slot, short }, k) => (
                    <View key={slot} style={pillStyle(states[k])}>
                      <Text style={letterStyle(states[k])}>{short}</Text>
                    </View>
                  ))}
                </View>
              </PressableScale>
            );
          })}
        </View>
      ))}

      <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no">
        {(Object.keys(STATE_LABEL) as SlotState[]).map((state) => (
          <View key={state} style={styles.legendItem}>
            <View style={pillStyle(state)}>
              <Text style={letterStyle(state)}>M</Text>
            </View>
            <Text style={styles.legendText}>{STATE_LABEL[state]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      gap: theme.spacing.xs,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    navButton: {
      width: theme.layout.touchTarget,
      height: theme.layout.touchTarget,
      alignItems: "center",
      justifyContent: "center",
    },
    disabled: {
      opacity: 0.3,
    },
    month: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    week: {
      flexDirection: "row",
      gap: 2,
    },
    weekday: {
      flex: 1,
      textAlign: "center",
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    cell: {
      flex: 1,
      minHeight: 52,
    },
    day: {
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      borderRadius: theme.radius.sm,
      borderWidth: 2,
      borderColor: "transparent",
    },
    selected: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.surface,
    },
    past: {
      opacity: 0.35,
    },
    date: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
    today: {
      fontWeight: "700",
      color: theme.color.primary,
      textDecorationLine: "underline",
    },
    pills: {
      flexDirection: "row",
      gap: 2,
    },
    pill: {
      width: 14,
      height: 16,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 4,
      borderWidth: 1,
    },
    pill_open: {
      backgroundColor: theme.color.accent,
      borderColor: theme.color.accent,
    },
    pill_full: {
      backgroundColor: theme.color.primary,
      borderColor: theme.color.primary,
    },
    pill_blocked: {
      backgroundColor: theme.color.surface,
      borderColor: theme.color.textMuted,
    },
    pill_closed: {
      backgroundColor: "transparent",
      borderColor: theme.color.border,
    },
    letter: {
      fontSize: theme.fontSize.caption,
      fontWeight: "600",
    },
    letter_open: {
      color: theme.color.primary,
    },
    letter_full: {
      color: theme.color.primaryText,
    },
    letter_blocked: {
      color: theme.color.textMuted,
      textDecorationLine: "line-through",
    },
    letter_closed: {
      color: theme.color.border,
    },
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    legendText: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
  });
