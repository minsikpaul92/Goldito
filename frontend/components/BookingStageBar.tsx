import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";

import { Viewer } from "./BookingCard";
import { useLiveTrips } from "../features/transit/useLiveTrips";
import { BookingStage, BookingSummary } from "../lib/bookings";
import type { Trip } from "../types/db";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Icon } from "./ui/Icon";
import { useReduceMotion } from "./ui/useReduceMotion";

/** "Meet" is the one word for the Meet & Greet step everywhere (Mook Oct 27); How it works and Terms explain it once. */
const FIRST_TIME = ["Request", "Meet", "Confirm", "Pay", "Care"];
const REPEAT = ["Request", "Confirm", "Pay", "Care"];

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

/**
 * The small word under a step (#237): Scheduled once the Meet & Greet time or the drop-off is set, Trip while the
 * drop-off trip is on the way (a Meet & Greet has no trip), Skipped for a Meet & Greet both agreed to skip.
 */
export function stepNotes(b: BookingSummary, firstTime: boolean, trips: Trip[] | null | undefined): Record<number, string> {
  const notes: Record<number, string> = {};
  const care = firstTime ? 4 : 3;
  if (firstTime && b.meetGreetStatus === "skipped") notes[1] = "Skipped";
  else if (firstTime && b.stage === "meet_greet" && b.meetGreetStatus === "agreed") notes[1] = "Scheduled";
  if (b.stage === "paid" && b.dropOff) {
    notes[care] = trips?.some((t) => t.handoff_kind === "drop_off" && (t.status === "en_route" || t.status === "arrived")) ? "Trip" : "Scheduled";
  }
  return notes;
}

const DASH = 5;
const GAP = 4;
const DASHES = Array.from({ length: 24 }, (_, i) => i);

/**
 * A dashed link between two steps (Mook Oct 27). Still dashes = a step passed over (Skipped); dashes that flow toward
 * the step = the step under way (M1). Reduce motion keeps them still.
 */
function Dashes({ color, thickness, moving }: { color: string; thickness: number; moving: boolean }) {
  const reduce = useReduceMotion();
  const shift = useRef(new Animated.Value(0)).current;
  const run = moving && !reduce;
  useEffect(() => {
    if (!run) {
      shift.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(shift, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== "web", isInteraction: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [run, shift]);
  const translateX = shift.interpolate({ inputRange: [0, 1], outputRange: [-(DASH + GAP) * 2, 0] });
  return (
    <View style={{ flex: 1, height: thickness, overflow: "hidden" }} testID={moving ? "stage-dashes-moving" : "stage-dashes"}>
      <Animated.View style={{ flexDirection: "row", gap: GAP, transform: [{ translateX }] }}>
        {DASHES.map((i) => (
          <View key={i} style={{ width: DASH, height: thickness, borderRadius: thickness / 2, backgroundColor: color }} />
        ))}
      </Animated.View>
    </View>
  );
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
export function BookingStageBar({
  booking,
  viewer,
  chat,
  trips,
}: {
  booking: BookingSummary | null;
  viewer: Viewer;
  chat?: boolean;
  /** The booking's trips when the screen already has them; otherwise the bar watches them while a drop-off is ahead. */
  trips?: Trip[] | null;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const own = useLiveTrips(booking?.id, trips === undefined && !!booking && booking.stage === "paid");
  const firstTime = chat || !booking || booking.meetGreetStatus !== "not_needed";
  const steps = firstTime ? FIRST_TIME : REPEAT;
  const current = booking ? currentStep(booking.stage, firstTime) : 0;
  if (current === null) return null;
  const caption = booking ? stageCaption(booking, viewer) : null;
  const notes = booking ? stepNotes(booking, firstTime, trips === undefined ? own.trips : trips) : {};
  const note = (i: number) =>
    notes[i] ? (
      <Text style={[styles.note, notes[i] === "Skipped" && styles.notePill]} numberOfLines={1} testID={`stage-note-${i}`}>
        {notes[i]}
      </Text>
    ) : null;
  // A skipped Meet is passed over: a dashed circle with », dashed links on both sides (Mook Oct 27).
  const skipped = (i: number) => i < current && notes[i] === "Skipped";
  const mark = (i: number, done: boolean) => (done ? "✓" : i + 1);
  /** The link into step `i`: moving dashes into the step under way, still dashes around a skipped step. */
  const link = (i: number, done: boolean, now: boolean, base: object, thickness: number) => {
    if (now) return <View style={[base, styles.linkBare]}><Dashes color={theme.color.primary} thickness={thickness} moving /></View>;
    if (skipped(i) || skipped(i - 1)) return <View style={[base, styles.linkBare]}><Dashes color={theme.color.gold} thickness={thickness} moving={false} /></View>;
    return <View style={[base, done && styles.linkDone]} />;
  };
  const dotFor = (i: number, done: boolean, now: boolean, mini: boolean) =>
    skipped(i) ? (
      <View style={[mini ? styles.miniDot : styles.dot, styles.dotSkipped]} testID={`stage-skipped-${i}`}>
        <Icon name="skipped" size={mini ? 13 : 16} color={theme.color.textMuted} strokeWidth={2.25} />
      </View>
    ) : (
      <View style={[mini ? styles.miniDot : styles.dot, done && styles.dotDone, now && styles.dotNow]}>
        <Text style={[mini ? styles.miniText : styles.dotText, done && styles.dotTextDone, now && styles.dotTextNow]}>{mark(i, done)}</Text>
      </View>
    );

  if (chat) {
    return (
      <View style={styles.wrap} testID="stage-bar" accessibilityLabel={`Step ${Math.min(current + 1, steps.length)} of ${steps.length}`}>
        <View style={styles.row}>
          {steps.map((label, i) => {
            const done = i < current;
            const now = i === current;
            return (
              <View key={label} style={[styles.miniStep, { zIndex: steps.length - i }]}>
                {i > 0 ? link(i, done, now, styles.miniLink, 2) : null}
                {dotFor(i, done, now, true)}
                <Text style={[styles.miniLabel, now && styles.dotLabelNow]} numberOfLines={1} accessibilityLabel={label} testID={`stage-step-${i}`}>
                  {label}
                </Text>
                {note(i)}
              </View>
            );
          })}
        </View>
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
                {i > 0 ? link(i, done, now, styles.link, 3) : null}
                {dotFor(i, done, now, false)}
                <Text style={[styles.dotLabel, now && styles.dotLabelNow]} numberOfLines={1} accessibilityLabel={label} testID={`stage-step-${i}`}>
                  {label}
                </Text>
                {note(i)}
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
            {skipped(i) ? (
              <View style={[styles.bar, styles.linkBare]} testID={`stage-skipped-${i}`}>
                <Dashes color={theme.color.textMuted} thickness={6} moving={false} />
              </View>
            ) : i === current ? (
              <View style={[styles.bar, styles.barNow]}>
                <Dashes color={theme.color.primary} thickness={4} moving />
              </View>
            ) : (
              <View style={[styles.bar, i < current && styles.barDone]} />
            )}
            <Text style={[styles.label, i === current && styles.labelNow]} numberOfLines={1} accessibilityLabel={label} testID={`stage-step-${i}`}>
              {label}
            </Text>
            {note(i)}
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
    barNow: { backgroundColor: theme.color.accent, borderWidth: 1, borderColor: theme.color.primary, justifyContent: "center", overflow: "hidden" },
    label: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    labelNow: { color: theme.color.primary, fontWeight: theme.fontWeight.bold },
    caption: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    note: { fontSize: 10, color: theme.color.primary, fontWeight: theme.fontWeight.semibold },
    notePill: { color: theme.color.textMuted, backgroundColor: theme.color.track, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, overflow: "hidden" },
    // Numbered dots (skins with color blocks).
    dotStep: { flex: 1, alignItems: "center", gap: 5, paddingTop: 6 },
    link: { position: "absolute", top: 20.5, left: "-50%", right: "50%", height: 3, borderRadius: 2, backgroundColor: theme.color.track },
    linkDone: { backgroundColor: theme.color.gold },
    linkBare: { backgroundColor: "transparent", flexDirection: "row", alignItems: "center", justifyContent: "center" },
    dotSkipped: { backgroundColor: theme.color.surface, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.color.textMuted },
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
