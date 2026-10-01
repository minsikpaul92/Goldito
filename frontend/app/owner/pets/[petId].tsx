import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { PetForm } from "../../../components/PetForm";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { getPet, updatePet } from "../../../features/pets/petApi";
import { petToFormValues } from "../../../features/pets/petValidation";
import { useToast } from "../../../providers/ToastProvider";
import { Pet } from "../../../types/db";

type State = { status: "loading" } | { status: "ready"; pet: Pet } | { status: "missing" } | { status: "error"; error: string };

export default function PetProfileScreen() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const toast = useToast();
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const pet = await getPet(petId);
      setState(pet ? { status: "ready", pet } : { status: "missing" });
    } catch (error) {
      setState({ status: "error", error: (error as Error).message });
    }
  }, [petId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") return <LoadingView />;
  if (state.status !== "ready") {
    return (
      <Screen>
        <EmptyState
          emoji="🐾"
          title={state.status === "missing" ? "Pet not found" : "Couldn't load this pet"}
          message={state.status === "error" ? state.error : "It may have been removed."}
          action={
            state.status === "error"
              ? { label: "Try again", onPress: () => void load() }
              : { label: "Back to my pets", onPress: () => router.replace("/owner") }
          }
        />
      </Screen>
    );
  }

  const { pet } = state;
  return (
    <Screen>
      <Stack.Screen options={{ title: pet.name }} />
      <PetForm
        key={pet.id}
        initial={petToFormValues(pet)}
        editing
        submitLabel="Save"
        onSubmit={async (input) => {
          await updatePet(pet, input);
          toast.show(`Saved ${input.name}'s profile`);
          router.back();
        }}
      />
    </Screen>
  );
}
