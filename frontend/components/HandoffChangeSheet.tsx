import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Viewer, placeLabel } from "./BookingCard";
import { Button } from "./ui/Button";
import { CheckRow } from "./ui/CheckRow";
import { DayPickerSheet } from "./ui/DayPickerSheet";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Sheet } from "./ui/Sheet";
import { Stepper } from "./ui/Stepper";
import { TextField } from "./ui/TextField";
import { TimePickerSheet } from "./ui/TimePickerSheet";
import { addDays, appToday, formatDay, formatTime, isoToZoned, shiftTime, zonedToIso } from "../features/schedule/dates";
import { BookingSummary, HandoffKind, LocationType } from "../lib/bookings";
import { earliestTime } from "../lib/trip";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const TIME_STEP = 15;
const PLACES: LocationType[] = ["sitter_home", "owner_home", "other"];

export type HandoffChange = {
  kind: HandoffKind;
  at: string;
  /** Only when the place may change (after confirm); a time-only offer keeps the place. */
  place?: { locationType: LocationType; note: string | null };
};

type Draft = { day: string; time: string; locationType: LocationType; note: string };

const KINDS: HandoffKind[] = ["drop_off", "pick_up"];
const KIND_LABEL: Record<HandoffKind, string> = { drop_off: "Drop-off", pick_up: "Pick-up" };

function draftFor(b: BookingSummary, kind: HandoffKind): Draft {
  const h = b.pending[kind] ?? (kind === "drop_off" ? b.dropOff : b.pickUp);
  const when = h ? isoToZoned(h.at) : { day: "", time: "09:00" };
  return { ...when, locationType: h?.locationType ?? "sitter_home", note: h?.note ?? "" };
}

type Props = {
  visible: boolean;
  booking: BookingSummary;
  viewer: Viewer;
  initialKind: HandoffKind;
  /** Change the place too (Change time or place after confirm). */
  allowPlace: boolean;
  title: string;
  submitLabel: string;
  /** Propose one handoff — throws an Error whose message is ready to show in the sheet. */
  onSend: (change: HandoffChange) => Promise<void>;
  /** Both handoffs changed: send them as one suggestion (014r). Without it they go one after the other through onSend. */
  onSendPair?: (drop: HandoffChange, pick: HandoffChange) => Promise<void>;
  /** After any change went through (the screen reloads behind the sheet). */
  onChanged: () => void;
  /** After every change went through (the screen closes the sheet and says so). */
  onDone: () => void;
  /** Close / backdrop: nothing is saved or sent. */
  onClose: () => void;
};

/**
 * New time (± 1 day / ± 15 min) — and after confirm, place — for the drop-off and the pick-up (phase-03b
 * 3B.4–3B.5). Both drafts live in the sheet, so flipping between them keeps each; **Send** proposes whatever
 * differs from what the booking says now (FB-5). A handoff that already happened can't be picked (FB-6).
 * Remount with a `key` for fresh drafts.
 */
export function HandoffChangeSheet({
  visible,
  booking,
  viewer,
  initialKind,
  allowPlace,
  title,
  submitLabel,
  onSend,
  onSendPair,
  onChanged,
  onDone,
  onClose,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const done: Record<HandoffKind, boolean> = {
    drop_off: !!booking.dropOff?.completedAt,
    pick_up: !!booking.pickUp?.completedAt,
  };
  const [start] = useState<Record<HandoffKind, Draft>>(() => ({
    drop_off: draftFor(booking, "drop_off"),
    pick_up: draftFor(booking, "pick_up"),
  }));
  const [drafts, setDrafts] = useState(start);
  const [kind, setKind] = useState<HandoffKind>(!done[initialKind] ? initialKind : initialKind === "drop_off" ? "pick_up" : "drop_off");
  const [sent, setSent] = useState<HandoffKind[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<"day" | "time" | null>(null);
  const draft = drafts[kind];
  const set = (change: Partial<Draft>) => {
    setError(null);
    setDrafts((d) => ({ ...d, [kind]: { ...d[kind], ...change } }));
  };

  // House sitting happens at the owner's home — only the time can move (009c).
  const placeEditable = allowPlace && booking.serviceType !== "house_sitting";
  const atOf = (k: HandoffKind) => (drafts[k].day ? zonedToIso(drafts[k].day, drafts[k].time) : null);
  const changed = (k: HandoffKind) =>
    !done[k] &&
    !sent.includes(k) &&
    (drafts[k].day !== start[k].day ||
      drafts[k].time !== start[k].time ||
      (placeEditable &&
        (drafts[k].locationType !== start[k].locationType || drafts[k].note.trim() !== start[k].note.trim())));

  /** What is wrong with one handoff's draft (null = fine). Only handoffs being changed are checked. */
  const problemOf = (k: HandoffKind): string | null => {
    if (!changed(k)) return null;
    const at = atOf(k);
    if (!at) return "Pick a day.";
    if (Date.parse(at) <= Date.now()) return "Pick a time in the future.";
    if (placeEditable && drafts[k].locationType === "other" && !drafts[k].note.trim()) return "Tell them where to meet.";
    return null;
  };
  const dropAt = atOf("drop_off");
  const pickAt = atOf("pick_up");
  const windowProblem =
    (changed("drop_off") || changed("pick_up")) && dropAt && pickAt && Date.parse(pickAt) <= Date.parse(dropAt)
      ? "Pick-up has to be after drop-off."
      : null;
  const problems: Record<HandoffKind, string | null> = {
    drop_off: problemOf("drop_off"),
    pick_up: problemOf("pick_up") ?? windowProblem,
  };
  const pending = KINDS.filter(changed);
  const shownProblem = problems[kind] ?? KINDS.map((k) => problems[k]).find(Boolean) ?? null;

  const submit = async () => {
    if (busy || pending.length === 0 || shownProblem) return;
    const change = (k: HandoffKind): HandoffChange => ({
      kind: k,
      at: atOf(k)!,
      place: placeEditable ? { locationType: drafts[k].locationType, note: drafts[k].note.trim() || null } : undefined,
    });
    if (onSendPair && pending.length === 2) {
      setBusy(true);
      setError(null);
      try {
        await onSendPair(change("drop_off"), change("pick_up"));
      } catch (err) {
        setError((err as Error).message);
        setBusy(false);
        return;
      }
      setSent([...KINDS]);
      onChanged();
      setBusy(false);
      onDone();
      return;
    }
    // The server checks each new time against the other handoff's current one, so go in the order that stays valid:
    // a drop-off that moves past the old pick-up needs the pick-up moved first.
    const oldPick = booking.pending.pick_up?.at ?? booking.pickUp?.at;
    const dropFirst = !(pending.includes("drop_off") && dropAt && oldPick && Date.parse(dropAt) >= Date.parse(oldPick));
    const order = dropFirst ? pending : [...pending].reverse();
    setBusy(true);
    setError(null);
    for (const k of order) {
      try {
        await onSend({
          kind: k,
          at: atOf(k)!,
          place: placeEditable ? { locationType: drafts[k].locationType, note: drafts[k].note.trim() || null } : undefined,
        });
      } catch (err) {
        const went = order.slice(0, order.indexOf(k));
        setError(
          went.length > 0
            ? `${KIND_LABEL[went[0]]} was sent. ${KIND_LABEL[k]} didn't go through: ${(err as Error).message}`
            : (err as Error).message,
        );
        setBusy(false);
        return;
      }
      setSent((list) => [...list, k]);
      onChanged();
    }
    setBusy(false);
    onDone();
  };

  return (
    <Sheet
      dirty={(Object.keys(drafts) as HandoffKind[]).some((k) => drafts[k].note !== start[k].note)}
      discardTitle="Discard your note?"
      visible={visible}
      title={title}
      onClose={onClose}
      testID="change-sheet"
      footer={
        <Button
          label={submitLabel}
          onPress={() => void submit()}
          disabled={busy || pending.length === 0 || !!shownProblem}
          testID="change-send"
        />
      }
    >
      <SegmentedControl
        options={KINDS.map((k) => ({
          value: k,
          label: done[k] ? `${KIND_LABEL[k]} · done ✓` : problems[k] ? `${KIND_LABEL[k]} · check` : KIND_LABEL[k],
          disabled: done[k],
        }))}
        value={kind}
        onChange={setKind}
        testID="change-kind"
      />
      <View style={styles.row}>
        <Stepper
          style={styles.stepper}
          label="Day"
          value={draft.day ? formatDay(draft.day) : "-"}
          onDecrease={() => set({ day: addDays(draft.day, -1) })}
          onIncrease={() => set({ day: addDays(draft.day, 1) })}
          onPressValue={() => setPicker("day")}
          testID="change-day"
        />
        <Stepper
          style={styles.stepper}
          label="Time"
          value={formatTime(draft.time)}
          onDecrease={() => set({ time: shiftTime(draft.time, -TIME_STEP) })}
          onIncrease={() => set({ time: shiftTime(draft.time, TIME_STEP) })}
          onPressValue={() => setPicker("time")}
          testID="change-time"
        />
      </View>
      {placeEditable ? (
        <View accessibilityRole="radiogroup">
          {PLACES.map((type) => (
            <CheckRow
              key={type}
              radio
              label={type === "other" ? "📍 Somewhere else" : placeLabel(type, null, booking, viewer)}
              checked={draft.locationType === type}
              onChange={() => set({ locationType: type })}
              testID={`change-place-${type}`}
            />
          ))}
          {draft.locationType === "other" ? (
            <TextField
              label="Where to meet"
              value={draft.note}
              onChangeText={(note) => set({ note })}
              placeholder="e.g. Trinity Bellwoods Park, north gate"
              maxLength={120}
              testID="change-note"
            />
          ) : null}
        </View>
      ) : (
        <Text style={styles.hint}>
          {allowPlace ? "House sitting: handoffs stay at the owner's home." : "The place stays the same."}
        </Text>
      )}
      {shownProblem ? <Text style={styles.problem}>{shownProblem}</Text> : null}
      {error ? (
        <Text style={styles.problem} accessibilityRole="alert" testID="change-error">
          {error}
        </Text>
      ) : null}

      <DayPickerSheet
        visible={picker === "day"}
        title={kind === "drop_off" ? "Drop-off day" : "Pick-up day"}
        value={draft.day || appToday()}
        minDay={kind === "pick_up" && drafts.drop_off.day ? drafts.drop_off.day : appToday()}
        onPick={(day) => {
          set({ day });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        testID="change-calendar"
      />
      <TimePickerSheet
        visible={picker === "time"}
        title={kind === "drop_off" ? "Drop-off time" : "Pick-up time"}
        value={draft.time}
        minTime={draft.day ? earliestTime(draft.day) : null}
        onPick={(time) => {
          set({ time });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        testID="change-clock"
      />
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    stepper: {
      flex: 1,
      minWidth: 0,
      justifyContent: "space-between",
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    problem: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
  });
