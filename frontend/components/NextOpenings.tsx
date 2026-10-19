import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { dayTitle, isOpen } from "./SlotRows";
import { addDays } from "../features/schedule/dates";
import { DaySlot, SLOTS, slotKey } from "../features/schedule/scheduleApi";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** The soonest days from `from` with at least one open slot, and which slots are open. */
export function nextOpenings(slots: Map<string, DaySlot>, from: string, days: number, max: number) {
  const out: { day: string; open: string[] }[] = [];
  for (let i = 0; i < days && out.length < max; i++) {
    const day = addDays(from, i);
    const open = SLOTS.filter(({ slot }) => isOpen(slots.get(slotKey(day, slot)))).map(({ label }) => label);
    if (open.length > 0) out.push({ day, open });
  }
  return out;
}

type Props = {
  openings: { day: string; open: string[] }[];
  onOpenDay: (day: string) => void;
};

/** #120 (B): plain rows for the next free days. The whole row opens that day's page. */
export function NextOpenings({ openings, onOpenDay }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.list}>
      {openings.map(({ day, open }) => {
        const slotsText = open.length === SLOTS.length ? "All day" : open.join(", ");
        return (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={`${dayTitle(day)}, ${slotsText} open`}
            onPress={() => onOpenDay(day)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            testID={`sitter-opening-${day}`}
          >
            <View style={styles.text}>
              <Text style={styles.day}>{dayTitle(day)}</Text>
              <Text style={styles.slots}>{slotsText}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.color.textMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { gap: theme.spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      minHeight: 64,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.ui.radius.card,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    pressed: { opacity: theme.motion.pressOpacity },
    text: { flex: 1, minWidth: 0, gap: 2 },
    day: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    slots: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
