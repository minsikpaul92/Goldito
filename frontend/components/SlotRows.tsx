import { StyleSheet, Text, View } from "react-native";

import { Tag } from "./ui/Tag";
import { DaySlot, SLOTS, slotKey } from "../features/schedule/scheduleApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fri, Oct 16" */
export function dayTitle(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** "8 AM", "8:30 AM": no ":00" (#120). */
export function shortHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** Open for an owner: has a spot left. Blocked and never opened read the same (never who booked). */
export function isOpen(s: DaySlot | undefined): boolean {
  return s?.state === "open" && s.remaining > 0;
}

function tagFor(s: DaySlot | undefined): { label: string; open: boolean } {
  if (isOpen(s)) return { label: s!.remaining === 1 ? "1 spot left" : `${s!.remaining} spots left`, open: true };
  if (s?.state === "full" || (s?.state === "open" && s.remaining === 0)) return { label: "Full", open: false };
  return { label: "Not available", open: false };
}

/** One day's three slots as rows: name, hours, a tag in words (#120 CAL-3). Information only. */
export function SlotRows({ day, slots }: { day: string; slots: Map<string, DaySlot> }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.list} testID="sitter-day">
      {SLOTS.map(({ slot, label }) => {
        const s = slots.get(slotKey(day, slot));
        const tag = tagFor(s);
        const hours = s?.startsAt && s.endsAt ? `${shortHour(s.startsAt)} to ${shortHour(s.endsAt)}` : null;
        return (
          <View
            key={slot}
            style={styles.row}
            accessible
            accessibilityLabel={[label, hours, tag.label].filter(Boolean).join(", ")}
            testID={`sitter-day-${slot}`}
          >
            <View style={styles.text}>
              <Text style={[styles.name, !tag.open && styles.muted]}>{label}</Text>
              {hours ? <Text style={styles.hours}>{hours}</Text> : null}
            </View>
            <Tag label={tag.label} tone={tag.open ? "success" : "neutral"} style={styles.tag} />
          </View>
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
    text: { flex: 1, minWidth: 0, gap: 2 },
    name: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    muted: { color: theme.color.textMuted },
    hours: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    tag: { alignSelf: "center" },
  });
