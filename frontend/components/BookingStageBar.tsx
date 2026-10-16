import { StyleSheet, Text, View } from "react-native";

import { Viewer } from "./BookingCard";
import { BookingStage, BookingSummary } from "../lib/bookings";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const FIRST_TIME = ["Request", "Meet & Greet", "Confirm", "Pay", "Stay"];
const REPEAT = ["Request", "Confirm", "Pay", "Stay"];

/** Which step is current (D60); `steps.length` = everything done. Ended bookings have no bar. */
function currentStep(stage: BookingStage, firstTime: boolean): number | null {
  const at: Partial<Record<BookingStage, number>> = firstTime
    ? { requested: 0, meet_greet: 1, confirm: 2, awaiting_payment: 3, paid: 4, in_care: 4, completed: 5 }
    : { requested: 0, awaiting_payment: 2, paid: 3, in_care: 3, completed: 4 };
  return at[stage] ?? null;
}

function dayCount(from: string, now: number): number {
  return Math.max(1, Math.floor((now - Date.parse(from)) / 86_400_000) + 1);
}

/** The line under the bar: whose turn it is, and "Day N" while the Meet & Greet is being arranged. */
export function stageCaption(b: BookingSummary, viewer: Viewer, now: number = Date.now()): string | null {
  if (b.stage === "declined" || b.stage === "cancelled" || b.stage === "completed") return null;
  const other = viewer === "owner" ? b.sitterName : b.ownerName;
  const turn =
    b.nextActor === viewer || b.nextActor === "both"
      ? "Your turn"
      : b.nextActor === "none"
        ? null
        : `Waiting for ${other}`;
  const wait = b.stage === "meet_greet" && b.sitterInterestAt ? `Day ${dayCount(b.sitterInterestAt, now)}` : null;
  return [wait, turn].filter(Boolean).join(" · ") || null;
}

/** Progress through the booking steps, from the stage the database computes (D60). */
export function BookingStageBar({ booking, viewer }: { booking: BookingSummary; viewer: Viewer }) {
  const styles = useThemedStyles(makeStyles);
  const firstTime = booking.meetGreetStatus !== "not_needed";
  const steps = firstTime ? FIRST_TIME : REPEAT;
  const current = currentStep(booking.stage, firstTime);
  if (current === null) return null;
  const caption = stageCaption(booking, viewer);

  return (
    <View style={styles.wrap} testID="stage-bar" accessibilityLabel={`Step ${Math.min(current + 1, steps.length)} of ${steps.length}`}>
      <View style={styles.row}>
        {steps.map((label, i) => (
          <View key={label} style={styles.step}>
            <View style={[styles.bar, i < current && styles.barDone, i === current && styles.barNow]} />
            <Text style={[styles.label, i === current && styles.labelNow]} numberOfLines={1} testID={`stage-step-${i}`}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      {caption ? (
        <Text style={styles.caption} testID="stage-caption">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.spacing.xs },
    row: { flexDirection: "row", gap: theme.spacing.xs },
    step: { flex: 1, gap: 4 },
    bar: { height: 6, borderRadius: 3, backgroundColor: theme.color.border },
    barDone: { backgroundColor: theme.color.primary },
    barNow: { backgroundColor: theme.color.accent, borderWidth: 1, borderColor: theme.color.primary },
    label: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    labelNow: { color: theme.color.primary, fontWeight: theme.fontWeight.bold },
    caption: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
