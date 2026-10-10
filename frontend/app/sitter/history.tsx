import { useCallback, useEffect, useState } from "react";

import { DiaryTimeline } from "../../components/DiaryTimeline";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { useCaringPets } from "../../features/care/useCaringPets";
import { DiaryEntry, listDiary, listMySentReports } from "../../features/diary/diaryApi";
import { useSession } from "../../providers/SessionProvider";

type State = { status: "loading" } | { status: "ready"; entries: DiaryEntry[] } | { status: "error"; message: string };

/**
 * What the sitter sent, for the pets in care, last 7 days — "did my tap go through?". Same rows the
 * owner sees in History, plus the daily reports they sent (FB-23), newest first.
 */
export default function SitterHistory() {
  const { state: caring } = useCaringPets();
  const { profile } = useSession();
  const sitterId = profile?.id;
  const [state, setState] = useState<State>({ status: "loading" });
  const pets = caring.status === "ready" ? caring.pets : null;

  const load = useCallback(async () => {
    if (!pets) return;
    try {
      const lists = await Promise.all(
        pets.map(async (p) => {
          const [entries, reports] = await Promise.all([listDiary(p.id), sitterId ? listMySentReports(p.id, sitterId) : []]);
          return [...entries, ...reports].map((e) => ({ ...e, petName: p.name }));
        }),
      );
      setState({ status: "ready", entries: lists.flat().sort((a, b) => b.at.localeCompare(a.at)) });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }, [pets, sitterId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (caring.status === "loading" || (pets && state.status === "loading")) return <LoadingView />;
  if (!pets || pets.length === 0) {
    return (
      <Screen>
        <EmptyState emoji="🕘" title="Nothing to show yet" message="What you send during a stay shows up here." />
      </Screen>
    );
  }
  return (
    <Screen contentStyle={{ gap: 16 }} testID="sitter-history-screen">
      {state.status === "error" ? (
        <EmptyState
          emoji="🕘"
          title="Couldn't load your history"
          message={state.message}
          action={{ label: "Try again", onPress: () => void load() }}
        />
      ) : null}
      {state.status === "ready" && state.entries.length === 0 ? (
        <EmptyState emoji="🕘" title="Nothing sent yet" message="Tasks you finish, check-ins and daily reports you send show up here." />
      ) : null}
      {state.status === "ready" ? <DiaryTimeline entries={state.entries} /> : null}
    </Screen>
  );
}
