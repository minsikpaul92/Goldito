import { router } from "expo-router";

import { PetForm } from "../../../components/PetForm";
import { Screen } from "../../../components/ui/Screen";
import { createPet } from "../../../features/pets/petApi";
import { EMPTY_PET_FORM } from "../../../features/pets/petValidation";
import { useSession } from "../../../providers/SessionProvider";
import { useToast } from "../../../providers/ToastProvider";

export default function AddPetScreen() {
  const { profile } = useSession();
  const toast = useToast();

  return (
    <Screen>
      <PetForm
        initial={EMPTY_PET_FORM}
        editing={false}
        submitLabel="Add pet"
        onSubmit={async (input) => {
          if (!profile) return;
          await createPet(profile.id, input);
          toast.show(`${input.name} is added ${input.species === "dog" ? "🐶" : "🐱"}`);
          router.back();
        }}
      />
    </Screen>
  );
}
