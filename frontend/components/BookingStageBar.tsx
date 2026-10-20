import { StyleSheet, Text, View } from "react-native";

import { Viewer } from "./BookingCard";
import { BookingStage, BookingSummary } from "../lib/bookings";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const FIRST_TIME = ["Request", "Meet & Greet", "Confirm", "Pay", "Stay"];
const REPEAT = ["Request", "Confirm", "Pay", "Stay"];

/** Which step is current (D60); `steps.length` = everything done. Ended bookings have no bar. */
function currentStep(stage: BookingStage, firstTime: boolean): number | null {
  const at: Partial<Record<BookingStage, number>> = firstTime
    ? { requested: 0, meet_greet: 1, confirm: 2, awaiting_payment: 3, paid: 4, in_care: 4, completed: 5 }
    : { requested: 0, confirm: 1, awaiting_payment: 2, paid: 3, in_care: 3, completed: 4 };
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

/** Whether the bar draws anything — lets a screen skip the card around it for ended bookings. */
export function hasStageBar(booking: BookingSummary): boolean {
  return currentStep(booking.stage, booking.meetGreetStatus !== "not_needed") !== null;
}

/**
 * Progress through the booking steps, from the stage the database computes (D60).
 * `chat` is the small row of five connected circles pinned on top of the chat: it always has the five steps (a pair that
 * has met shows Meet as done) and, with no booking yet, sits on Request.
 */
export function BookingStageBar({ booking, viewer, chat }: { booking: BookingSummary | null; viewer: Viewer; chat?: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const firstTime = chat || !booking || booking.meetGreetStatus !== "not_needed";
  const steps = firstTime ? FIRST_TIME : REPEAT;
  const current = booking ? currentStep(booking.stage, firstTime) : 0;
  if (current === null) return null;
  const caption = booking ? stageCaption(booking, viewer) : null;

  if (chat) {
    return (
      <View style={styles.wrap} testID="stage-bar" accessibilityLabel={`Step ${Math.min(current + 1, steps.length)} of ${steps.length}`}>
        <View style={styles.row}>
          {steps.map((label, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <View key={label} style={[styles.miniStep, { zIndex: steps.length - i }]}>
                {i > 0 ? <View style={[styles.miniLink, (done || now) && styles.linkDone]} /> : null}
                <View style={[styles.miniDot, done && styles.dotDone, now && styles.dotNow]}>
                  <Text style={[styles.miniText, done && styles.dotTextDone, now && styles.dotTextNow]}>{done ? "✓" : i + 1}</Text>
                </View>
                <Text style={[styles.miniLabel, now && styles.dotLabelNow]} numberOfLines={1} testID={`stage-step-${i}`}>
                  {label === "Meet & Greet" ? "Meet" : label}
                </Text>
              </View>
            );
          })}
        </View>
        {caption ? (
          <Text style={styles.caption} testID="stage-caption">
            {caption}
          </Text>
        ) : null}
      </View>
    );
  }

  if (theme.ui.blocks) {
    return (
      <View style={styles.wrap} testID="stage-bar" accessibilityLabel={`Step ${Math.min(current + 1, steps.length)} of ${steps.length}`}>
        <View style={styles.row}>
          {steps.map((label, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <View key={label} style={[styles.dotStep, { zIndex: steps.length - i }]}>
                {i > 0 ? <View style={[styles.link, (done || now) && styles.linkDone]} /> : null}
                <View style={[styles.dot, done && styles.dotDone, now && styles.dotNow]}>
                  <Text style={[styles.dotText, done && styles.dotTextDone, now && styles.dotTextNow]}>{done ? "✓" : i + 1}</Text>
                </View>
                <Text style={[styles.dotLabel, now && styles.dotLabelNow]} numberOfLines={1} testID={`stage-step-${i}`}>
                  {label === "Meet & Greet" ? "Meet" : label}
                </Text>
              </View>
            );
          })}
        </View>
        {caption ? (
          <Text style={styles.caption} testID="stage-caption">
            {caption}
          </Text>
        ) : null}
      </View>
    );
  }

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
    // Numbered dots (skins with color blocks).
    dotStep: { flex: 1, alignItems: "center", gap: 5, paddingTop: 6 },
    link: { position: "absolute", top: 20.5, left: "-50%", right: "50%", height: 3, borderRadius: 2, backgroundColor: theme.color.track },
    linkDone: { backgroundColor: theme.color.gold },
    dot: { zIndex: 1, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface },
    dotDone: { backgroundColor: theme.color.gold },
    dotNow: { backgroundColor: theme.color.primary },
    dotText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.textMuted },
    dotTextDone: { color: theme.color.text },
    dotTextNow: { color: theme.color.background },
    dotLabel: {
      fontSize: 12,
      color: theme.color.textMuted,
      ...(theme.fontFamily.display ? { fontFamily: theme.fontFamily.display } : { fontWeight: theme.fontWeight.semibold }),
    },
    dotLabelNow: { color: theme.color.text },
    // The small pinned row of the chat.
    miniStep: { flex: 1, alignItems: "center", gap: 3, paddingTop: 2 },
    miniLink: { position: "absolute", top: 12, left: "-50%", right: "50%", height: 2, borderRadius: 1, backgroundColor: theme.color.track },
    miniDot: { zIndex: 1, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
    miniText: { fontSize: 11, fontWeight: theme.fontWeight.bold, color: theme.color.textMuted },
    miniLabel: { fontSize: 11, color: theme.color.textMuted, fontWeight: theme.fontWeight.semibold },
  });
