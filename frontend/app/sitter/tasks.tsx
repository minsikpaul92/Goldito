import { router } from "expo-router";

import { BackLink } from "../../components/ui/BackLink";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { TodayTasks } from "../../components/TodayTasks";
import { useCaringPets } from "../../features/care/useCaringPets";

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/sitter"));

/** All of today's tasks for the pets in care (opened from Home). */
export default function SitterTasks() {
  const { state, reload } = useCaringPets();
  if (state.status === "loading") return <LoadingView />;
  if (state.status === "error") {
    return (
      <Screen>
        <BackLink onPress={goBack} testID="tasks-back" />
        <EmptyState
          emoji="🐾"
          title="Couldn't load tasks"
          message={state.message}
          action={{ label: "Try again", onPress: () => void reload() }}
        />
      </Screen>
    );
  }
  if (state.pets.length === 0) {
    return (
      <Screen>
        <BackLink onPress={goBack} testID="tasks-back" />
        <EmptyState emoji="🐾" title="No pets in your care right now" message="Tasks show up here while a stay is on." />
      </Screen>
    );
  }
  return (
    <Screen testID="sitter-tasks-screen">
      <BackLink onPress={goBack} testID="tasks-back" />
      <TodayTasks pets={state.pets.map((p) => ({ id: p.id, name: p.name, ownerName: p.ownerName }))} />
    </Screen>
  );
}
