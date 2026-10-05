import { Stack, router, useLocalSearchParams } from "expo-router";

import { QuickCheckIn } from "../../../components/QuickCheckIn";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { useCaringPets } from "../../../features/care/useCaringPets";

/** One pet's 5-second check-in (opened from the pet chips on Home). */
export default function SitterCheckin() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const { state, reload } = useCaringPets();
  if (state.status === "loading") return <LoadingView />;
  const pet = state.status === "ready" ? state.pets.find((p) => p.id === petId) : undefined;
  if (!pet) {
    return (
      <Screen>
        <EmptyState
          emoji="🐾"
          title={state.status === "error" ? "Couldn't load this pet" : "Not in your care right now"}
          message={state.status === "error" ? state.message : "Check-ins open while the stay is on."}
          action={state.status === "error" ? { label: "Try again", onPress: () => void reload() } : undefined}
        />
      </Screen>
    );
  }
  return (
    <Screen testID="sitter-checkin-screen">
      <Stack.Screen options={{ title: `${pet.name} · Check-in` }} />
      <QuickCheckIn pet={pet} />
      <Button
        label={`📸 Photos of ${pet.name}`}
        variant="secondary"
        onPress={() => router.push(`/sitter/feed/${pet.id}`)}
        testID="checkin-photos"
        style={{ marginTop: 12 }}
      />
    </Screen>
  );
}
