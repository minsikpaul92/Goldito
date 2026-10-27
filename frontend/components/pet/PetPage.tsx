import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "../ui/Screen";
import { Icon, IconName } from "../ui/Icon";
import { asHat, ownedItems } from "../../features/pets/items";
import { savePetHat } from "../../features/pets/petApi";
import type { HatId } from "../../features/pets/sprites/hats";
import { asPetRecipe } from "../../features/pets/sprites/petLook";
import { asPixelColors } from "../../features/pets/sprites/photoColors";
import { useToast } from "../../providers/ToastProvider";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import type { Pet } from "../../types/db";
import { OwnerPetRoom } from "./OwnerPetRoom";
import { PetColorsSheet } from "./PetColorsSheet";
import { PetMedals } from "./PetMedals";
import { PetReviews } from "./PetReviews";
import { PetWardrobe } from "./PetWardrobe";

/**
 * Owner Home, the Pet room tab (11.12; room trial R1+, Oct 27): one pet's room on one scroll in a fixed order, so
 * nothing hides behind a tab: the room and its story in words, the Wardrobe, two Action Rows, then the sitters' medals
 * and reviews. Which pet is picked by the pet chip in the tab row (Home owns `petId`).
 * The pet is a preset for its breed and weight; "Match colors from a photo" paints it in the photo's colors (PS.3), and
 * `onChanged` reloads the pets after a save.
 */
export function PetPage({ pets, petId, onChanged }: { pets: Pet[]; petId?: string; onChanged?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const [making, setMaking] = useState(false);
  const toast = useToast();
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
      <OwnerPetRoom key={pet.id} pet={look} />
      <PetWardrobe items={ownedItems(pets.length)} worn={hat} onToggle={(id) => void toggleHat(id)} />
      <View style={styles.actions}>
        <ActionRow icon="palette" title="Change look" subtitle="Breed, shape and colors" onPress={() => router.push(`/owner/pets/${pet.id}/look`)} testID="pet-look-open" />
        {/* A saved look wins over photo colors, so matching colors only shows while there is none. */}
        {look.look ? null : (
          <ActionRow icon="camera" title="Match colors from a photo" subtitle={`Use a photo of ${pet.name}`} onPress={() => setMaking(true)} testID="pet-colors-open" />
        )}
      </View>
      <PetColorsSheet visible={making} onClose={() => setMaking(false)} pet={look} onSaved={() => onChanged?.()} />
      <PetMedals petId={pet.id} />
      <PetReviews petId={pet.id} />
    </Screen>
  );
}

/** DESIGN.md §6 Action Row: a 60 px row with an icon tile, a title and a line under it, and a chevron. */
function ActionRow({ icon, title, subtitle, onPress, testID }: { icon: IconName; title: string; subtitle: string; onPress: () => void; testID?: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityHint={subtitle} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} testID={testID}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={20} color={theme.color.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      <Icon name="forward" size={20} color={theme.color.text} />
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    page: { gap: 20 },
    actions: { gap: 10 },
    row: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    pressed: { opacity: 0.85 },
    rowIcon: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.accent },
    rowText: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: theme.fontSize.body, lineHeight: theme.lineHeight.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    rowSub: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, color: theme.color.textMuted },
  });
