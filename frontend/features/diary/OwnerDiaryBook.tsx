import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { useNotifications } from "../../providers/NotificationsProvider";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { useMyPets } from "../pets/useMyPets";
import { DiaryBook } from "./DiaryBook";
import { OwnerEntrySheet } from "./OwnerEntrySheet";
import { PageActions } from "./PageActions";
import { SentReport, listBookPages } from "./reportApi";

/**
 * The owner's diary book (Diary book DB.3): every page the sitters sent about their pets, all or one pet, oldest →
 * newest, opening on the newest (or on `initialId` — a notice, a Feed card). Each page says who wrote it and the
 * day's tasks. The owner can write a page of their own too (014p, #186) and add their own stickers (12.3b).
 */
export function OwnerDiaryBook({ initialId }: { initialId?: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const { pets } = useMyPets();
  const [pages, setPages] = useState<SentReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  // A page just written: the book opens on it.
  const [written, setWritten] = useState<string | null>(null);
  const session = useSession();
  const { diaryRevision } = useNotifications();
  const me = session.status === "signedIn" ? session.profile.id : null;
  const openId = written ?? initialId ?? null;

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
  // A sitter just sent a page: look again, no spinner (the reader keeps their place).
  useEffect(() => {
    if (diaryRevision > 0) void load();
  }, [diaryRevision, load]);

  if (!pages && !error) return <LoadingView />;
  if (error && !pages) {
    return (
      <Screen>
        <EmptyState emoji="📔" title="Couldn't load the diary" message={error} action={{ label: "Try again", onPress: () => void load() }} />
      </Screen>
    );
  }
  const write = pets.length > 0 ? <Button label="Write a page" variant="secondary" onPress={() => setWriting(true)} testID="diary-write" /> : null;
  const sheet = (
    <OwnerEntrySheet
      visible={writing}
      pets={pets}
      onClose={() => setWriting(false)}
      onSaved={(reportId) => {
        setWriting(false);
        // Open on the new page only once the book holds it.
        void load().then(() => setWritten(reportId));
      }}
    />
  );
  if (!pages || pages.length === 0) {
    return (
      <Screen testID="owner-diary-screen" contentStyle={{ gap: 12 }} scrollbar>
        <EmptyState
          emoji="📔"
          title="No diary yet"
          message="When a stay is on, updates show up here live. Everything your sitter did is in History."
          action={{ label: "Open History", onPress: () => router.push("/owner/history") }}
        />
        {write}
        {sheet}
      </Screen>
    );
  }
  return (
    <Screen testID="owner-diary-screen" contentStyle={{ gap: 12 }} scrollbar>
      {write}
      <DiaryBook
        key={openId ?? "book"}
        pages={pages}
        initialId={openId}
        testID="diary-entry"
        footer={(page) => (
          <View style={styles.footer}>
            {page.authorId === me ? (
              <>
                <Text style={styles.meta}>Your page</Text>
                <PageActions reportId={page.id} action="delete" onDone={() => void load()} />
              </>
            ) : (
              <>
                <Text style={styles.meta}>{`From ${page.sitterName}`}</Text>
                {page.tasks.map((t, i) => (
                  <Text key={`${i}-${t.title}`} style={styles.task}>
                    {`${t.status === "done" ? "✓" : "✗"} ${t.title}${t.status === "done" ? "" : " · missed"}`}
                  </Text>
                ))}
                <PageActions reportId={page.id} action="hide" other={page.sitterName} onDone={() => void load()} />
              </>
            )}
          </View>
        )}
      />
      {sheet}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    footer: { gap: 2, paddingHorizontal: theme.spacing.xs },
    meta: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    task: { fontSize: theme.fontSize.body, color: theme.color.text },
  });
