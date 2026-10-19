import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SitterActions } from "../../../../components/SitterActions";
import { SlotCalendar } from "../../../../components/SlotCalendar";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { addMonths, appToday, monthEnd, monthStart } from "../../../../features/schedule/dates";
import { DaySlot, loadSitterMonth } from "../../../../features/schedule/scheduleApi";
import { SitterProfileView, getSitterProfile } from "../../../../features/sitters/sitterApi";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { Theme } from "../../../../theme/themes";

/** #120 (D): the sitter's month on its own page. Tapping a day opens that day's page. */
export default function SitterCalendarScreen() {
  const styles = useThemedStyles(makeStyles);
  const { sitterId } = useLocalSearchParams<{ sitterId: string }>();
  const today = useMemo(() => appToday(), []);
  const [sitter, setSitter] = useState<SitterProfileView | null | undefined>(undefined);
  const [month, setMonth] = useState(() => monthStart(today));
  const [slots, setSlots] = useState<Map<string, DaySlot> | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <EmptyState emoji="🔍" title="Sitter not found" message="This sitter may have left Goldito." />
      </Screen>
    );
  }

  const changeMonth = (n: number) => {
    setSlots(null);
    setMonth((m) => addMonths(m, n));
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: `${sitter.displayName}'s calendar` }} />
      <Screen contentStyle={styles.content}>
        <SlotCalendar
          month={month}
          today={today}
          slots={slots ?? new Map()}
          selection={null}
          onSelectDay={(day) => router.push(`/owner/sitters/${sitter.id}/day/${day}`)}
          onPrevMonth={() => changeMonth(-1)}
          onNextMonth={() => changeMonth(1)}
          canGoPrev={month > monthStart(today)}
        />
        {error ? (
          <EmptyState emoji="📅" title="Couldn't load the schedule" message={error} action={{ label: "Try again", onPress: () => void load() }} />
        ) : (
          <Text style={styles.note}>Tap a day to see its hours.</Text>
        )}
      </Screen>
      <SitterActions sitter={sitter} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    content: { gap: theme.spacing.md },
    note: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
