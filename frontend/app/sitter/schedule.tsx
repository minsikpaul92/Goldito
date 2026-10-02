import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ScheduleDraft, ScheduleSheet, initialDraft } from "../../components/ScheduleSheet";
import { STATE_LABEL, SlotCalendar } from "../../components/SlotCalendar";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import {
  addMonths,
  appToday,
  daySpan,
  formatDayRange,
  formatTime,
  monthEnd,
  monthStart,
} from "../../features/schedule/dates";
import {
  MonthSchedule,
  OverlapError,
  OverlappingBooking,
  SLOTS,
  SitterDefaults,
  loadMonthSchedule,
  loadOverlappingBookings,
  loadSitterDefaults,
  saveBlock,
  saveOpen,
  slotKey,
} from "../../features/schedule/scheduleApi";
import { cancelBooking } from "../../lib/bookings";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";

type Selection = { from: string; to: string; complete: boolean };

/**
 * Sitter schedule (phase-03b 3B.1): open days × slots with own hours and spots, or block
 * them. Opening never notifies owners. A block or fewer spots over a confirmed booking is
 * refused by the capacity guard → cancel those bookings here → the save runs again.
 */
export default function SitterSchedule() {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const { profile } = useSession();
  const sitterId = profile?.id;
  const today = useMemo(() => appToday(), []);

  const [month, setMonth] = useState(() => monthStart(today));
  const [schedule, setSchedule] = useState<MonthSchedule | null>(null);
  const [defaults, setDefaults] = useState<SitterDefaults | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  const [sheetKey, setSheetKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<OverlappingBooking[] | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const pendingDraft = useRef<ScheduleDraft | null>(null);

  const load = useCallback(async () => {
    if (!sitterId) return;
    setLoadError(null);
    try {
      setSchedule(await loadMonthSchedule(sitterId, monthStart(month), monthEnd(month)));
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, [sitterId, month]);

  // Default hours and spots for slots not opened yet: once per visit, not per month.
  const loadDefaults = useCallback(async () => {
    if (!sitterId) return;
    try {
      setDefaults(await loadSitterDefaults());
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, [sitterId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadDefaults();
  }, [loadDefaults]);

  const changeMonth = (n: number) => {
    setSelection(null);
    setSchedule(null);
    setMonth((m) => addMonths(m, n));
  };

  // First click picks a day; a second, later click makes it a range; the next click starts over.
  const selectDay = (day: string) =>
    setSelection((s) =>
      !s || s.complete || day < s.from ? { from: day, to: day, complete: false } : { from: s.from, to: day, complete: true },
    );

  const openSheet = () => {
    setSaveError(null);
    setConflicts(null);
    setSheetKey((k) => k + 1);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    if (saving || cancellingId) return;
    setSheetOpen(false);
    setConflicts(null);
    pendingDraft.current = null;
  };

  const save = async (draft: ScheduleDraft) => {
    if (!sitterId || !schedule || !selection) return;
    const { from, to } = selection;
    const chosen = SLOTS.filter(({ slot }) => draft.slots[slot].checked).map(({ slot }) => slot);
    setSaving(true);
    setSaveError(null);
    try {
      if (draft.mode === "open") {
        await saveOpen(
          sitterId,
          schedule.rows,
          from,
          to,
          chosen.map((slot) => ({ slot, startsAt: draft.slots[slot].startsAt, endsAt: draft.slots[slot].endsAt })),
          draft.maxPets,
        );
      } else {
        await saveBlock(sitterId, from, to, chosen);
      }
      pendingDraft.current = null;
      setConflicts(null);
      setSheetOpen(false);
      setSelection(null);
      toast.show("Schedule saved");
      await load();
    } catch (error) {
      if (error instanceof OverlapError) {
        pendingDraft.current = draft;
        try {
          setConflicts(await loadOverlappingBookings(error.bookingIds));
        } catch (loadErr) {
          setSaveError((loadErr as Error).message);
        }
      } else {
        setSaveError((error as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  // Each cancel notifies that owner (booking_cancelled); once none are left, save again.
  const cancelConflict = async (bookingId: string) => {
    setCancellingId(bookingId);
    setSaveError(null);
    try {
      await cancelBooking(bookingId, "Sitter schedule change");
      const left = (conflicts ?? []).filter((b) => b.id !== bookingId);
      setConflicts(left);
      if (left.length === 0 && pendingDraft.current) {
        setCancellingId(null);
        await save(pendingDraft.current);
        return;
      }
    } catch (error) {
      setSaveError((error as Error).message);
    }
    setCancellingId(null);
  };

  if (loadError && (!schedule || !defaults)) {
    return (
      <Screen>
        <EmptyState
          emoji="📅"
          title="Couldn't load your schedule"
          message={loadError}
          action={{
            label: "Try again",
            onPress: () => {
              void load();
              if (!defaults) void loadDefaults();
            },
          }}
        />
      </Screen>
    );
  }

  const selectedDays = selection ? daySpan(selection.from, selection.to) : 0;

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.content}>
        <SlotCalendar
          month={month}
          today={today}
          slots={schedule?.slots ?? new Map()}
          selection={selection}
          onSelectDay={selectDay}
          onPrevMonth={() => changeMonth(-1)}
          onNextMonth={() => changeMonth(1)}
          canGoPrev={month > monthStart(today)}
        />
        {!schedule ? <LoadingView /> : null}

        <Card>
          {selection ? (
            <View style={styles.summary} testID="schedule-summary">
              <Text style={styles.summaryTitle}>
                {selectedDays > 1
                  ? `${formatDayRange(selection.from, selection.to)} · ${selectedDays} days`
                  : formatDayRange(selection.from, selection.to)}
              </Text>
              {selectedDays === 1 && schedule
                ? SLOTS.map(({ slot, label }) => {
                    const s = schedule.slots.get(slotKey(selection.from, slot));
                    const state = s?.state ?? "closed";
                    const hours = s?.startsAt && s.endsAt ? ` · ${formatTime(s.startsAt)}–${formatTime(s.endsAt)}` : "";
                    const spots = (state === "open" || state === "full") && s?.capacity ? ` · ${s.booked}/${s.capacity} booked` : "";
                    return (
                      <Text key={slot} style={styles.line} testID={`summary-${slot}`}>
                        {`${label}: ${STATE_LABEL[state]}${hours}${spots}`}
                      </Text>
                    );
                  })
                : null}
              {!selection.complete ? (
                <Text style={styles.hint}>Tap a later day to pick a range.</Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.hint}>
              Tap a day to open or block it. Tap a second day to pick a range. Owners only see your open slots.
            </Text>
          )}
        </Card>
      </Screen>

      <View style={styles.footer}>
        <Button
          label="Open or block"
          onPress={openSheet}
          disabled={!selection || !schedule || !defaults}
          testID="schedule-edit"
        />
      </View>

      {selection && schedule && defaults ? (
        <ScheduleSheet
          key={sheetKey}
          visible={sheetOpen}
          from={selection.from}
          to={selection.to}
          initial={initialDraft(selection.from, schedule.slots, defaults)}
          saving={saving}
          error={saveError}
          conflicts={conflicts}
          cancellingId={cancellingId}
          onCancelBooking={(id) => void cancelConflict(id)}
          onSave={(draft) => void save(draft)}
          onClose={closeSheet}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    content: {
      gap: theme.spacing.md,
    },
    summary: {
      gap: theme.spacing.xs,
    },
    summaryTitle: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    line: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    footer: {
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
  });
