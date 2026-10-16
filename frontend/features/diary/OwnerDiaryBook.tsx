import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { DiaryBook } from "./DiaryBook";
import { SentReport, listBookPages } from "./reportApi";

/**
 * The owner's diary book (Diary book DB.3): every page the sitters sent about their pets, all or one pet, oldest →
 * newest, opening on the newest (or on `initialId` — a notice, a Feed card). Each page says who wrote it and the
 * day's tasks. Read-only text; the owner may add their own stickers (12.3b).
 */
export function OwnerDiaryBook({ initialId }: { initialId?: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const [pages, setPages] = useState<SentReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPages(await listBookPages());
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

  if (!pages && !error) return <LoadingView />;
  if (error && !pages) {
    return (
      <Screen>
        <EmptyState emoji="📔" title="Couldn't load the diary" message={error} action={{ label: "Try again", onPress: () => void load() }} />
      </Screen>
    );
  }
  if (!pages || pages.length === 0) {
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
      <DiaryBook
        pages={pages}
        initialId={initialId}
        testID="diary-entry"
        footer={(page) => (
          <View style={styles.footer}>
            <Text style={styles.meta}>{`From ${page.sitterName}`}</Text>
            {page.tasks.map((t, i) => (
              <Text key={`${i}-${t.title}`} style={styles.task}>
                {`${t.status === "done" ? "✓" : "⚠️"} ${t.title}${t.status === "done" ? "" : " · missed"}`}
              </Text>
            ))}
          </View>
        )}
      />
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    footer: { gap: 2, paddingHorizontal: theme.spacing.xs },
    meta: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    task: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
