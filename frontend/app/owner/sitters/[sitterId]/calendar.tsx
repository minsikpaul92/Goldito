import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { SitterActions } from "../../../../components/SitterActions";
import { SlotRows, dayTitle, isOpen } from "../../../../components/SlotRows";
import { StayParams, stayFromParams } from "../../../../features/sitters/stayParams";
import { SlotCalendar } from "../../../../components/SlotCalendar";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { addDays, addMonths, appToday, isoToZoned, monthEnd, monthStart, shortTime, zonedToIso } from "../../../../features/schedule/dates";
import { DaySlot, SLOTS, loadSitterMonth, slotKey } from "../../../../features/schedule/scheduleApi";
import { SitterProfileView, getSitterProfile } from "../../../../features/sitters/sitterApi";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { Theme } from "../../../../theme/themes";

/**
 * #120 (D): the sitter's month on its own page, and under it the hours of one day (#268: no second screen, no sheet). It
 * opens on the search's drop-off day (else today); a tap picks another day, and Start chat then carries that day.
 */
export default function SitterCalendarScreen() {
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ sitterId: string } & StayParams>();
  const { sitterId } = params;
  const today = useMemo(() => appToday(), []);
  const [sitter, setSitter] = useState<SitterProfileView | null | undefined>(undefined);
  // The day whose hours show under the month: the search's drop-off day, else today.
  const firstDay = useMemo(() => (params.drop ? isoToZoned(params.drop).day : today), [params.drop, today]);
  const [month, setMonth] = useState(() => monthStart(firstDay));
  const [slots, setSlots] = useState<Map<string, DaySlot> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(firstDay);
  /** A day the owner tapped: Start chat carries that day instead of the search's stay. */
  const [picked, setPicked] = useState(false);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    if (sitterId) void getSitterProfile(sitterId).then(setSitter).catch(() => setSitter(null));
  }, [sitterId]);

  const load = useCallback(async () => {
    if (!sitterId) return;
    setError(null);
    try {
      setSlots(await loadSitterMonth(sitterId, monthStart(month), monthEnd(month)));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sitterId, month]);
  useEffect(() => {
    void load();
  }, [load]);

  if (sitter === undefined) return <LoadingView />;
  if (sitter === null) {
    return (
      <Screen>
        <EmptyState icon="paw" title="Sitter not found" message="This sitter may have left Goldito." />
      </Screen>
    );
  }

  // Start chat from a day: the stay starts at the day's first open slot (as the old day page did).
  const first = day && slots ? SLOTS.map(({ slot }) => slots.get(slotKey(day, slot))).find((s) => isOpen(s) && s?.startsAt) : undefined;
  const dayStay = picked
    ? stayFromParams({
        pets: params.pets,
        drop: zonedToIso(day, first?.startsAt ? shortTime(first.startsAt) : "09:00"),
        pick: zonedToIso(addDays(day, 1), "17:00"),
      })
    : undefined;

  const changeMonth = (n: number) => {
    setSlots(null);
    setMonth((m) => addMonths(m, n));
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: `${sitter.displayName}'s calendar` }} />
      <Screen ref={scroller} contentStyle={styles.content}>
        <SlotCalendar
          month={month}
          today={today}
          slots={slots ?? new Map()}
          selection={{ from: day, to: day }}
          onSelectDay={(d) => {
            setDay(d);
            setPicked(true);
            // On a short screen the hours sit under the fold: bring them into view.
            setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50);
          }}
          onPrevMonth={() => changeMonth(-1)}
          onNextMonth={() => changeMonth(1)}
          canGoPrev={month > monthStart(today)}
        />
        {error ? (
          <EmptyState icon="calendar" title="Couldn't load the schedule" message={error} action={{ label: "Try again", onPress: () => void load() }} />
        ) : slots && monthStart(day) === month ? (
          <View style={styles.day} testID="sitter-day-hours">
            <Text accessibilityRole="header" style={styles.dayTitle}>
              {dayTitle(day)}
            </Text>
            <SlotRows day={day} slots={slots} />
          </View>
        ) : null}
      </Screen>
      <SitterActions sitter={sitter} stay={dayStay ?? stayFromParams(params)} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    content: { gap: theme.spacing.md },
    day: { gap: theme.spacing.sm },
    dayTitle: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
  });
