import Ionicons from "@expo/vector-icons/Ionicons";
import { Platform, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";

import { dayOfMonth, formatDay, formatMonth, monthGrid } from "../features/schedule/dates";
import { DaySlot, SLOTS, SlotState, slotKey } from "../features/schedule/scheduleApi";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

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

/** A slot an owner can't book: blocked by the sitter, fully booked, or not opened. */
const unavailable = (state: SlotState) => state !== "open";

/**
 * Month grid, one column per weekday. Each day cell is split into three horizontal bands — morning, afternoon,
 * overnight, top to bottom — behind the date, and a band is hatched (diagonal stripes) when that slot can't be booked,
 * so the state is a pattern and not a color (DESIGN.md §9). Past days are greyed out. Why a slot is unavailable is in the detail list under the
 * calendar. Range selection is two clicks (start, end) — no drag (phase-03b, D25).
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

  // Stripes are CSS on web: one hatch over the whole cell, with a plain layer on the open slots, so the three bands
  // share one pattern. Native needs react-native-svg (not installed), so an unavailable slot there is a flat muted fill.
  const stripe = `color-mix(in srgb, ${theme.color.borderStrong} 45%, transparent)`;
  const web = Platform.OS === "web";
  const hatch: ViewStyle = web
    ? ({
        backgroundImage: `repeating-linear-gradient(135deg, ${stripe} 0, ${stripe} 1px, transparent 1px, transparent 4px)`,
      } as unknown as ViewStyle)
    : { backgroundColor: theme.color.border };
  const cellStyle = (past: boolean) => [styles.thirds, web && !past && hatch];
  const thirdStyle = (state: SlotState, past: boolean) => [
    styles.third,
    web ? !unavailable(state) && !past && styles.thirdOpen : unavailable(state) && !past && styles.thirdMuted,
  ];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          disabled={!canGoPrev}
          onPress={onPrevMonth}
          style={[styles.navButton, !canGoPrev && styles.disabled]}
          testID="calendar-prev"
        >
          <Ionicons name="chevron-back" size={theme.icon.sm} color={theme.color.primary} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.month} testID="calendar-month">
          {formatMonth(month)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={onNextMonth}
          style={styles.navButton}
          testID="calendar-next"
        >
          <Ionicons name="chevron-forward" size={theme.icon.sm} color={theme.color.primary} />
        </Pressable>
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
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={label}
                aria-selected={selected}
                disabled={past}
                onPress={() => onSelectDay(day)}
                style={[styles.cell, styles.day, selected && styles.selected, past && styles.past]}
                testID={`day-${day}`}
              >
                <View style={cellStyle(past)} pointerEvents="none">
                  {SLOTS.map(({ slot }, k) => (
                    <View key={slot} style={thirdStyle(states[k], past)} testID={`third-${day}-${slot}`} />
                  ))}
                </View>
                <Text style={[styles.date, day === today && styles.today]}>{dayOfMonth(day)}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no">
        <View style={styles.legendItem}>
          <View style={styles.swatch} />
          <Text style={styles.legendText}>Available</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, hatch]} />
          <Text style={styles.legendText}>Not available</Text>
        </View>
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
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    disabled: {
      opacity: 0.3,
    },
    month: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
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
      fontWeight: theme.fontWeight.bold,
      color: theme.color.primary,
      textDecorationLine: "underline",
    },
    thirds: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: "column",
      overflow: "hidden",
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    third: {
      flex: 1,
    },
    thirdOpen: {
      backgroundColor: theme.color.surface,
    },
    thirdMuted: {
      backgroundColor: theme.color.border,
    },
    swatch: {
      width: 24,
      height: 12,
      overflow: "hidden",
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
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
