import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ALL_PETS, FeedPetPicker } from "../../components/FeedPetPicker";
import { FeedBarRight } from "../../components/FeedSwitch";
import { BackLink } from "../../components/ui/BackLink";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { useNotifications } from "../../providers/NotificationsProvider";
import { useSession } from "../../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { usePetFaces } from "../feed/usePetFaces";
import { useMyPets } from "../pets/useMyPets";
import { DiaryBook } from "./DiaryBook";
import { OwnerEntrySheet } from "./OwnerEntrySheet";
import { PageActions } from "./PageActions";
import { SentReport, listBookPages } from "./reportApi";

/**
 * The owner's diary book (Diary book DB.3): every page the sitters sent about their pets, all or one pet, oldest →
 * newest, opening on the newest (or on `initialId` — a notice, a Feed card). Above each page, who wrote it and when;
 * under it, the day's tasks. The owner can write a page of their own too (014p, #186) and add their own stickers (12.3b).
 * `linked`: the screen a chat card opens on one page. Its header ← is the way out, so no "‹ Diaries" and no Write a
 * page there (diary audit, Oct 27: one Back per screen).
 */
export function OwnerDiaryBook({ initialId, linked = false }: { initialId?: string | null; linked?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { pets } = useMyPets();
  const [pages, setPages] = useState<SentReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  // The pet dropdown next to Photos / Diary: All pets (the covers) or one pet's pages.
  const [petSel, setPetSel] = useState<string>(ALL_PETS);
  const faces = usePetFaces(pets.map((p) => p.id));
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
  const picker = !linked ? (
    <FeedBarRight signature={`${petSel}|${pets.map((p) => p.id).join(",")}|${JSON.stringify(faces)}`}>
      <FeedPetPicker groups={[{ key: "mine", pets }]} allPets={pets} value={petSel} onChange={setPetSel} faces={faces} testID="diary-pet" />
    </FeedBarRight>
  ) : null;
  // ← (one pet's pages back to the covers) sits left of Write a page: the one Back control, no "‹ Diaries" (DESIGN.md §7.8).
  const back = !linked && petSel !== ALL_PETS ? <BackLink onPress={() => setPetSel(ALL_PETS)} testID="diary-entry-covers" /> : null;
  const writeButton = pets.length > 0 && !linked ? <Button label="Write a page" variant="secondary" onPress={() => setWriting(true)} testID="diary-write" style={styles.writeFill} /> : null;
  const write =
    back || writeButton ? (
      <View style={styles.writeRow}>
        {back}
        {writeButton}
      </View>
    ) : null;
  const sheet = (
    <OwnerEntrySheet
      visible={writing}
      pets={pets}
      initialPetId={petSel === ALL_PETS ? null : petSel}
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
        {picker}
        <EmptyState
          emoji="📔"
          title="No diary yet"
          message="Your sitter's pages show up here during a stay, one for each day."
        />
        {write}
        {sheet}
      </Screen>
    );
  }
  return (
    <Screen testID="owner-diary-screen" contentStyle={{ gap: 12 }} scrollbar>
      {picker}
      {write}
      <DiaryBook
        selectedPet={petSel === ALL_PETS ? null : petSel}
        onPetChange={(id) => setPetSel(id ?? ALL_PETS)}
        key={openId ?? "book"}
        pages={pages}
        initialId={openId}
        testID="diary-entry"
        header={(page) => {
          const mine = page.authorId === me;
          const time = page.sentAt ? new Date(page.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
          return (
            // The photo viewer's meta line (small, muted), above the page instead of under it.
            <Text style={styles.byline} testID={`diary-byline-${page.id}`}>
              {[mine ? "Your page" : `From ${page.sitterName}`, time].filter(Boolean).join(" · ")}
            </Text>
          );
        }}
        footer={(page) => (
          <View style={styles.footer}>
            {page.authorId === me ? (
              <PageActions reportId={page.id} action="delete" onDone={() => void load()} />
            ) : (
              <>
                {page.tasks.length > 0 ? (
                  <View style={styles.tasks} testID={`diary-tasks-${page.id}`}>
                    <Text style={styles.tasksTitle}>{`What ${page.sitterName} did · ${page.tasks.filter((t) => t.status === "done").length} of ${page.tasks.length}`}</Text>
                    {page.tasks.map((t, i) => {
                      const done = t.status === "done";
                      return (
                        <View key={`${i}-${t.title}`} style={[styles.task, i > 0 && styles.taskLine]}>
                          {/* TodayTasks' done list: a green ✓; a missed task gets an empty circle and says so. */}
                          {done ? <Icon name="check" size={18} strokeWidth={2.5} color={theme.color.success} /> : <View style={styles.missed} />}
                          <Text style={styles.taskTitle}>{t.title}</Text>
                          {done ? null : <Text style={styles.taskEnd}>Missed</Text>}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
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
    // Who wrote the page, above it: the photo viewer's meta line.
    byline: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.textMuted, paddingHorizontal: theme.spacing.xs, paddingBottom: theme.spacing.xs },
    footer: { gap: theme.spacing.sm, paddingTop: theme.spacing.xs },
    writeRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    writeFill: { flex: 1 },
    // The day's tasks in a card, like TodayTasks' "Done today".
    tasks: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, paddingTop: theme.spacing.sm, overflow: "hidden" },
    tasksTitle: {
      fontSize: theme.fontSize.caption,
      lineHeight: theme.lineHeight.caption,
      fontWeight: theme.fontWeight.bold,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: theme.color.textMuted,
      paddingHorizontal: theme.spacing.md,
    },
    task: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: theme.layout.touchTarget, paddingHorizontal: theme.spacing.md },
    taskLine: { borderTopWidth: 1, borderTopColor: theme.color.border },
    missed: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: theme.color.borderStrong },
    taskTitle: { flex: 1, fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.text },
    taskEnd: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
  });
