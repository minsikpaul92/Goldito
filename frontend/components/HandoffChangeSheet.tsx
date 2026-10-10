import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Viewer, placeLabel } from "./BookingCard";
import { Button } from "./ui/Button";
import { CheckRow } from "./ui/CheckRow";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Sheet } from "./ui/Sheet";
import { Stepper } from "./ui/Stepper";
import { TextField } from "./ui/TextField";
import { addDays, formatDay, formatTime, isoToZoned, shiftTime, zonedToIso } from "../features/schedule/dates";
import { BookingSummary, HandoffKind, LocationType } from "../lib/bookings";
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

type Draft = { kind: HandoffKind; day: string; time: string; locationType: LocationType; note: string };

function draftFor(b: BookingSummary, kind: HandoffKind): Draft {
  const h = b.pending[kind] ?? (kind === "drop_off" ? b.dropOff : b.pickUp);
  const when = h ? isoToZoned(h.at) : { day: "", time: "09:00" };
  return { kind, ...when, locationType: h?.locationType ?? "sitter_home", note: h?.note ?? "" };
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
  onSubmit: (change: HandoffChange) => void;
  onClose: () => void;
};

/**
 * New time (± 1 day / ± 15 min) — and after confirm, place — for one handoff
 * (phase-03b 3B.4–3B.5). Remount with a `key` for a fresh draft.
 */
export function HandoffChangeSheet({
  visible,
  booking,
  viewer,
  initialKind,
  allowPlace,
  title,
  submitLabel,
  onSubmit,
  onClose,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState<Draft>(() => draftFor(booking, initialKind));
  const set = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));

  // House sitting happens at the owner's home — only the time can move (009c).
  const placeEditable = allowPlace && booking.serviceType !== "house_sitting";
  const at = draft.day ? zonedToIso(draft.day, draft.time) : null;
  const problem = !at
    ? "Pick a day."
    : Date.parse(at) <= Date.now()
      ? "Pick a time in the future."
      : placeEditable && draft.locationType === "other" && !draft.note.trim()
        ? "Tell them where to meet."
        : null;

  const submit = () => {
    if (!at || problem) return;
    onSubmit({
      kind: draft.kind,
      at,
      place: placeEditable ? { locationType: draft.locationType, note: draft.note.trim() || null } : undefined,
    });
  };

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      testID="change-sheet"
      footer={<Button label={submitLabel} onPress={submit} disabled={!!problem} testID="change-send" />}
    >
      <SegmentedControl
        options={[
          { value: "drop_off", label: "Drop-off" },
          { value: "pick_up", label: "Pick-up" },
        ]}
        value={draft.kind}
        onChange={(kind) => setDraft(draftFor(booking, kind))}
        testID="change-kind"
      />
      <View style={styles.row}>
        <Stepper
          label="Day"
          value={draft.day ? formatDay(draft.day) : "—"}
          onDecrease={() => set({ day: addDays(draft.day, -1) })}
          onIncrease={() => set({ day: addDays(draft.day, 1) })}
          testID="change-day"
        />
        <Stepper
          label="Time"
          value={formatTime(draft.time)}
          onDecrease={() => set({ time: shiftTime(draft.time, -TIME_STEP) })}
          onIncrease={() => set({ time: shiftTime(draft.time, TIME_STEP) })}
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
          {allowPlace ? "House sitting — handoffs stay at the owner's home." : "The place stays the same."}
        </Text>
      )}
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
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
