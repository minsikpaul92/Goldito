import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { ReportComposer } from "../../../components/ReportComposer";
import { useCaringPets } from "../../../features/care/useCaringPets";

/**
 * Sitter Diary (D47b): the evening note — chips from the day, an optional short note, a preview the sitter
 * edits and approves (phase-07 7.3). One card per pet in care.
 */
export default function SitterDiary() {
  const { state, reload } = useCaringPets();
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
  if (state.pets.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="📔"
          title="Diary"
          message="When you're caring for a pet, you can write and send the evening note from here."
        />
      </Screen>
    );
  }
  return (
    <Screen testID="sitter-diary-screen" contentStyle={{ gap: 12 }}>
      {state.pets.map((pet) => (
        <ReportComposer key={pet.id} pet={pet} />
      ))}
    </Screen>
  );
}
