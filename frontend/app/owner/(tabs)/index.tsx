import { router } from "expo-router";
import { useRef } from "react";

import { PetCard } from "../../../components/PetCard";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { Stack } from "../../../components/ui/Stack";
import { useMyPets } from "../../../features/pets/useMyPets";

/** Owner Home: my pets (phase-03 3.5). Today's summary and the pet room arrive later. */
export default function OwnerHome() {
  const { status, pets, error, reload } = useMyPets();
  const addPet = () => router.push("/owner/pets/new");
  // Pets already shown on this Home. A pet that appears later (just added) animates in once.
  const seen = useRef<Set<string> | null>(null);

  if (status === "loading" && pets.length === 0) return <LoadingView />;

  const firstLoad = seen.current === null;
  const isNew = (id: string) => !firstLoad && !seen.current?.has(id);
  const justAdded = new Set(pets.filter((pet) => isNew(pet.id)).map((pet) => pet.id));
  if (status === "ready") seen.current = new Set(pets.map((pet) => pet.id));

  if (status === "error" && pets.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="🐾"
          title="Couldn't load your pets"
          message={error ?? "Check your connection and try again."}
          action={{ label: "Try again", onPress: () => void reload() }}
        />
      </Screen>
    );
  }

  if (pets.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="🐶"
          title="No pets yet"
          message="Add your dog or cat to start getting care updates."
          action={{ label: "Add pet", onPress: addPet }}
        />
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label="Add pet" onPress={addPet} />}>
      <Stack gap="md">
        {pets.map((pet) => (
          <PetCard
            key={pet.id}
            pet={pet}
            justAdded={justAdded.has(pet.id)}
            onPress={() => router.push(`/owner/pets/${pet.id}`)}
          />
        ))}
      </Stack>
    </Screen>
  );
}
