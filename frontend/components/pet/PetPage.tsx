import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "../ui/Screen";
import { TextButton } from "../ui/TextButton";
import { asPixelColors } from "../../features/pets/sprites/photoColors";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Pet } from "../../types/db";
import { PetMedals } from "./PetMedals";
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
  const pet = pets.find((p) => p.id === selected) ?? pets[0];
  if (!pet) return null;
  const colors = asPixelColors(pet.profile?.pixel_colors);
  const look = { id: pet.id, name: pet.name, species: pet.species, coat: pet.profile?.coat, breed: pet.breed, weightKg: pet.weight_kg, colors };

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
        onPress={() => router.push("/owner/diary")}
      />
      <TextButton label="🎨 Match colors from photo" onPress={() => setMaking(true)} style={styles.make} testID="pet-colors-open" />
      <PetColorsSheet
        visible={making}
        onClose={() => setMaking(false)}
        pet={look}
        onSaved={() => onChanged?.()}
      />
      <PetMedals petId={pet.id} />
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    page: { gap: theme.spacing.md },
    make: { alignSelf: "center" },
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
