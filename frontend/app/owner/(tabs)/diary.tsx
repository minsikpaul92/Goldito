import { useCallback, useEffect, useState } from "react";
import { StyleSheet } from "react-native";

import { DiaryTimeline } from "../../../components/DiaryTimeline";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { DIARY_DAYS, DiaryEntry, listDiary } from "../../../features/diary/diaryApi";
import { useMyPets } from "../../../features/pets/useMyPets";
import { useNotifications } from "../../../providers/NotificationsProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

type State =
  | { status: "loading" }
  | { status: "ready"; entries: DiaryEntry[] }
  | { status: "error"; message: string };

/**
 * Owner Diary (phase-06 6.11, D47): what the sitter did, newest first — finished tasks (and
 * missed ones, ⚠️), 5-second check-ins with their memo, shared photos — for today and the last
 * 7 days. It refreshes by itself when a notice arrives (Realtime). Read-only; a photo is shown
 * once even when it is also in Feed.
 */
export default function OwnerDiary() {
  const styles = useThemedStyles(makeStyles);
  const { diaryRevision } = useNotifications();
  const { status: petsStatus, pets, error: petsError, reload: reloadPets } = useMyPets();
  const [petId, setPetId] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (pets.length === 0) {
      setPetId(null);
      return;
    }
    setPetId((current) => (current && pets.some((p) => p.id === current) ? current : pets[0].id));
  }, [pets]);

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
        <EmptyState
          emoji="📔"
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
        <EmptyState emoji="🐾" title="No pets yet" message="Add a pet on Home — then your sitter's updates show up here." />
      </Screen>
    );
  }

  const petOptions = pets.slice(0, 4).map((p) => ({ value: p.id, label: p.name }));

  return (
    <Screen contentStyle={styles.content}>
      {petOptions.length > 1 ? (
        <SegmentedControl options={petOptions} value={petId} onChange={setPetId} testID="diary-pet" />
      ) : null}

      {state.status === "loading" ? <LoadingView /> : null}
      {state.status === "error" ? (
        <EmptyState
          emoji="📔"
          title="Couldn't load the diary"
          message={state.message}
          action={{ label: "Try again", onPress: () => void load() }}
        />
      ) : null}
      {state.status === "ready" && state.entries.length === 0 ? (
        <EmptyState
          emoji="📔"
          title="No diary yet"
          message={`When a stay is on, updates show up here live. Showing today and the last ${DIARY_DAYS} days.`}
        />
      ) : null}

      {state.status === "ready" ? <DiaryTimeline entries={state.entries} /> : null}
    </Screen>
  );
}

const makeStyles = (theme: Theme) => StyleSheet.create({ content: { gap: theme.spacing.md } });
