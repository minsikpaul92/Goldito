import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DiaryTimeline } from "../../components/DiaryTimeline";
import { PetFace } from "../../components/PetFace";
import { BackLink } from "../../components/ui/BackLink";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { DIARY_DAYS, DiaryEntry, listDiary } from "../../features/diary/diaryApi";
import { useMyPets } from "../../features/pets/useMyPets";
import { useNotifications } from "../../providers/NotificationsProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/owner"));

type State =
  | { status: "loading" }
  | { status: "ready"; entries: DiaryEntry[] }
  | { status: "error"; message: string };

/**
 * Owner History (was the Diary timeline, phase-06 6.11): the full record, kept even after the live
 * notices are dismissed from Home.  what the sitter did, newest first — finished tasks (and
 * missed ones, ⚠️), 5-second check-ins with their memo, shared photos — for today and the last
 * 7 days. It refreshes by itself when a notice arrives (Realtime). Read-only; a photo is shown
 * once even when it is also in Feed.
 */
export default function OwnerHistory() {
  const styles = useThemedStyles(makeStyles);
  const { diaryRevision } = useNotifications();
  const { status: petsStatus, pets, error: petsError, reload: reloadPets } = useMyPets();
  // A notice opens this screen on the pet it is about (`?pet=`).
  const { pet: petParam, entry: entryParam } = useLocalSearchParams<{ pet?: string; entry?: string }>();
  const [petId, setPetId] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (pets.length === 0) {
      setPetId(null);
      return;
    }
    const wanted = petParam && pets.some((p) => p.id === petParam) ? petParam : null;
    setPetId((current) => wanted ?? (current && pets.some((p) => p.id === current) ? current : pets[0].id));
  }, [pets, petParam]);

  const load = useCallback(
    async (soft = false) => {
      if (!petId) return;
      if (!soft) setState({ status: "loading" });
      try {
        setState({ status: "ready", entries: await listDiary(petId) });
      } catch (error) {
        setState((prev) =>
          soft && prev.status === "ready" ? prev : { status: "error", message: (error as Error).message },
        );
      }
    },
    [petId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // A task / check-in / photo notice arrived — refresh quietly (no spinner).
  useEffect(() => {
    if (diaryRevision > 0) void load(true);
  }, [diaryRevision, load]);

  if (petsStatus === "loading" && pets.length === 0) return <LoadingView />;
  if (petsStatus === "error" && pets.length === 0) {
    return (
      <Screen>
        <BackLink onPress={goBack} testID="history-back" />
        <EmptyState
          emoji="🕘"
          title="Couldn't load your pets"
          message={petsError ?? "Try again."}
          action={{ label: "Try again", onPress: () => void reloadPets() }}
        />
      </Screen>
    );
  }
  if (pets.length === 0) {
    return (
      <Screen>
        <BackLink onPress={goBack} testID="history-back" />
        <EmptyState emoji="🐾" title="No pets yet" message="Add a pet on Home first." />
      </Screen>
    );
  }

  // Who did it: the sitter on the newest row ("What Chloe did"), else a plain "your sitter".
  const sitter = state.status === "ready" ? state.entries.find((e) => e.by && e.by !== "Your sitter")?.by : undefined;

  return (
    <Screen contentStyle={styles.content}>
      <BackLink onPress={goBack} testID="history-back" />
      <ScreenHeader title="History" subtitle={`What ${sitter ?? "your sitter"} did · today and the last ${DIARY_DAYS} days`} />
      {pets.length > 1 ? (
        <View style={styles.chips} accessibilityRole="radiogroup" testID="diary-pet">
          {pets.slice(0, 4).map((p) => {
            const on = p.id === petId;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setPetId(p.id)}
                style={[styles.chip, on && styles.chipOn]}
                testID={`diary-pet-${p.id}`}
              >
                <PetFace pet={{ species: p.species }} size={28} />
                <Text style={styles.chipLabel}>{p.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {state.status === "loading" ? <LoadingView /> : null}
      {state.status === "error" ? (
        <EmptyState
          emoji="🕘"
          title="Couldn't load the diary"
          message={state.message}
          action={{ label: "Try again", onPress: () => void load() }}
        />
      ) : null}
      {state.status === "ready" && state.entries.length === 0 ? (
        <EmptyState
          emoji="🕘"
          title="No history yet"
          message={`What your sitter does during a stay is kept here. Showing today and the last ${DIARY_DAYS} days.`}
        />
      ) : null}

      {state.status === "ready" ? <DiaryTimeline entries={state.entries} openId={entryParam} /> : null}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    // A pet chip: its face and name; the one shown is mint with an ink edge (DESIGN.md chips).
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs + 2,
      minHeight: 44,
      paddingLeft: theme.spacing.xs + 2,
      paddingRight: theme.spacing.sm + 4,
      borderRadius: theme.ui.radius.chip,
      borderWidth: 1.5,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    chipOn: { borderWidth: 2, borderColor: theme.color.text, backgroundColor: theme.color.accent },
    chipLabel: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.text },
  });
