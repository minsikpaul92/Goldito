import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { SitterActions } from "../../../../../components/SitterActions";
import { SlotRows, dayTitle, isOpen } from "../../../../../components/SlotRows";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../../components/ui/LoadingView";
import { Screen } from "../../../../../components/ui/Screen";
import { shortTime } from "../../../../../features/schedule/dates";
import { DaySlot, SLOTS, loadSitterMonth, slotKey } from "../../../../../features/schedule/scheduleApi";
import { SitterProfileView, getSitterProfile } from "../../../../../features/sitters/sitterApi";
import { useThemedStyles } from "../../../../../providers/ThemeProvider";
import { Theme } from "../../../../../theme/themes";

/** #120 (D): one day of a sitter's schedule as big rows, with Ask and Book. Back returns where it came from. */
export default function SitterDayScreen() {
  const styles = useThemedStyles(makeStyles);
  const { sitterId, date } = useLocalSearchParams<{ sitterId: string; date: string }>();
  const [sitter, setSitter] = useState<SitterProfileView | null | undefined>(undefined);
  const [slots, setSlots] = useState<Map<string, DaySlot> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sitterId) void getSitterProfile(sitterId).then(setSitter).catch(() => setSitter(null));
  }, [sitterId]);

  const load = useCallback(async () => {
    if (!sitterId || !date) return;
    setError(null);
    try {
      setSlots(await loadSitterMonth(sitterId, date, date));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [sitterId, date]);
  useEffect(() => {
    void load();
  }, [load]);

  if (sitter === undefined || (!slots && !error)) return <LoadingView />;
  if (sitter === null || !date) {
    return (
      <Screen>
        <EmptyState emoji="🔍" title="Sitter not found" message="This sitter may have left Goldito." />
      </Screen>
    );
  }

  // Book starts at the first open slot of the day.
  const first = slots ? SLOTS.map(({ slot }) => slots.get(slotKey(date, slot))).find((s) => isOpen(s) && s?.startsAt) : undefined;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: dayTitle(date) }} />
      <Screen contentStyle={styles.content}>
        {error ? (
          <EmptyState emoji="📅" title="Couldn't load this day" message={error} action={{ label: "Try again", onPress: () => void load() }} />
        ) : (
          <SlotRows day={date} slots={slots!} />
        )}
      </Screen>
      <SitterActions sitter={sitter} day={date} dropTime={first?.startsAt ? shortTime(first.startsAt) : undefined} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    content: { gap: theme.spacing.md },
  });
