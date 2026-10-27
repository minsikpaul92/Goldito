import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Screen } from "../ui/Screen";
import { ActionRow } from "../ui/ActionRow";
import { asHat, ownedItems } from "../../features/pets/items";
import { savePetHat } from "../../features/pets/petApi";
import type { HatId } from "../../features/pets/sprites/hats";
import { asPetRecipe } from "../../features/pets/sprites/petLook";
import { asPixelColors } from "../../features/pets/sprites/photoColors";
import { useIsAdmin } from "../../lib/admins";
import { useToast } from "../../providers/ToastProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Pet } from "../../types/db";
import { OwnerPetRoom } from "./OwnerPetRoom";
import { PetMedals } from "./PetMedals";
import { PetReviews } from "./PetReviews";
import { PetWardrobe } from "./PetWardrobe";

/**
 * Owner Home, the Pet room tab (11.12; room trial R1+, Oct 27): one pet's room on one scroll in a fixed order, so
 * nothing hides behind a tab: the room and its story in words, the Wardrobe, two Action Rows, then the sitters' medals
 * and reviews. Which pet is picked by the pet chip in the tab row (Home owns `petId`). Tap the room: Diary.
 * The pet is a preset for its breed and weight (photo colors are set on the pet profile's Pixel pet card); admins also
 * get Change look. `onChanged` reloads the pets after a save.
 */
export function PetPage({ pets, petId, onChanged }: { pets: Pet[]; petId?: string; onChanged?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const admin = useIsAdmin();
  // The hat just put on or taken off, until the pets are reloaded.
  const [hats, setHats] = useState<Record<string, HatId | null>>({});
  const pet = pets.find((p) => p.id === petId) ?? pets[0];
  if (!pet) return null;
  const colors = asPixelColors(pet.profile?.pixel_colors);
  const hat = pet.id in hats ? hats[pet.id] : asHat(pet.profile?.hat);
  const look = { id: pet.id, name: pet.name, species: pet.species, coat: pet.profile?.coat, breed: pet.breed, weightKg: pet.weight_kg, colors, hat, look: asPetRecipe(pet.profile?.pixel_look) };

  const toggleHat = async (id: HatId) => {
    const next = hat === id ? null : id;
    setHats((prev) => ({ ...prev, [pet.id]: next }));
    try {
      await savePetHat(pet.id, next);
      onChanged?.();
    } catch (e) {
      setHats((prev) => ({ ...prev, [pet.id]: hat }));
      toast.show((e as Error).message, { tone: "error" });
    }
  };

  return (
    <Screen contentStyle={styles.page} testID="pet-page">
      <OwnerPetRoom key={pet.id} pet={look} onPress={() => router.push("/owner/feed?view=diary")} />
      <PetWardrobe items={ownedItems(pets.length)} worn={hat} onToggle={(id) => void toggleHat(id)} />
      {/* The Pet maker is for the team for now (11.12c); photo colors live on the pet profile's Pixel pet card. */}
      {admin ? (
        <View style={styles.actions}>
          <ActionRow icon="palette" title="Change look" subtitle="Breed, shape and colors" onPress={() => router.push(`/owner/pets/${pet.id}/look`)} testID="pet-look-open" />
        </View>
      ) : null}
      <PetMedals petId={pet.id} />
      <PetReviews petId={pet.id} />
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    page: { gap: 20 },
    actions: { gap: 10 },
  });
