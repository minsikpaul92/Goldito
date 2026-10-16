import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { ReportComposer, type ReportStatus } from "../../../components/ReportComposer";
import { useCaringPets } from "../../../features/care/useCaringPets";
import { DiaryBook } from "../../../features/diary/DiaryBook";
import { SentReport, listBookPages } from "../../../features/diary/reportApi";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

const STATUS_LABEL: Record<NonNullable<ReportStatus>, string> = { sent: "Sent ✓", draft: "Draft" };

type View_ = "today" | "book";

/**
 * Sitter Diary (D47b · Diary book): **Today** — the page for each pet in care, written by hand or by Goldito from the
 * day's chips, checked and sent (phase-07 7.3; with more than one pet the sitter picks the pet first, FB-19, and each
 * composer keeps its page while switching). **Diary book** — every page this sitter sent, all pets they have cared
 * for or one, oldest → newest.
 */
export default function SitterDiary() {
  const styles = useThemedStyles(makeStyles);
  const { state, reload } = useCaringPets();
  const [selected, setSelected] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ReportStatus>>({});
  const caring = state.status === "ready" ? state.pets : [];
  const [view, setView] = useState<View_ | null>(null);
  // With nobody in care there is nothing to write today: open the book.
  const shownView: View_ = view ?? (state.status === "ready" && caring.length === 0 ? "book" : "today");
  const [pages, setPages] = useState<SentReport[] | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const onStatus = useCallback(
    (petId: string) => (status: ReportStatus) => setStatuses((prev) => (prev[petId] === status ? prev : { ...prev, [petId]: status })),
    [],
  );

  const loadBook = useCallback(async () => {
    try {
      setPages(await listBookPages());
      setBookError(null);
    } catch (e) {
      setBookError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void loadBook();
    }, [loadBook]),
  );
  // A page just sent belongs in the book right away.
  const sentCount = Object.values(statuses).filter((s) => s === "sent").length;
  useFocusEffect(
    useCallback(() => {
      if (sentCount > 0) void loadBook();
    }, [sentCount, loadBook]),
  );

  if (state.status === "loading") return <LoadingView />;
  if (state.status === "error") {
    return (
      <Screen>
        <EmptyState
          emoji="📔"
          title="Couldn't load your pets"
          message={state.message}
          action={{ label: "Try again", onPress: () => void reload() }}
        />
      </Screen>
    );
  }
  const current = caring.find((p) => p.id === selected) ?? caring[0];
  return (
    <Screen testID="sitter-diary-screen" contentStyle={{ gap: 12 }}>
      <SegmentedControl
        options={[
          { value: "today", label: "Today" },
          { value: "book", label: "Diary book" },
        ]}
        value={shownView}
        onChange={(v) => {
          setView(v);
          if (v === "book") void loadBook();
        }}
        testID="sitter-diary-view"
      />

      <View style={shownView === "today" ? styles.section : styles.hidden}>
        {caring.length === 0 ? (
          <EmptyState emoji="📔" title="Diary" message="When you're caring for a pet, you can write and send the day's page from here." />
        ) : null}
        {caring.length > 1 ? (
          <View style={styles.picker} accessibilityLabel="Whose page">
            {caring.map((pet) => {
              const on = pet.id === current?.id;
              const status = statuses[pet.id];
              return (
                <Pressable
                  key={pet.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${pet.name}${status ? `, ${STATUS_LABEL[status]}` : ""}`}
                  aria-pressed={on}
                  onPress={() => setSelected(pet.id)}
                  style={({ pressed }) => [styles.pet, on && styles.petOn, pressed && styles.pressed]}
                  testID={`diary-pet-${pet.id}`}
                >
                  <Text style={[styles.petName, on && styles.petNameOn]}>{pet.name}</Text>
                  {status ? <Text style={[styles.status, on && styles.petNameOn]}>{STATUS_LABEL[status]}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {caring.map((pet) => (
          // Every pet's composer stays mounted (its chips, lines and page survive switching); only the picked one shows.
          <View key={pet.id} style={pet.id === current?.id ? undefined : styles.hidden}>
            <ReportComposer pet={pet} onStatus={onStatus(pet.id)} />
          </View>
        ))}
      </View>

      {shownView === "book" ? (
        pages === null && !bookError ? (
          <LoadingView />
        ) : bookError && !pages ? (
          <EmptyState emoji="📔" title="Couldn't load the diary" message={bookError} action={{ label: "Try again", onPress: () => void loadBook() }} />
        ) : !pages || pages.length === 0 ? (
          <EmptyState emoji="📔" title="No pages yet" message="Every page you send collects here, one pet at a time or all together." />
        ) : (
          <DiaryBook pages={pages} testID="sitter-book" />
        )
      ) : null}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { gap: 12 },
    picker: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    pet: {
      minHeight: 44,
      paddingHorizontal: theme.spacing.md,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    petOn: { borderColor: theme.color.primary, backgroundColor: theme.color.accent },
    pressed: { opacity: 0.6 },
    petName: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.textMuted },
    petNameOn: { color: theme.color.primary },
    status: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    hidden: { display: "none" },
  });
