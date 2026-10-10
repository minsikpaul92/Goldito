import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { SentReport, listSentReports, previewOf } from "../../../features/diary/reportApi";
import { formatDay } from "../../../features/schedule/dates";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

/**
 * Owner Diary tab (D47): the daily reports the sitter sent — newest first, one card each with the first
 * sentence. Live updates are on Home, and everything they did is in History.
 */
export default function OwnerDiary() {
  const styles = useThemedStyles(makeStyles);
  const [reports, setReports] = useState<SentReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReports(await listSentReports());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!reports && !error) return <LoadingView />;
  if (error && !reports) {
    return (
      <Screen>
        <EmptyState emoji="📔" title="Couldn't load the diary" message={error} action={{ label: "Try again", onPress: () => void load() }} />
      </Screen>
    );
  }
  if (!reports || reports.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="📔"
          title="No diary yet"
          message="When a stay is on, updates show up here live. Everything your sitter did is in History."
          action={{ label: "Open History", onPress: () => router.push("/owner/history") }}
        />
      </Screen>
    );
  }
  return (
    <Screen testID="owner-diary-screen" contentStyle={{ gap: 12 }}>
      {reports.map((r) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          onPress={() => router.push(`/owner/diary/${r.id}`)}
          testID={`diary-report-${r.id}`}
        >
          <Card style={styles.card}>
            <Text style={styles.meta}>{`${formatDay(r.day)} · ${r.petName} · ${r.sitterName}`}</Text>
            <Text style={styles.preview}>{previewOf(r.body)}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.xs },
    meta: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    preview: { fontSize: theme.fontSize.body, fontWeight: "600", color: theme.color.text },
  });
