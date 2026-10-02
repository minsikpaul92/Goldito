import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { CheckRow } from "./ui/CheckRow";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Sheet } from "./ui/Sheet";
import { Stepper } from "./ui/Stepper";
import { TextButton } from "./ui/TextButton";
import { daySpan, formatDayRange, formatTime, shiftTime, timeToMinutes } from "../features/schedule/dates";
import {
  CareSlot,
  DaySlot,
  OverlappingBooking,
  SLOTS,
  SitterDefaults,
  slotKey,
} from "../features/schedule/scheduleApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const TIME_STEP = 30;
const MIN_PETS = 1;
const MAX_PETS = 10;

type SlotDraft = { checked: boolean; startsAt: string; endsAt: string };

export type ScheduleDraft = {
  mode: "open" | "block";
  slots: Record<CareSlot, SlotDraft>;
  maxPets: number;
};

/** Start from what the first selected day already has, else the sitter's default hours. */
export function initialDraft(from: string, slots: Map<string, DaySlot>, defaults: SitterDefaults): ScheduleDraft {
  const current = SLOTS.map(({ slot }) => slots.get(slotKey(from, slot)));
  const anyOpen = current.some((s) => s?.state === "open" || s?.state === "full");
  const draft: ScheduleDraft = {
    mode: "open",
    maxPets: current.find((s) => s?.capacity != null)?.capacity ?? defaults.maxPets,
    slots: {} as Record<CareSlot, SlotDraft>,
  };
  SLOTS.forEach(({ slot }, i) => {
    const s = current[i];
    const isOpen = s?.state === "open" || s?.state === "full";
    draft.slots[slot] = {
      checked: anyOpen ? isOpen : true,
      startsAt: (isOpen && s?.startsAt) || defaults.hours[slot][0],
      endsAt: (isOpen && s?.endsAt) || defaults.hours[slot][1],
    };
  });
  return draft;
}

/** Problem with the draft as a sentence, or null when it can be saved. */
export function draftProblem(draft: ScheduleDraft): string | null {
  const chosen = SLOTS.filter(({ slot }) => draft.slots[slot].checked);
  if (chosen.length === 0) return draft.mode === "open" ? "Pick at least one slot to open." : "Pick at least one slot to block.";
  if (draft.mode === "block") return null;
  for (const { slot, label } of chosen) {
    const { startsAt, endsAt } = draft.slots[slot];
    if (startsAt === endsAt) return `${label} needs different start and end times.`;
    // Overnight may end the next morning; the others end the same day.
    if (slot !== "overnight" && timeToMinutes(endsAt) <= timeToMinutes(startsAt)) {
      return `${label} must end after it starts.`;
    }
  }
  return null;
}

type Props = {
  visible: boolean;
  from: string;
  to: string;
  initial: ScheduleDraft;
  saving: boolean;
  error: string | null;
  /** Confirmed bookings in the way (capacity guard) — offered for cancelling. */
  conflicts: OverlappingBooking[] | null;
  cancellingId: string | null;
  onCancelBooking: (bookingId: string) => void;
  onSave: (draft: ScheduleDraft) => void;
  onClose: () => void;
};

/**
 * Open (per slot: hours + spots) or Block the selected days. Remount with a `key` per
 * selection so the draft starts fresh (phase-03b 3B.1).
 */
export function ScheduleSheet({
  visible,
  from,
  to,
  initial,
  saving,
  error,
  conflicts,
  cancellingId,
  onCancelBooking,
  onSave,
  onClose,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState<ScheduleDraft>(initial);
  const problem = draftProblem(draft);
  const days = daySpan(from, to);

  const setSlot = (slot: CareSlot, change: Partial<SlotDraft>) =>
    setDraft((d) => ({ ...d, slots: { ...d.slots, [slot]: { ...d.slots[slot], ...change } } }));

  return (
    <Sheet
      visible={visible}
      title={days > 1 ? `${formatDayRange(from, to)} · ${days} days` : formatDayRange(from, to)}
      onClose={onClose}
      testID="schedule-sheet"
      footer={
        <Button
          label={saving ? "Saving…" : "Save"}
          onPress={() => onSave(draft)}
          disabled={saving || !!problem || (!!conflicts && conflicts.length > 0)}
          testID="schedule-save"
        />
      }
    >
      <SegmentedControl
        options={[
          { value: "open", label: "Open" },
          { value: "block", label: "Block" },
        ]}
        value={draft.mode}
        onChange={(mode) => setDraft((d) => ({ ...d, mode }))}
        testID="schedule-mode"
      />

      {draft.mode === "open" ? (
        <>
          {SLOTS.map(({ slot, label }) => {
            const s = draft.slots[slot];
            return (
              <View key={slot} style={styles.slot}>
                <CheckRow
                  label={label}
                  hint={s.checked ? `${formatTime(s.startsAt)} – ${formatTime(s.endsAt)}` : "Closed"}
                  checked={s.checked}
                  onChange={(checked) => setSlot(slot, { checked })}
                  testID={`schedule-${slot}`}
                />
                {s.checked ? (
                  <View style={styles.times}>
                    <View style={styles.time}>
                      <Text style={styles.caption}>From</Text>
                      <Stepper
                        label={`${label} start`}
                        value={formatTime(s.startsAt)}
                        onDecrease={() => setSlot(slot, { startsAt: shiftTime(s.startsAt, -TIME_STEP) })}
                        onIncrease={() => setSlot(slot, { startsAt: shiftTime(s.startsAt, TIME_STEP) })}
                        testID={`schedule-${slot}-start`}
                      />
                    </View>
                    <View style={styles.time}>
                      <Text style={styles.caption}>{slot === "overnight" ? "To (next day)" : "To"}</Text>
                      <Stepper
                        label={`${label} end`}
                        value={formatTime(s.endsAt)}
                        onDecrease={() => setSlot(slot, { endsAt: shiftTime(s.endsAt, -TIME_STEP) })}
                        onIncrease={() => setSlot(slot, { endsAt: shiftTime(s.endsAt, TIME_STEP) })}
                        testID={`schedule-${slot}-end`}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
          <View style={styles.pets}>
            <Text style={styles.label}>Pets at a time</Text>
            <Stepper
              label="Pets at a time"
              actions={["fewer", "more"]}
              value={String(draft.maxPets)}
              onDecrease={() => setDraft((d) => ({ ...d, maxPets: Math.max(MIN_PETS, d.maxPets - 1) }))}
              onIncrease={() => setDraft((d) => ({ ...d, maxPets: Math.min(MAX_PETS, d.maxPets + 1) }))}
              canDecrease={draft.maxPets > MIN_PETS}
              canIncrease={draft.maxPets < MAX_PETS}
              testID="schedule-pets"
            />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.hint}>Owners can't book blocked slots. Bookings you already accepted stay.</Text>
          {SLOTS.map(({ slot, label }) => (
            <CheckRow
              key={slot}
              label={label}
              checked={draft.slots[slot].checked}
              onChange={(checked) => setSlot(slot, { checked })}
              testID={`schedule-${slot}`}
            />
          ))}
        </>
      )}

      {conflicts && conflicts.length > 0 ? (
        <View style={styles.conflicts} testID="schedule-conflicts">
          {conflicts.length === 1 ? (
            <Text style={styles.conflictText}>
              {`This overlaps ${conflicts[0].ownerName}'s booking (${formatDayRange(conflicts[0].startDate, conflicts[0].endDate)}). Cancel that booking?`}
            </Text>
          ) : (
            <Text style={styles.conflictText}>
              {`This overlaps ${conflicts.length} bookings. Cancel them to save this change.`}
            </Text>
          )}
          {conflicts.map((b) => (
            <View key={b.id} style={styles.conflictRow}>
              <Text style={styles.label}>{`${b.ownerName} · ${formatDayRange(b.startDate, b.endDate)}`}</Text>
              <TextButton
                label={cancellingId === b.id ? "Cancelling…" : "Cancel booking"}
                danger
                disabled={!!cancellingId}
                onPress={() => onCancelBooking(b.id)}
                testID={`cancel-booking-${b.id}`}
              />
            </View>
          ))}
          <Text style={styles.hint}>The owner gets a notice and can find a new sitter.</Text>
        </View>
      ) : null}

      {problem ? (
        <Text style={styles.problem} testID="schedule-problem">
          {problem}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.problem} testID="schedule-error">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    slot: {
      gap: theme.spacing.xs,
      paddingBottom: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    times: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
      paddingLeft: theme.spacing.lg,
    },
    time: {
      gap: theme.spacing.xs,
    },
    caption: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    pets: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    label: {
      flex: 1,
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    conflicts: {
      gap: theme.spacing.xs,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.warning,
    },
    conflictText: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.warning,
    },
    conflictRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    problem: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
  });
