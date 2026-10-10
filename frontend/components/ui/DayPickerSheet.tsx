import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { addMonths, dayOfMonth, formatMonth, monthGrid, monthStart } from "../../features/schedule/dates";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { Sheet } from "./Sheet";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** A sitter's day as an owner picks dates (FB-33): room for these pets, no room, or not open. */
export type DayMark = "open" | "full" | "closed";

const MARK_LABEL: Record<DayMark, string> = { open: "open", full: "full", closed: "not open" };

type Props = {
  visible: boolean;
  title: string;
  /** The day shown as selected; the month opens on it. */
  value: string;
  /** Earlier days are disabled. */
  minDay: string;
  onPick: (day: string) => void;
  onClose: () => void;
  /** The sitter's days, when known: a dot under each day and a legend. Any day can still be picked. */
  marks?: Map<string, DayMark>;
  testID?: string;
};

/** A month grid in a sheet: tap a day to pick it. The − / + buttons stay for one-day nudges. */
export function DayPickerSheet({ visible, title, value, minDay, onPick, onClose, marks, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [month, setMonth] = useState(monthStart(value));
  useEffect(() => {
    if (visible) setMonth(monthStart(value));
  }, [visible, value]);

  const canGoPrev = monthStart(minDay) < month;

  return (
    <Sheet visible={visible} title={title} onClose={onClose} testID={testID}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          disabled={!canGoPrev}
          onPress={() => setMonth(addMonths(month, -1))}
          style={[styles.nav, !canGoPrev && styles.disabled]}
          testID={testID ? `${testID}-prev` : undefined}
        >
          <Ionicons name="chevron-back" size={theme.icon.sm} color={theme.color.primary} />
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
          <Ionicons name="chevron-forward" size={theme.icon.sm} color={theme.color.primary} />
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      {monthGrid(month).map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={styles.cell} />;
            const disabled = day < minDay;
            const selected = day === value;
            const mark = disabled ? undefined : marks?.get(day);
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={mark ? `${day}, ${MARK_LABEL[mark]}` : day}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => {
                  onPick(day);
                  onClose();
                }}
                style={[styles.cell, styles.day, selected && styles.selected, disabled && styles.disabled]}
                testID={testID ? `${testID}-${day}` : undefined}
              >
                <Text style={[styles.dayText, selected && styles.selectedText]}>{dayOfMonth(day)}</Text>
                {mark ? (
                  <View
                    style={[styles.dot, styles[mark], selected && styles.dotOnSelected]}
                    testID={testID ? `${testID}-${day}-${mark}` : undefined}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
      {marks ? (
        <View style={styles.legend} testID={testID ? `${testID}-legend` : undefined}>
          {(["open", "full", "closed"] as DayMark[]).map((m) => (
            <View key={m} style={styles.legendItem}>
              <View style={[styles.dot, styles[m]]} />
              <Text style={styles.legendText}>{m === "open" ? "Room for your pets" : m === "full" ? "Full" : "Not open"}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
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
    month: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    week: { flexDirection: "row" },
    weekday: { flex: 1, textAlign: "center", fontSize: theme.fontSize.small, color: theme.color.textMuted, paddingVertical: 4 },
    cell: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" },
    day: { borderRadius: theme.radius.md },
    dayText: { fontSize: theme.fontSize.body, color: theme.color.text },
    selected: { backgroundColor: theme.color.primary },
    selectedText: { color: theme.color.primaryText, fontWeight: "700" },
    disabled: { opacity: 0.3 },
    dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
    open: { backgroundColor: theme.color.success },
    full: { backgroundColor: theme.color.warning },
    closed: { borderWidth: 1, borderColor: theme.color.textMuted },
    dotOnSelected: { borderWidth: 1, borderColor: theme.color.primaryText },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md, paddingTop: theme.spacing.sm },
    legendItem: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
    legendText: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
