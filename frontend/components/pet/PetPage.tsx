import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "../ui/Screen";
import { TextButton } from "../ui/TextButton";
import { asHat, itemName, ownedItems } from "../../features/pets/items";
import { savePetHat } from "../../features/pets/petApi";
import type { HatId } from "../../features/pets/sprites/hats";
import { asPetRecipe } from "../../features/pets/sprites/petLook";
import { asPixelColors } from "../../features/pets/sprites/photoColors";
import { useToast } from "../../providers/ToastProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Pet } from "../../types/db";
import { PetMedals } from "./PetMedals";
import { PetReviews } from "./PetReviews";
import { PetRoom } from "./PetRoom";
import { PetColorsSheet } from "./PetColorsSheet";

/**
 * Owner Home, page two (11.12): the pet room of one pet, with a switch when there are several. Tap the pet: Diary.
 * The pet is a preset for its breed and weight; "Match colors from photo" paints it in the photo's colors (PS.3), and
 * `onChanged` reloads the pets after a save.
 */
export function PetPage({ pets, onChanged }: { pets: Pet[]; onChanged?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const [selected, setSelected] = useState(pets[0]?.id);
  const [making, setMaking] = useState(false);
  const toast = useToast();
  // The hat just put on or taken off, until the pets are reloaded.
  const [hats, setHats] = useState<Record<string, HatId | null>>({});
  const pet = pets.find((p) => p.id === selected) ?? pets[0];
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
      {pets.length > 1 ? (
        <View style={styles.switcher}>
          {pets.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{ selected: p.id === pet.id }}
              onPress={() => setSelected(p.id)}
              style={[styles.pill, p.id === pet.id && styles.pillOn]}
              testID={`pet-switch-${p.name}`}
            >
              <Text style={[styles.pillText, p.id === pet.id && styles.pillTextOn]}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <PetRoom
        pet={look}
        onPress={() => router.push("/owner/feed?view=diary")}
      />
      <View style={styles.wardrobe}>
        {ownedItems(pets.length).map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${itemName(item)} ${hat === item.id ? "on" : "off"}`}
            aria-pressed={hat === item.id}
            onPress={() => void toggleHat(item.id)}
            style={[styles.pill, hat === item.id && styles.pillOn]}
            testID={`pet-hat-${item.id}`}
          >
            <Text style={[styles.pillText, hat === item.id && styles.pillTextOn]}>{`${item.emoji} ${itemName(item)}`}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        <TextButton label="Change look" onPress={() => router.push(`/owner/pets/${pet.id}/look`)} testID="pet-look-open" />
        {/* A saved look wins over photo colors, so matching colors only shows while there is none. */}
        {look.look ? null : <TextButton label="Match colors from photo" onPress={() => setMaking(true)} testID="pet-colors-open" />}
      </View>
      <PetColorsSheet
        visible={making}
        onClose={() => setMaking(false)}
        pet={look}
        onSaved={() => onChanged?.()}
      />
      <PetMedals petId={pet.id} />
      <PetReviews petId={pet.id} />
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    page: { gap: theme.spacing.md },
    actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: theme.spacing.md },
    wardrobe: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: theme.spacing.sm },
    switcher: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: theme.spacing.sm },
    pill: {
      minHeight: theme.layout.touchTarget,
      paddingHorizontal: theme.spacing.md,
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    pillOn: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
    pillText: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    pillTextOn: { color: theme.color.primaryText },
  });
