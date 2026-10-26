import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "../ui/Screen";
import { asHat, itemName, ownedItems } from "../../features/pets/items";
import { savePetHat } from "../../features/pets/petApi";
import type { HatId } from "../../features/pets/sprites/hats";
import { asPetRecipe } from "../../features/pets/sprites/petLook";
import { asPixelColors } from "../../features/pets/sprites/photoColors";
import { useIsAdmin } from "../../lib/admins";
import { useToast } from "../../providers/ToastProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Pet } from "../../types/db";
import { PetMedals } from "./PetMedals";
import { PetReviews } from "./PetReviews";
import { PetRoom } from "./PetRoom";


/**
 * Owner Home, page two (11.12): the pet room of one pet, with a switch when there are several. Tap the pet: Diary.
 * The pet's look follows its profile (breed, coat, weight, photo colors; set on the pet profile). Under the room is the
 * Wardrobe (the hat now, more items later); admins also get Edit look. `onChanged` reloads the pets after a save.
 */
export function PetPage({ pets, onChanged }: { pets: Pet[]; onChanged?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const [selected, setSelected] = useState(pets[0]?.id);
  const toast = useToast();
  const admin = useIsAdmin();
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
      <Text style={styles.label}>Wardrobe</Text>
      <View style={styles.wardrobe} testID="pet-wardrobe">
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
        <View accessibilityLabel="More items coming soon" aria-disabled style={[styles.pill, styles.pillLocked]} testID="pet-wardrobe-soon">
          <Text style={[styles.pillText, styles.pillTextLocked]}>🔒 More soon</Text>
        </View>
        {admin ? (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/owner/pets/${pet.id}/look`)} style={styles.pill} testID="pet-look-open">
            <Text style={styles.pillText}>Edit look</Text>
          </Pressable>
        ) : null}
      </View>
      <PetMedals petId={pet.id} />
      <PetReviews petId={pet.id} />
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    page: { gap: theme.spacing.md },
    label: { textAlign: "center", fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
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
    pillLocked: { borderStyle: "dashed", backgroundColor: "transparent" },
    pillTextLocked: { color: theme.color.textMuted },
  });
