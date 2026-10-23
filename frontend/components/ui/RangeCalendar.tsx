import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "./Icon";
import { addMonths, dayOfMonth, formatMonth, monthGrid, monthStart } from "../../features/schedule/dates";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  start: string;
  end: string;
  /** Earlier days are disabled. */
  minDay: string;
  /** Tap one day to start a range, a later day to end it (the same day is a one-day stay). */
  onChange: (start: string, end: string) => void;
  testID?: string;
};

/** A month grid for a date range: first tap sets the start, second tap the end (DESIGN.md §7.7, mouse and touch). */
export function RangeCalendar({ start, end, minDay, onChange, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [month, setMonth] = useState(monthStart(start));
  // true while the next tap picks the end of the range
  const [picking, setPicking] = useState(false);
  useEffect(() => setMonth(monthStart(start)), [start]);

  const canGoPrev = monthStart(minDay) < month;

  const tap = (day: string) => {
    if (picking && day >= start) {
      onChange(start, day);
      setPicking(false);
    } else {
      onChange(day, day);
      setPicking(true);
    }
  };

  return (
    <View testID={testID}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          disabled={!canGoPrev}
          onPress={() => setMonth(addMonths(month, -1))}
          style={[styles.nav, !canGoPrev && styles.disabled]}
          testID={testID ? `${testID}-prev` : undefined}
        >
          <Icon name="back" size={theme.icon.sm} color={theme.color.primary} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.month}>
          {formatMonth(month)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => setMonth(addMonths(month, 1))}
          style={styles.nav}
          testID={testID ? `${testID}-next` : undefined}
        >
          <Icon name="forward" size={theme.icon.sm} color={theme.color.primary} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      {monthGrid(month).map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={styles.cell} />;
            const disabled = day < minDay;
            const edge = day === start || day === end;
            const inside = day > start && day < end;
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={day}
                accessibilityState={{ selected: edge, disabled }}
                disabled={disabled}
                onPress={() => tap(day)}
                style={[styles.cell, inside && styles.inside, day === start && end > start && styles.insideStart, day === end && end > start && styles.insideEnd]}
                testID={testID ? `${testID}-${day}` : undefined}
              >
                <View style={[styles.day, edge && styles.edge, disabled && styles.disabled]}>
                  <Text style={[styles.dayText, edge && styles.edgeText]}>{dayOfMonth(day)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    nav: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    month: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    week: { flexDirection: "row" },
    weekday: { flex: 1, textAlign: "center", fontSize: theme.fontSize.small, color: theme.color.textMuted, paddingVertical: 4 },
    cell: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" },
    inside: { backgroundColor: theme.color.accent },
    insideStart: { backgroundColor: theme.color.accent, borderTopLeftRadius: 22, borderBottomLeftRadius: 22 },
    insideEnd: { backgroundColor: theme.color.accent, borderTopRightRadius: 22, borderBottomRightRadius: 22 },
    day: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    dayText: { fontSize: theme.fontSize.body, color: theme.color.text },
    edge: { backgroundColor: theme.color.primary },
    edgeText: { color: theme.color.primaryText, fontWeight: theme.fontWeight.bold },
    disabled: { opacity: 0.3 },
  });
